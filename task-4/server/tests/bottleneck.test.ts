import { describe, expect, it } from "vitest";

import { analyzeBottleneck } from "../src/bottleneck.js";
import type { Config } from "../src/config.js";
import type { Flight, FlightSubmission } from "../src/airport-state.js";
import { runSchedulingPass, type ScheduleEntry, type ScheduleSnapshot } from "../src/scheduler.js";

const ANCHOR = new Date("2026-05-19T10:00:00Z");
const TZ = "UTC";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    runwayLengthsM: [3000, 4000],
    gateCount: 2,
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
    ...overrides,
  };
}

function flight(
  index: number,
  submission: Partial<FlightSubmission> & { flightNumber: string },
): Flight {
  return {
    flightNumber: submission.flightNumber,
    operation: submission.operation ?? "arrival",
    priority: submission.priority ?? "medium",
    dependencies: submission.dependencies ?? [],
    ...(submission.minRunwayLengthM !== undefined
      ? { minRunwayLengthM: submission.minRunwayLengthM }
      : {}),
    state: "submitted",
    submissionIndex: index,
  };
}

function pass(queue: Flight[], cfg: Config = makeConfig()): ScheduleSnapshot {
  return runSchedulingPass(queue, cfg, { now: ANCHOR, timezone: TZ });
}

/**
 * Builds a hand-crafted snapshot directly from `entries` (bypassing the
 * scheduler). Used to construct exact chain-shape fixtures (e.g. tie-break
 * cases) that the real scheduler wouldn't produce as-is.
 */
function snapshotOf(entries: ScheduleEntry[]): ScheduleSnapshot {
  return {
    generated_at: "2026-05-19T10:00:00Z",
    schedule_start_at: "2026-05-19T10:00:00Z",
    timezone: TZ,
    horizon_min: 240,
    scheduled: [...entries].sort(
      (a, b) =>
        a.start_offset_min - b.start_offset_min ||
        (a.flight_number < b.flight_number ? -1 : 1),
    ),
    unscheduled: [],
    totals: {
      submitted: 0,
      scheduled: entries.length,
      unscheduled: 0,
      cancelled: 0,
    },
  };
}

function entry(opts: {
  flight_number: string;
  start: number;
  end: number;
  predecessors?: string[];
  operation?: "arrival" | "departure";
}): ScheduleEntry {
  const op = opts.operation ?? "arrival";
  return {
    flight_number: opts.flight_number,
    operation: op,
    priority: "medium",
    runway_id: "RWY-1",
    gate_id: "GATE-1",
    start_offset_min: opts.start,
    end_offset_min: opts.end,
    runway_window: { start_offset_min: opts.start, end_offset_min: opts.start + 1 },
    gate_window: { start_offset_min: opts.start + 1, end_offset_min: opts.end },
    start_at: "2026-05-19T10:00:00Z",
    end_at: "2026-05-19T10:00:00Z",
    predecessors: opts.predecessors ?? [],
  };
}

