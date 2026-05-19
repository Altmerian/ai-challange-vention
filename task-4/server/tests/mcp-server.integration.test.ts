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
  state: AirportState;
  cleanup: () => Promise<void>;
}> {
  const state = new AirportState(makeConfig());
  const server = createMcpServer(state);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "atc-test-client", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    state,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

function parseEnvelopeErrors(response: {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}): Array<{ reason: string; flight_number?: string; field?: string }> {
  // Prefer structuredContent (typed payload); fall back to content[0].text JSON.
  const structured = response.structuredContent as
    | { errors?: Array<{ reason: string; flight_number?: string; field?: string }> }
    | undefined;
  if (structured?.errors) return structured.errors;
  const text = response.content?.[0]?.text ?? "";
  const parsed = JSON.parse(text) as {
    errors: Array<{ reason: string; flight_number?: string; field?: string }>;
  };
  return parsed.errors;
}

async function readQueue(client: Client): Promise<{
  flights: Array<Record<string, unknown>>;
}> {
  const resp = await client.readResource({ uri: "atc://queue" });
  const first = resp.contents[0];
  if (!first || typeof first.text !== "string") {
    throw new Error("atc://queue did not return a text payload");
  }
  return JSON.parse(first.text) as { flights: Array<Record<string, unknown>> };
}

describe("MCP server — catalogues (slice 5)", () => {
  it("advertises exactly cancel_flight, generate_schedule, reset_state, and submit_flight", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "cancel_flight",
        "generate_schedule",
        "reset_state",
        "submit_flight",
      ]);
    } finally {
      await cleanup();
    }
  });

  it("advertises exactly atc://queue, atc://runways, and atc://timeline", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { resources } = await client.listResources();
      const uris = resources.map((r) => r.uri).sort();
      expect(uris).toEqual(["atc://queue", "atc://runways", "atc://timeline"]);
      for (const r of resources) expect(r.mimeType).toBe("application/json");
    } finally {
      await cleanup();
    }
  });

  it("lists no prompts", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const prompts = await client.listPrompts().catch(() => ({ prompts: [] }));
      expect(prompts.prompts ?? []).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});

