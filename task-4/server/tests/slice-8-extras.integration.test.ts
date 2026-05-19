/**
 * Slice 8 — final-verification extras layered on top of the integration suite.
 *
 * Per the slice-8 AC, the ten-extras checklist + determinism harness must run
 * through `InMemoryTransport`. The implementation plan's handoff to slice 8
 * directs us to *deduplicate against the already-passing tests* — so only the
 * scenarios not yet covered by `mcp-server.integration.test.ts` live here:
 *
 *   - Forward-reference resolved (B-depends-on-A submitted before A).
 *   - Bottleneck 3-chain end-to-end through the MCP surface (the unit DP is
 *     already exercised by `bottleneck.test.ts`; this file proves the wire
 *     contract matches the unit invariants).
 *   - Determinism harness comparing scheduled placements (offsets, runway/gate
 *     assignment, predecessors, priority, operation, runway/gate windows) and
 *     unscheduled reasons across two passes. Wall-clock fields (`generated_at`,
 *     `schedule_start_at`, `start_at`, `end_at`) are excluded — they reflect
 *     when the pass ran, not what the pass produced.
 *
 * The other eight extras from the AC are pinned by tests already living in
 * `mcp-server.integration.test.ts`; the mapping (so a future reader doesn't
 * have to re-derive the dedup):
 *
 *   | AC bullet                              | Where it lives                                   |
 *   | -------------------------------------- | ------------------------------------------------ |
 *   | 1. Dependency cycle (A↔B)              | mcp-server.integration.test.ts L855 (Connecting Flight describe) |
 *   | 2. Forward reference resolved          | THIS FILE                                        |
 *   | 3. Forward reference unresolved        | mcp-server.integration.test.ts L793 (GHOST orphan) |
 *   | 4. Cancellation cascade A→B→C          | mcp-server.integration.test.ts L1074 (cancel_flight transitive) |
 *   | 5. Reset state + next submission_index | mcp-server.integration.test.ts L395 (reset_state flow) |
 *   | 6. Duplicate after cancel              | mcp-server.integration.test.ts L1112 (cancel_flight describe) |
 *   | 7. Self-dependency                     | mcp-server.integration.test.ts L184 (submit_flight describe) |
 *   | 8. Heavy Hauler with valid mix         | mcp-server.integration.test.ts L1707 (brief scenario) |
 *   | 9. Bottleneck trivial                  | mcp-server.integration.test.ts L1845 (analyze_bottleneck describe) |
 *   | 10. Bottleneck 3-chain                 | THIS FILE                                        |
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { AirportState } from "../src/airport-state.js";
import type { Config } from "../src/config.js";
import { createMcpServer } from "../src/mcp-server.js";

function makeConfig(): Config {
  return {
    runwayLengthsM: [2500, 3500],
    gateCount: 4,
    groundCrewCount: 2,
    landingDurationMin: 5,
    takeoffDurationMin: 4,
    gateTurnaroundMin: 30,
    separationTakeoffMin: 2,
    separationLandingMin: 2,
    separationMixedMin: 3,
    dependencyBufferMin: 15,
    maxHorizonMin: 240,
    defaultTimezone: "UTC",
  };
}

async function connectClient(): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const state = new AirportState(makeConfig());
  const server = createMcpServer(state);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "atc-slice-8-client", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

type ScheduleEntryShape = {
  flight_number: string;
  operation: "arrival" | "departure";
  priority: "high" | "medium" | "low";
  runway_id: string;
  gate_id: string;
  start_offset_min: number;
  end_offset_min: number;
  runway_window: { start_offset_min: number; end_offset_min: number };
  gate_window: { start_offset_min: number; end_offset_min: number };
  predecessors: string[];
};

type UnscheduledEntryShape = {
  flight_number: string;
  operation: "arrival" | "departure";
  priority: "high" | "medium" | "low";
  reason: string;
  blocking_flight_number?: string;
};

type SnapshotShape = {
  scheduled: ScheduleEntryShape[];
  unscheduled: UnscheduledEntryShape[];
};

type BottleneckReportShape = {
  bottleneck_exists: boolean;
  chain_length: number;
  total_elapsed_min: number;
  cumulative_operation_min: number;
  cumulative_wait_min: number;
  chain: ScheduleEntryShape[];
  note?: string;
};

async function generateSchedule(client: Client): Promise<SnapshotShape> {
  const resp = await client.callTool({ name: "generate_schedule", arguments: {} });
  if (resp.isError) {
    throw new Error(
      `generate_schedule returned isError: ${JSON.stringify(resp.content?.[0])}`,
    );
  }
  return (resp.structuredContent as { schedule: SnapshotShape }).schedule;
}

async function callBottleneck(client: Client): Promise<BottleneckReportShape> {
  const resp = await client.callTool({ name: "analyze_bottleneck", arguments: {} });
  if (resp.isError) {
    throw new Error(
      `analyze_bottleneck returned isError: ${JSON.stringify(resp.content?.[0])}`,
    );
  }
  return resp.structuredContent as BottleneckReportShape;
}

/**
 * Determinism projection — keeps every field whose value is a function of the
 * input queue + config (i.e. should be byte-identical across runs), and drops
 * wall-clock-derived fields. The AC names a floor (offsets, runway/gate ids,
 * unscheduled reasons); we project a superset of that floor so a regression
 * in `predecessors` order, `priority` placement, `runway_window` /
 * `gate_window` derivation, or `blocking_flight_number` linkage also fails the
 * harness — those are all input-determined and a divergence would be a real
 * scheduler regression.
 */