describe("analyzeBottleneck — degenerate cases", () => {
  it("returns bottleneck_exists: false with a note when no schedule has been generated", () => {
    const r = analyzeBottleneck(null, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(false);
    expect(r.chain_length).toBe(0);
    expect(r.chain).toEqual([]);
    expect(r.note).toBeDefined();
    expect(r.start_at).toBeUndefined();
    expect(r.end_at).toBeUndefined();
  });

  it("returns bottleneck_exists: false with a note when the queue is empty", () => {
    const snap = pass([]);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(false);
    expect(r.chain).toEqual([]);
    expect(r.note).toMatch(/scheduled flights/);
  });

  it("returns bottleneck_exists: false when no dependency edges exist between scheduled flights", () => {
    const snap = pass([
      flight(0, { flightNumber: "AA100", operation: "arrival" }),
      flight(1, { flightNumber: "BB200", operation: "departure" }),
    ]);
    expect(snap.scheduled).toHaveLength(2);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(false);
    expect(r.chain_length).toBe(0);
    expect(r.note).toBe("no scheduled dependency edges");
  });
});

describe("analyzeBottleneck — chain discovery and math", () => {
  it("finds the 2-flight A→B chain with elapsed math accounting for the dependency buffer", () => {
    const snap = pass([
      flight(0, { flightNumber: "A", operation: "arrival" }),
      flight(1, { flightNumber: "B", operation: "departure", dependencies: ["A"] }),
    ]);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(true);
    expect(r.chain_length).toBe(2);
    expect(r.chain.map((e) => e.flight_number)).toEqual(["A", "B"]);
    const a = r.chain[0]!;
    const b = r.chain[1]!;
    expect(r.total_elapsed_min).toBe(b.end_offset_min - a.start_offset_min);
    const ops = a.end_offset_min - a.start_offset_min + (b.end_offset_min - b.start_offset_min);
    expect(r.cumulative_operation_min).toBe(ops);
    expect(r.cumulative_wait_min).toBe(r.total_elapsed_min - ops);
    expect(r.cumulative_wait_min).toBeGreaterThan(0);
    expect(r.start_at).toBeDefined();
    expect(r.end_at).toBeDefined();
  });

  it("finds a 3-flight A→B→C chain", () => {
    const snap = pass([
      flight(0, { flightNumber: "A", operation: "arrival" }),
      flight(1, { flightNumber: "B", operation: "departure", dependencies: ["A"] }),
      flight(2, { flightNumber: "C", operation: "arrival", dependencies: ["B"] }),
    ]);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(true);
    expect(r.chain.map((e) => e.flight_number)).toEqual(["A", "B", "C"]);
    expect(r.chain_length).toBe(3);
    const first = r.chain[0]!;
    const last = r.chain[2]!;
    expect(r.total_elapsed_min).toBe(last.end_offset_min - first.start_offset_min);
    // dependency_buffer × 2 should appear in the wait (one between A↔B and one between B↔C).
    expect(r.cumulative_wait_min).toBeGreaterThanOrEqual(15 * 2);
  });
});

describe("analyzeBottleneck — tiebreakers", () => {
  it("prefers more nodes when elapsed minutes tie", () => {
    // Two chains, same elapsed (10), one has 2 nodes (X→Y) and the other has 3 (P→Q→R).
    // Construct by hand — operation durations are 5 minutes each, dependency-buffer 0
    // semantics simulated via raw offsets.
    const chain2 = [
      entry({ flight_number: "X1", start: 0, end: 5 }),
      entry({ flight_number: "Y1", start: 5, end: 10, predecessors: ["X1"] }),
    ];
    const chain3 = [
      entry({ flight_number: "P1", start: 0, end: 3 }),
      entry({ flight_number: "Q1", start: 3, end: 6, predecessors: ["P1"] }),
      entry({ flight_number: "R1", start: 6, end: 10, predecessors: ["Q1"] }),
    ];
    const snap = snapshotOf([...chain2, ...chain3]);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(true);
    expect(r.chain.map((e) => e.flight_number)).toEqual(["P1", "Q1", "R1"]);
  });

  it("prefers earliest first-flight start when elapsed and node count tie", () => {
    // Two 2-flight chains, both elapsed = 10. Chain (A→B) starts at 0, chain (C→D)
    // starts at 50. Earliest start wins → expect [A, B].
    const ab = [
      entry({ flight_number: "A1", start: 0, end: 5 }),
      entry({ flight_number: "B1", start: 5, end: 10, predecessors: ["A1"] }),
    ];
    const cd = [
      entry({ flight_number: "C1", start: 50, end: 55 }),
      entry({ flight_number: "D1", start: 55, end: 60, predecessors: ["C1"] }),
    ];
    const snap = snapshotOf([...ab, ...cd]);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.chain.map((e) => e.flight_number)).toEqual(["A1", "B1"]);
  });

  it("prefers lex flight-number sequence when elapsed, count, and start all tie", () => {
    // Two chains starting at the SAME first node A → B vs A → C, both 2 nodes,
    // same elapsed, same first.start. The lex-smaller dependent wins, so the
    // resulting chain should be [A, B] not [A, C].
    const entries = [
      entry({ flight_number: "A", start: 0, end: 5 }),
      entry({ flight_number: "B", start: 5, end: 10, predecessors: ["A"] }),
      entry({ flight_number: "C", start: 5, end: 10, predecessors: ["A"] }),
    ];
    const snap = snapshotOf(entries);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.chain.map((e) => e.flight_number)).toEqual(["A", "B"]);
  });

  it("picks the lex-smaller predecessor on a diamond — two converging chains tied on elapsed/count/start", () => {
    // Diamond: A → B → D and A → C → D. Both 3-chains share endpoints, are
    // tied on elapsed (D.end - A.start), count (3), and start (A.start).
    // Lex compare at index 1: B < C, so the bottleneck is [A, B, D]. This
    // exercises the DP's join-handling: bestEndingAt[D] must reflect the
    // lex-better predecessor chain regardless of `predecessors` iteration order.
    const entries = [
      entry({ flight_number: "A", start: 0, end: 5 }),
      entry({ flight_number: "B", start: 5, end: 10, predecessors: ["A"] }),
      entry({ flight_number: "C", start: 5, end: 10, predecessors: ["A"] }),
      entry({ flight_number: "D", start: 10, end: 20, predecessors: ["C", "B"] }),
    ];
    const snap = snapshotOf(entries);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(true);
    expect(r.chain.map((e) => e.flight_number)).toEqual(["A", "B", "D"]);
    expect(r.chain_length).toBe(3);
  });
});