describe("submit_flight", () => {
  it("accepts a valid submission and returns submission_index 0", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
        },
      });
      expect(resp.isError).toBeFalsy();
      expect(resp.structuredContent).toEqual({
        accepted: true,
        flight_number: "AA100",
        submission_index: 0,
      });
    } finally {
      await cleanup();
    }
  });

  it("assigns strictly-increasing submission_index across calls", async () => {
    const { client, cleanup } = await connectClient();
    try {
      for (let i = 0; i < 3; i++) {
        const resp = await client.callTool({
          name: "submit_flight",
          arguments: {
            flight_number: `AA${100 + i}`,
            operation: i % 2 === 0 ? "arrival" : "departure",
            priority: "medium",
          },
        });
        expect(resp.isError).toBeFalsy();
        expect((resp.structuredContent as { submission_index: number }).submission_index).toBe(i);
      }
    } finally {
      await cleanup();
    }
  });

  it("rejects a duplicate flight number with reason duplicate_flight_number", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const dup = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "departure", priority: "low" },
      });
      expect(dup.isError).toBe(true);
      const errors = parseEnvelopeErrors(dup);
      expect(errors.map((e) => e.reason)).toEqual(["duplicate_flight_number"]);
      expect(errors[0]?.flight_number).toBe("AA100");
    } finally {
      await cleanup();
    }
  });

  it("rejects self-dependency at submission with reason self_dependency", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          dependencies: ["AA100"],
        },
      });
      expect(resp.isError).toBe(true);
      const errors = parseEnvelopeErrors(resp);
      expect(errors.map((e) => e.reason)).toEqual(["self_dependency"]);
      expect(errors[0]?.flight_number).toBe("AA100");
    } finally {
      await cleanup();
    }
  });

  it("accepts forward-referenced predecessors without resolving them (ADR-0004)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "BB200",
          operation: "departure",
          priority: "medium",
          dependencies: ["AA100"], // not yet submitted
        },
      });
      expect(resp.isError).toBeFalsy();
      expect(resp.structuredContent).toEqual({
        accepted: true,
        flight_number: "BB200",
        submission_index: 0,
      });
      // Queue carries the unresolved edge as-is.
      const queue = await readQueue(client);
      expect(queue.flights[0]?.dependencies).toEqual(["AA100"]);
      expect(queue.flights[0]?.state).toBe("submitted");
    } finally {
      await cleanup();
    }
  });

  it("collects multiple violations into one envelope (self-dep AND duplicate)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          dependencies: ["AA100"],
        },
      });
      expect(resp.isError).toBe(true);
      const reasons = parseEnvelopeErrors(resp)
        .map((e) => e.reason)
        .sort();
      expect(reasons).toEqual(["duplicate_flight_number", "self_dependency"]);
    } finally {
      await cleanup();
    }
  });

  it("rejects unknown fields via the strict input schema", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          weight_kg: 80_000,
        } as Record<string, unknown>,
      });
      expect(resp.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("rejects invalid priority via the schema", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "URGENT",
        } as Record<string, unknown>,
      });
      expect(resp.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("atc://queue resource", () => {
  it("returns flights in submission order with the QueueEntry shape", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          min_runway_length_m: 3000,
        },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "BB200",
          operation: "departure",
          priority: "medium",
          dependencies: ["AA100"],
        },
      });
      const queue = await readQueue(client);
      expect(queue.flights).toHaveLength(2);
      expect(queue.flights[0]).toEqual({
        flight_number: "AA100",
        operation: "arrival",
        priority: "high",
        dependencies: [],
        state: "submitted",
        submission_index: 0,
        min_runway_length_m: 3000,
      });
      expect(queue.flights[1]).toEqual({
        flight_number: "BB200",
        operation: "departure",
        priority: "medium",
        dependencies: ["AA100"],
        state: "submitted",
        submission_index: 1,
      });
      // min_runway_length_m is absent (not undefined) when unset.
      expect(Object.prototype.hasOwnProperty.call(queue.flights[1], "min_runway_length_m")).toBe(
        false,
      );
    } finally {
      await cleanup();
    }
  });

  it("silently de-duplicates a dependency list before storing it", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "CC300",
          operation: "departure",
          priority: "low",
          dependencies: ["AA100", "AA100", "BB200", "AA100"],
        },
      });
      const queue = await readQueue(client);
      expect(queue.flights[0]?.dependencies).toEqual(["AA100", "BB200"]);
    } finally {
      await cleanup();
    }
  });

  it("does not recompute on repeated reads (byte-identical payload)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const r1 = await client.readResource({ uri: "atc://queue" });
      const r2 = await client.readResource({ uri: "atc://queue" });
      expect(r1.contents[0]?.text).toBe(r2.contents[0]?.text);
    } finally {
      await cleanup();
    }
  });
});