function projectForDeterminism(snap: SnapshotShape): unknown {
  return {
    scheduled: snap.scheduled
      .map((e) => ({
        flight_number: e.flight_number,
        operation: e.operation,
        priority: e.priority,
        runway_id: e.runway_id,
        gate_id: e.gate_id,
        start_offset_min: e.start_offset_min,
        end_offset_min: e.end_offset_min,
        runway_window: e.runway_window,
        gate_window: e.gate_window,
        predecessors: e.predecessors,
      }))
      .sort((a, b) => (a.flight_number < b.flight_number ? -1 : 1)),
    unscheduled: snap.unscheduled
      .map((e) => ({
        flight_number: e.flight_number,
        operation: e.operation,
        priority: e.priority,
        reason: e.reason,
        ...(e.blocking_flight_number !== undefined
          ? { blocking_flight_number: e.blocking_flight_number }
          : {}),
      }))
      .sort((a, b) => (a.flight_number < b.flight_number ? -1 : 1)),
  };
}

describe("slice 8 — extra scenario: forward-reference resolved", () => {
  it("schedules B-depends-on-A when B was submitted before A", async () => {
    const { client, cleanup } = await connectClient();
    try {
      // Submit B (the dependent) BEFORE A (the predecessor) — forward reference.
      const bResp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "B",
          operation: "departure",
          priority: "medium",
          dependencies: ["A"],
        },
      });
      expect(bResp.isError).toBeFalsy();
      const aResp = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A", operation: "arrival", priority: "high" },
      });
      expect(aResp.isError).toBeFalsy();

      const snap = await generateSchedule(client);
      expect(snap.unscheduled).toHaveLength(0);
      expect(snap.scheduled.map((e) => e.flight_number).sort()).toEqual(["A", "B"]);

      const a = snap.scheduled.find((e) => e.flight_number === "A")!;
      const b = snap.scheduled.find((e) => e.flight_number === "B")!;
      // Dependency buffer (15 in the test config) must still be respected.
      expect(b.start_offset_min).toBeGreaterThanOrEqual(a.end_offset_min + 15);
      expect(b.predecessors).toEqual(["A"]);
    } finally {
      await cleanup();
    }
  });
});