describe("analyzeBottleneck — scheduled-only DAG", () => {
  it("ignores chains through unscheduled predecessors", () => {
    // A is unscheduled (impossible runway). B depends on A → B becomes
    // dependency_unscheduled. C is independent and scheduled. D depends on C
    // (forms a 2-chain). Expect bottleneck = [C, D]; B and A do not contribute.
    const snap = pass([
      flight(0, {
        flightNumber: "HEAVY",
        operation: "departure",
        priority: "high",
        minRunwayLengthM: 9999,
      }),
      flight(1, {
        flightNumber: "DEP",
        operation: "arrival",
        dependencies: ["HEAVY"],
      }),
      flight(2, { flightNumber: "C", operation: "arrival" }),
      flight(3, { flightNumber: "D", operation: "departure", dependencies: ["C"] }),
    ]);
    expect(snap.unscheduled.map((u) => u.flight_number).sort()).toEqual(["DEP", "HEAVY"]);
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(true);
    expect(r.chain.map((e) => e.flight_number)).toEqual(["C", "D"]);
  });

  it("excludes cancelled predecessors from the DAG", () => {
    // Manual queue with a cancelled predecessor — runSchedulingPass treats
    // cancelled flights as not present; dependents of `cancelled` come back
    // unscheduled (dependency_cancelled). Confirm analyzer reflects that —
    // the would-be A→B chain doesn't exist on the scheduled-only DAG.
    const cancelled: Flight = {
      ...flight(0, { flightNumber: "A" }),
      state: "cancelled",
    };
    const dep: Flight = flight(1, {
      flightNumber: "B",
      operation: "departure",
      dependencies: ["A"],
    });
    const independent: Flight = flight(2, {
      flightNumber: "C",
      operation: "arrival",
    });
    const snap = pass([cancelled, dep, independent]);
    expect(
      snap.unscheduled.find((u) => u.flight_number === "B")?.reason,
    ).toBe("dependency_cancelled");
    const r = analyzeBottleneck(snap, { timezone: TZ });
    expect(r.bottleneck_exists).toBe(false);
    expect(r.note).toBe("no scheduled dependency edges");
  });
});

describe("analyzeBottleneck — determinism", () => {
  it("returns byte-identical reports for repeated calls on the same snapshot", () => {
    const snap = pass([
      flight(0, { flightNumber: "A", operation: "arrival" }),
      flight(1, { flightNumber: "B", operation: "departure", dependencies: ["A"] }),
      flight(2, { flightNumber: "C", operation: "arrival", dependencies: ["B"] }),
    ]);
    const a = analyzeBottleneck(snap, { timezone: TZ });
    const b = analyzeBottleneck(snap, { timezone: TZ });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