describe("reset_state — flow with submit_flight", () => {
  it("returns the canonical reset_state response on a fresh state", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({ name: "reset_state", arguments: {} });
      expect(resp.isError).toBeFalsy();
      expect(resp.structuredContent).toEqual({
        cleared: true,
        flights_removed_count: 0,
        schedule_cleared: false,
      });
    } finally {
      await cleanup();
    }
  });

  it("counts submitted flights and resets submission_index to 0", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "BB200", operation: "departure", priority: "low" },
      });

      const reset = await client.callTool({ name: "reset_state", arguments: {} });
      expect(reset.structuredContent).toEqual({
        cleared: true,
        flights_removed_count: 2,
        schedule_cleared: false,
      });

      // Next submission should claim submission_index 0 again.
      const fresh = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "ZZ999", operation: "arrival", priority: "medium" },
      });
      expect((fresh.structuredContent as { submission_index: number }).submission_index).toBe(0);

      const queue = await readQueue(client);
      expect(queue.flights).toHaveLength(1);
      expect(queue.flights[0]?.flight_number).toBe("ZZ999");
    } finally {
      await cleanup();
    }
  });

  it("rejects reset_state input with unexpected fields", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const response = await client.callTool({
        name: "reset_state",
        arguments: { unexpected: 1 } as Record<string, unknown>,
      });
      expect(response.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

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
  start_at: string;
  end_at: string;
  predecessors: string[];
};

type UnscheduledEntryShape = {
  flight_number: string;
  operation: "arrival" | "departure";
  priority: "high" | "medium" | "low";
  reason: string;
  detail: string;
  blocking_flight_number?: string;
};

type SnapshotShape = {
  generated_at: string;
  schedule_start_at: string;
  timezone: string;
  horizon_min: number;
  scheduled: ScheduleEntryShape[];
  unscheduled: UnscheduledEntryShape[];
  totals: { submitted: number; scheduled: number; unscheduled: number; cancelled: number };
};

async function generateSchedule(
  client: Client,
  args: { timezone?: string } = {},
): Promise<SnapshotShape> {
  const resp = await client.callTool({ name: "generate_schedule", arguments: args });
  if (resp.isError) {
    throw new Error(
      `generate_schedule returned isError: ${JSON.stringify(resp.content?.[0])}`,
    );
  }
  const schedule = (resp.structuredContent as { schedule: SnapshotShape }).schedule;
  return schedule;
}

async function readJson<T>(client: Client, uri: string): Promise<T> {
  const resp = await client.readResource({ uri });
  const text = resp.contents[0]?.text;
  if (typeof text !== "string") throw new Error(`${uri} did not return text`);
  return JSON.parse(text) as T;
}

function noWindowOverlap(
  ops: ScheduleEntryShape[],
  pick: (e: ScheduleEntryShape) => { start_offset_min: number; end_offset_min: number },
  groupBy: (e: ScheduleEntryShape) => string,
): boolean {
  const byGroup = new Map<string, Array<{ start_offset_min: number; end_offset_min: number }>>();
  for (const op of ops) {
    const arr = byGroup.get(groupBy(op)) ?? [];
    arr.push(pick(op));
    byGroup.set(groupBy(op), arr);
  }
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => a.start_offset_min - b.start_offset_min);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i]!.start_offset_min < arr[i - 1]!.end_offset_min) return false;
    }
  }
  return true;
}

describe("generate_schedule", () => {
  it("returns a ScheduleSnapshot with canonical offsets and ISO timestamps", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const snap = await generateSchedule(client, { timezone: "Europe/Warsaw" });
      expect(snap.timezone).toBe("Europe/Warsaw");
      expect(snap.horizon_min).toBe(240);
      expect(snap.schedule_start_at).toMatch(/Z$/);
      expect(snap.generated_at).toMatch(/Z$/);
      expect(snap.scheduled).toHaveLength(1);
      const e = snap.scheduled[0]!;
      expect(e.runway_id).toBe("RWY-1");
      expect(e.gate_id).toBe("GATE-1");
      expect(e.start_offset_min).toBe(0);
      expect(e.runway_window).toEqual({ start_offset_min: 0, end_offset_min: 5 });
      expect(e.gate_window).toEqual({ start_offset_min: 5, end_offset_min: 35 });
      expect(e.start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      expect(e.predecessors).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("falls back to ATC_DEFAULT_TIMEZONE when timezone is omitted", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const snap = await generateSchedule(client);
      expect(snap.timezone).toBe("UTC");
    } finally {
      await cleanup();
    }
  });

  it("returns an error envelope for an invalid IANA timezone (no silent UTC fallback)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "generate_schedule",
        arguments: { timezone: "Mars/Olympus" },
      });
      expect(resp.isError).toBe(true);
      const errors = parseEnvelopeErrors(resp);
      expect(errors[0]?.reason).toBe("invalid_input");
    } finally {
      await cleanup();
    }
  });

  it("flips queue state to scheduled / unscheduled after a pass", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "OK1", operation: "arrival", priority: "medium" },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "HVY1",
          operation: "departure",
          priority: "high",
          min_runway_length_m: 9999,
        },
      });
      await generateSchedule(client);
      const queue = await readJson<{ flights: Array<Record<string, unknown>> }>(
        client,
        "atc://queue",
      );
      const byNumber = new Map(queue.flights.map((f) => [f.flight_number as string, f]));
      expect(byNumber.get("OK1")?.state).toBe("scheduled");
      expect(byNumber.get("OK1")?.runway_id).toBe("RWY-1");
      expect(byNumber.get("HVY1")?.state).toBe("unscheduled");
      expect(byNumber.get("HVY1")?.reason).toBe("no_compatible_runway");
    } finally {
      await cleanup();
    }
  });

  it("produces non-overlapping runway and gate windows for a mixed independent batch", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const submissions = [
        { flight_number: "A1", operation: "arrival" as const, priority: "high" as const },
        { flight_number: "B1", operation: "departure" as const, priority: "medium" as const },
        { flight_number: "A2", operation: "arrival" as const, priority: "low" as const },
        { flight_number: "B2", operation: "departure" as const, priority: "low" as const },
      ];
      for (const s of submissions) {
        await client.callTool({ name: "submit_flight", arguments: s });
      }
      const snap = await generateSchedule(client);
      expect(snap.scheduled).toHaveLength(4);
      expect(noWindowOverlap(snap.scheduled, (e) => e.runway_window, (e) => e.runway_id)).toBe(
        true,
      );
      expect(noWindowOverlap(snap.scheduled, (e) => e.gate_window, (e) => e.gate_id)).toBe(
        true,
      );
    } finally {
      await cleanup();
    }
  });
});