describe("slice 8 — extra scenario: bottleneck 3-chain through the MCP surface", () => {
  it("returns chain_length: 3 with elapsed = C.end - A.start and cumulative_wait_min > 0", async () => {
    const { client, cleanup } = await connectClient();
    try {
      // A → B → C, all arrivals/departures arranged to force resource overlap that
      // a greedy scheduler cannot avoid; the dependency buffer alone gives wait > 0.
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A", operation: "arrival", priority: "high" },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "B",
          operation: "departure",
          priority: "high",
          dependencies: ["A"],
        },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "C",
          operation: "arrival",
          priority: "high",
          dependencies: ["B"],
        },
      });

      const snap = await generateSchedule(client);
      expect(snap.unscheduled).toHaveLength(0);
      const a = snap.scheduled.find((e) => e.flight_number === "A")!;
      const b = snap.scheduled.find((e) => e.flight_number === "B")!;
      const c = snap.scheduled.find((e) => e.flight_number === "C")!;

      const report = await callBottleneck(client);
      expect(report.bottleneck_exists).toBe(true);
      expect(report.chain_length).toBe(3);
      expect(report.chain.map((e) => e.flight_number)).toEqual(["A", "B", "C"]);
      expect(report.total_elapsed_min).toBe(c.end_offset_min - a.start_offset_min);
      // Compute the expected operation sum directly from the snapshot so a
      // regression where the analyzer double-counts or skips a node fails
      // here — `cumulative_operation_min === total_elapsed - cumulative_wait`
      // is the analyzer's *definition* of wait, so asserting only that pair
      // would be a tautology.
      const expectedOps =
        a.end_offset_min - a.start_offset_min +
        (b.end_offset_min - b.start_offset_min) +
        (c.end_offset_min - c.start_offset_min);
      expect(report.cumulative_operation_min).toBe(expectedOps);
      expect(report.cumulative_wait_min).toBe(report.total_elapsed_min - expectedOps);
      // Two dependency-buffer gaps (A→B, B→C) — each contributes at least 15 min.
      expect(report.cumulative_wait_min).toBeGreaterThanOrEqual(30);
    } finally {
      await cleanup();
    }
  });
});

describe("slice 8 — determinism harness", () => {
  /**
   * Submits a mixed-priority queue (some independent, some dependent, one
   * impossibly-heavy → unscheduled) and returns the projected snapshot.
   *
   * The fixture deliberately mixes scheduled and unscheduled outcomes so the
   * determinism assertion exercises both code paths (the scheduled greedy
   * placement AND the unscheduled-reason taxonomy) in one harness.
   */
  async function runFixture(client: Client): Promise<unknown> {
    await client.callTool({ name: "reset_state", arguments: {} });
    const submissions = [
      { flight_number: "A", operation: "arrival" as const, priority: "high" as const },
      {
        flight_number: "B",
        operation: "departure" as const,
        priority: "high" as const,
        dependencies: ["A"],
      },
      {
        flight_number: "HVY",
        operation: "departure" as const,
        priority: "high" as const,
        min_runway_length_m: 9999,
      },
      { flight_number: "C", operation: "arrival" as const, priority: "medium" as const },
      { flight_number: "D", operation: "departure" as const, priority: "low" as const },
    ];
    for (const s of submissions) {
      const resp = await client.callTool({ name: "submit_flight", arguments: s });
      expect(resp.isError).toBeFalsy();
    }
    const snap = await generateSchedule(client);
    return projectForDeterminism(snap);
  }

  it("two passes with reset_state between produce byte-identical projected snapshots", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const first = await runFixture(client);
      const second = await runFixture(client);
      // JSON-stringify comparison is sufficient — the projection drops every
      // wall-clock-derived field, so any remaining diff is a real determinism
      // regression in the scheduler / cascade / unscheduled-reason taxonomy.
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    } finally {
      await cleanup();
    }
  });

  it("two passes also produce byte-identical bottleneck reports (chain + math)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await runFixture(client);
      const r1 = await callBottleneck(client);
      await runFixture(client);
      const r2 = await callBottleneck(client);
      // Project out the timezone-rendered endpoints — they re-render against
      // the new pass's `schedule_start_at`. Chain offsets and math must match.
      const project = (r: BottleneckReportShape) => ({
        bottleneck_exists: r.bottleneck_exists,
        chain_length: r.chain_length,
        total_elapsed_min: r.total_elapsed_min,
        cumulative_operation_min: r.cumulative_operation_min,
        cumulative_wait_min: r.cumulative_wait_min,
        chain: r.chain.map((e) => ({
          flight_number: e.flight_number,
          runway_id: e.runway_id,
          gate_id: e.gate_id,
          start_offset_min: e.start_offset_min,
          end_offset_min: e.end_offset_min,
        })),
        ...(r.note !== undefined ? { note: r.note } : {}),
      });
      expect(JSON.stringify(project(r2))).toBe(JSON.stringify(project(r1)));
    } finally {
      await cleanup();
    }
  });
});