describe("atc://runways resource", () => {
  it("exposes per-runway operations, busy minutes (incl. trailing buffer), and available windows", async () => {
    // Single runway forces both arrivals onto RWY-1 so busy-minute math is deterministic.
    const state = new AirportState({ ...makeConfig(), runwayLengthsM: [3000] });
    const server = createMcpServer(state);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "atc-test-client", version: "0.0.0" },
      { capabilities: {} },
    );
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A1", operation: "arrival", priority: "high" },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A2", operation: "arrival", priority: "low" },
      });
      await generateSchedule(client);
      const body = await readJson<{ runways: Array<Record<string, unknown>> }>(
        client,
        "atc://runways",
      );
      expect(body.runways).toHaveLength(1);
      const rwy1 = body.runways[0]!;
      expect(rwy1.runway_id).toBe("RWY-1");
      expect(rwy1.length_m).toBe(3000);
      const ops = rwy1.operations as ScheduleEntryShape[];
      expect(ops.map((o) => o.flight_number)).toEqual(["A1", "A2"]);
      // A1 runway [0,5] + sep 2 (landing→landing), A2 runway [7,12] + trailing
      // buffer = max(separation_landing=2, separation_mixed=3) = 3.
      // busy = 5 + 2 + 5 + 3 = 15.
      expect(rwy1.busy_minutes).toBe(15);
      const wins = rwy1.available_windows as Array<{
        start_offset_min: number;
        end_offset_min: number;
      }>;
      expect(wins).toEqual([{ start_offset_min: 15, end_offset_min: 240 }]);
      expect(rwy1.next_available_at_offset_min).toBe(15);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("reads do not recompute (byte-identical payload on repeat)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A1", operation: "arrival", priority: "high" },
      });
      await generateSchedule(client);
      const r1 = await client.readResource({ uri: "atc://runways" });
      const r2 = await client.readResource({ uri: "atc://runways" });
      expect(r1.contents[0]?.text).toBe(r2.contents[0]?.text);
    } finally {
      await cleanup();
    }
  });
});

describe("atc://timeline resource", () => {
  it("returns a flat chronological list of scheduled operations", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A1", operation: "arrival", priority: "high" },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "B1", operation: "departure", priority: "medium" },
      });
      await generateSchedule(client);
      const body = await readJson<{ operations: ScheduleEntryShape[] }>(
        client,
        "atc://timeline",
      );
      expect(body.operations.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < body.operations.length; i++) {
        const a = body.operations[i - 1]!;
        const b = body.operations[i]!;
        expect(
          a.start_offset_min < b.start_offset_min ||
            (a.start_offset_min === b.start_offset_min && a.flight_number <= b.flight_number),
        ).toBe(true);
      }
    } finally {
      await cleanup();
    }
  });

  it("returns an empty operations list when no schedule has been generated", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const body = await readJson<{ operations: ScheduleEntryShape[] }>(
        client,
        "atc://timeline",
      );
      expect(body.operations).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});

describe("brief scenario — Connecting Flight", () => {
  it("schedules A→B with the dependency buffer respected and timeline ordering reflecting the dependency", async () => {
    const { client, state, cleanup } = await connectClient();
    try {
      // 1. Reset.
      await client.callTool({ name: "reset_state", arguments: {} });

      // 2. Submit inbound arrival A.
      const aResp = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A", operation: "arrival", priority: "high" },
      });
      expect(aResp.isError).toBeFalsy();

      // 3. Submit outbound departure B with dependencies: ["A"].
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

      // 4. Generate the schedule.
      const snap = await generateSchedule(client);
      expect(snap.scheduled).toHaveLength(2);
      expect(snap.unscheduled).toHaveLength(0);

      const a = snap.scheduled.find((e) => e.flight_number === "A")!;
      const b = snap.scheduled.find((e) => e.flight_number === "B")!;
      expect(b.predecessors).toEqual(["A"]);

      // 5. Assert: B.start ≥ A.end + ATC_DEPENDENCY_BUFFER_MIN.
      const buffer = state.config.dependencyBufferMin;
      expect(b.start_offset_min).toBeGreaterThanOrEqual(a.end_offset_min + buffer);

      // 6. Timeline ordering reflects the dependency: A appears before B.
      const timeline = await readJson<{ operations: ScheduleEntryShape[] }>(
        client,
        "atc://timeline",
      );
      const aIdx = timeline.operations.findIndex((o) => o.flight_number === "A");
      const bIdx = timeline.operations.findIndex((o) => o.flight_number === "B");
      expect(aIdx).toBeGreaterThanOrEqual(0);
      expect(bIdx).toBeGreaterThan(aIdx);
    } finally {
      await cleanup();
    }
  });

  it("flags dependency_missing on the queue when a predecessor was never submitted", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "ORPHAN",
          operation: "departure",
          priority: "low",
          dependencies: ["GHOST"],
        },
      });
      await generateSchedule(client);
      const queue = await readJson<{ flights: Array<Record<string, unknown>> }>(
        client,
        "atc://queue",
      );
      const orphan = queue.flights.find((f) => f.flight_number === "ORPHAN");
      expect(orphan?.state).toBe("unscheduled");
      expect(orphan?.reason).toBe("dependency_missing");
      expect(orphan?.blocking_flight_number).toBe("GHOST");
    } finally {
      await cleanup();
    }
  });

  it("surfaces dependency_unscheduled with blocking_flight_number on a cascade", async () => {
    const { client, cleanup } = await connectClient();
    try {
      // HVY unscheduled (no_compatible_runway). B depends on HVY → cascade.
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "HVY",
          operation: "departure",
          priority: "high",
          min_runway_length_m: 9999,
        },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "B",
          operation: "departure",
          priority: "high",
          dependencies: ["HVY"],
        },
      });
      await generateSchedule(client);
      const queue = await readJson<{ flights: Array<Record<string, unknown>> }>(
        client,
        "atc://queue",
      );
      const b = queue.flights.find((f) => f.flight_number === "B");
      expect(b?.state).toBe("unscheduled");
      expect(b?.reason).toBe("dependency_unscheduled");
      expect(b?.blocking_flight_number).toBe("HVY");
    } finally {
      await cleanup();
    }
  });

  it("flags every cycle member with dependency_cycle and a detail listing members", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "A",
          operation: "arrival",
          priority: "medium",
          dependencies: ["B"],
        },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "B",
          operation: "departure",
          priority: "medium",
          dependencies: ["A"],
        },
      });
      const snap = await generateSchedule(client);
      expect(snap.scheduled).toHaveLength(0);
      expect(snap.unscheduled).toHaveLength(2);
      for (const e of snap.unscheduled) {
        expect(e.reason).toBe("dependency_cycle");
        expect(e.detail).toContain("A");
        expect(e.detail).toContain("B");
      }
    } finally {
      await cleanup();
    }
  });
});

describe("cancel_flight", () => {
  async function callCancel(
    client: Client,
    args: { flight_number: string; timezone?: string },
  ) {
    return client.callTool({ name: "cancel_flight", arguments: args });
  }

  it("cancels a submitted flight and returns { cancelled, flight_number, schedule }", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const resp = await callCancel(client, { flight_number: "AA100" });
      expect(resp.isError).toBeFalsy();
      const sc = resp.structuredContent as {
        cancelled: true;
        flight_number: string;
        schedule: SnapshotShape;
      };
      expect(sc.cancelled).toBe(true);
      expect(sc.flight_number).toBe("AA100");
      expect(sc.schedule.totals.cancelled).toBe(1);
      expect(sc.schedule.scheduled).toHaveLength(0);

      const queue = await readQueue(client);
      expect(queue.flights[0]?.state).toBe("cancelled");
    } finally {
      await cleanup();
    }
  });

  it("returns an isError envelope for an unknown flight number", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await callCancel(client, { flight_number: "GHOST" });
      expect(resp.isError).toBe(true);
      const errors = parseEnvelopeErrors(resp);
      expect(errors[0]?.reason).toBe("invalid_input");
      expect(errors[0]?.flight_number).toBe("GHOST");
    } finally {
      await cleanup();
    }
  });

  it("returns an isError envelope for an invalid IANA timezone (no silent fallback)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const resp = await callCancel(client, {
        flight_number: "AA100",
        timezone: "Mars/Olympus",
      });
      expect(resp.isError).toBe(true);
      const errors = parseEnvelopeErrors(resp);
      expect(errors[0]?.reason).toBe("invalid_input");
      expect(errors[0]?.field).toBe("timezone");
    } finally {
      await cleanup();
    }
  });

  it("rejects unknown fields via the strict input schema even when the flight exists", async () => {
    const { client, cleanup } = await connectClient();
    try {
      // Submit AA100 first so the only path to isError is the strict-schema
      // rejection — otherwise an unknown_flight_number envelope would
      // false-positive-pass this test.
      const sub = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      expect(sub.isError).toBeFalsy();
      const resp = await client.callTool({
        name: "cancel_flight",
        arguments: { flight_number: "AA100", reason: "weather" } as Record<string, unknown>,
      });
      expect(resp.isError).toBe(true);
      // The flight must still be cancellable through the normal path —
      // proves the strict rejection did not actually mutate state.
      const ok = await callCancel(client, { flight_number: "AA100" });
      expect(ok.isError).toBeFalsy();
    } finally {
      await cleanup();
    }
  });

  it("cancels an unscheduled flight (no_compatible_runway) and flips its state to cancelled via MCP", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "HVY",
          operation: "departure",
          priority: "high",
          min_runway_length_m: 9999,
        },
      });
      // Force HVY into `unscheduled` first via an explicit pass.
      const gen = await generateSchedule(client);
      expect(gen.unscheduled[0]?.flight_number).toBe("HVY");
      expect(gen.unscheduled[0]?.reason).toBe("no_compatible_runway");

      const cancel = await callCancel(client, { flight_number: "HVY" });
      expect(cancel.isError).toBeFalsy();
      const sc = (cancel.structuredContent as { schedule: SnapshotShape }).schedule;
      expect(sc.scheduled).toHaveLength(0);
      expect(sc.unscheduled).toHaveLength(0);
      expect(sc.totals.cancelled).toBe(1);

      const queue = await readQueue(client);
      expect(queue.flights[0]?.state).toBe("cancelled");
    } finally {
      await cleanup();
    }
  });

  it("re-cancel is idempotent — returns success with the same schedule, does not error", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const first = await callCancel(client, { flight_number: "AA100" });
      expect(first.isError).toBeFalsy();
      const second = await callCancel(client, { flight_number: "AA100" });
      expect(second.isError).toBeFalsy();
      const sc1 = (first.structuredContent as { schedule: SnapshotShape }).schedule;
      const sc2 = (second.structuredContent as { schedule: SnapshotShape }).schedule;
      // Identical payload — no fresh pass between calls.
      expect(JSON.stringify(sc2)).toBe(JSON.stringify(sc1));
    } finally {
      await cleanup();
    }
  });

  it("auto-regen cascade — cancel A re-evaluates B to dependency_cancelled without an explicit generate_schedule", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({ name: "reset_state", arguments: {} });
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "A", operation: "arrival", priority: "high" },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "B",
          operation: "departure",
          priority: "medium",
          dependencies: ["A"],
        },
      });
      // Generate once so we have a baseline schedule.
      await generateSchedule(client);

      const cancel = await callCancel(client, { flight_number: "A" });
      expect(cancel.isError).toBeFalsy();
      const sc = (cancel.structuredContent as { schedule: SnapshotShape }).schedule;
      const b = sc.unscheduled.find((e) => e.flight_number === "B");
      expect(b?.reason).toBe("dependency_cancelled");
      expect(b?.blocking_flight_number).toBe("A");
      expect(sc.scheduled.find((e) => e.flight_number === "A")).toBeUndefined();

      // Same view on the resource — no extra generate_schedule between.
      const queue = await readQueue(client);
      const aQ = queue.flights.find((f) => f.flight_number === "A");
      const bQ = queue.flights.find((f) => f.flight_number === "B");
      expect(aQ?.state).toBe("cancelled");
      expect(bQ?.state).toBe("unscheduled");
      expect(bQ?.reason).toBe("dependency_cancelled");
      expect(bQ?.blocking_flight_number).toBe("A");
    } finally {
      await cleanup();
    }
  });

  it("transitive cascade — A→B→C, cancelling A flips B to dependency_cancelled and C to dependency_unscheduled", async () => {
    const { client, cleanup } = await connectClient();
    try {
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
          operation: "departure",
          priority: "high",
          dependencies: ["B"],
        },
      });
      const cancel = await callCancel(client, { flight_number: "A" });
      const sc = (cancel.structuredContent as { schedule: SnapshotShape }).schedule;
      const b = sc.unscheduled.find((e) => e.flight_number === "B");
      const c = sc.unscheduled.find((e) => e.flight_number === "C");
      expect(b?.reason).toBe("dependency_cancelled");
      expect(b?.blocking_flight_number).toBe("A");
      expect(c?.reason).toBe("dependency_unscheduled");
      expect(c?.blocking_flight_number).toBe("B");
    } finally {
      await cleanup();
    }
  });

  it("re-submitting a cancelled flight number is still rejected", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      await callCancel(client, { flight_number: "AA100" });
      const dup = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "departure", priority: "low" },
      });
      expect(dup.isError).toBe(true);
      const errors = parseEnvelopeErrors(dup);
      expect(errors[0]?.reason).toBe("duplicate_flight_number");
    } finally {
      await cleanup();
    }
  });
});

describe("brief scenario — Morning Rush", () => {
  it("schedules four mixed-priority flights without runway/gate overlap; higher priority placed earlier when contested", async () => {
    const { client, cleanup } = await connectClient();
    try {
      // 1. Clean state.
      const r = await client.callTool({ name: "reset_state", arguments: {} });
      expect(r.isError).toBeFalsy();

      // 2. Submit four mixed flights.
      const subs = [
        { flight_number: "HA1", operation: "arrival" as const, priority: "high" as const },
        { flight_number: "MD1", operation: "departure" as const, priority: "medium" as const },
        { flight_number: "LA1", operation: "arrival" as const, priority: "low" as const },
        { flight_number: "LD1", operation: "departure" as const, priority: "low" as const },
      ];
      for (const s of subs) {
        const resp = await client.callTool({ name: "submit_flight", arguments: s });
        expect(resp.isError).toBeFalsy();
      }

      // 3. Generate the schedule.
      const snap = await generateSchedule(client);
      expect(snap.scheduled).toHaveLength(4);
      expect(snap.unscheduled).toHaveLength(0);

      // 4. Inspect the queue — every submission visible, all scheduled, with placements.
      const queue = await readJson<{ flights: Array<Record<string, unknown>> }>(
        client,
        "atc://queue",
      );
      expect(queue.flights).toHaveLength(4);
      for (const f of queue.flights) {
        expect(f.state).toBe("scheduled");
        expect(f.runway_id).toBeTypeOf("string");
        expect(f.gate_id).toBeTypeOf("string");
      }

      // 5. Inspect the timeline.
      const timeline = await readJson<{ operations: ScheduleEntryShape[] }>(
        client,
        "atc://timeline",
      );

      // Assert: no runway/gate window overlap on the timeline.
      expect(
        noWindowOverlap(timeline.operations, (e) => e.runway_window, (e) => e.runway_id),
      ).toBe(true);
      expect(
        noWindowOverlap(timeline.operations, (e) => e.gate_window, (e) => e.gate_id),
      ).toBe(true);

      // Higher priority placed earlier when contested: HA1 (high) starts no later than LA1 (low).
      const byNumber = new Map(timeline.operations.map((o) => [o.flight_number, o]));
      const ha1 = byNumber.get("HA1")!;
      const la1 = byNumber.get("LA1")!;
      expect(ha1.start_offset_min).toBeLessThanOrEqual(la1.start_offset_min);
      // Medium beats low at submission tiebreak: MD1 (medium) earlier than LD1 (low).
      const md1 = byNumber.get("MD1")!;
      const ld1 = byNumber.get("LD1")!;
      expect(md1.start_offset_min).toBeLessThanOrEqual(ld1.start_offset_min);
    } finally {
      await cleanup();
    }
  });
});
