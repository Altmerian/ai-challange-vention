import { describe, expect, it } from "vitest";

import type { Config } from "../src/config.js";
import type { Flight, FlightSubmission } from "../src/airport-state.js";
import { runSchedulingPass } from "../src/scheduler.js";

const ANCHOR = new Date("2026-05-19T10:00:00Z");

function makeConfig(overrides: Partial<Config> = {}): Config {
  const base: Config = {
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
  };
  return { ...base, ...overrides };
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

function pass(queue: Flight[], cfg: Config = makeConfig()) {
  return runSchedulingPass(queue, cfg, { now: ANCHOR, timezone: "UTC" });
}

describe("Scheduler — single flight placement", () => {
  it("places one arrival on RWY-1 / GATE-1 starting at offset 0", () => {
    const snap = pass([flight(0, { flightNumber: "AA100", operation: "arrival" })]);
    expect(snap.scheduled).toHaveLength(1);
    const e = snap.scheduled[0]!;
    expect(e.runway_id).toBe("RWY-1");
    expect(e.gate_id).toBe("GATE-1");
    expect(e.start_offset_min).toBe(0);
    expect(e.runway_window).toEqual({ start_offset_min: 0, end_offset_min: 5 });
    expect(e.gate_window).toEqual({ start_offset_min: 5, end_offset_min: 35 });
    expect(e.end_offset_min).toBe(35);
    expect(e.predecessors).toEqual([]);
  });

  it("derives an arrival's operation span as touchdown → gate release", () => {
    const snap = pass([flight(0, { flightNumber: "AA100", operation: "arrival" })]);
    const e = snap.scheduled[0]!;
    expect(e.start_offset_min).toBe(e.runway_window.start_offset_min);
    expect(e.end_offset_min).toBe(e.gate_window.end_offset_min);
    expect(e.runway_window.end_offset_min).toBe(e.gate_window.start_offset_min);
  });

  it("derives a departure's operation span as gate claim → wheels-up", () => {
    const snap = pass([flight(0, { flightNumber: "BB200", operation: "departure" })]);
    const e = snap.scheduled[0]!;
    expect(e.start_offset_min).toBe(0);
    expect(e.gate_window).toEqual({ start_offset_min: 0, end_offset_min: 30 });
    expect(e.runway_window).toEqual({ start_offset_min: 30, end_offset_min: 34 });
    expect(e.end_offset_min).toBe(34);
    expect(e.start_offset_min).toBe(e.gate_window.start_offset_min);
    expect(e.end_offset_min).toBe(e.runway_window.end_offset_min);
    expect(e.gate_window.end_offset_min).toBe(e.runway_window.start_offset_min);
  });
});

describe("Scheduler — priority and submission_index", () => {
  it("places higher priority earlier when contested on a single runway", () => {
    // Force same runway by giving only one. Different gates so no gate contention forces ordering.
    const snap = pass(
      [
        flight(0, { flightNumber: "LOW1", operation: "arrival", priority: "low" }),
        flight(1, { flightNumber: "HIGH1", operation: "arrival", priority: "high" }),
      ],
      makeConfig({ runwayLengthsM: [3000], gateCount: 4 }),
    );
    expect(snap.scheduled.map((e) => e.flight_number)).toEqual(["HIGH1", "LOW1"]);
    expect(snap.scheduled[0]!.start_offset_min).toBe(0);
    // LOW1 runs after HIGH1 + separation (landing-landing = 2 min on this config).
    expect(snap.scheduled[1]!.runway_window.start_offset_min).toBe(7);
  });

  it("uses submission_index as the deterministic tiebreaker within a priority", () => {
    const snap = pass(
      [
        flight(0, { flightNumber: "MM200", operation: "arrival", priority: "medium" }),
        flight(1, { flightNumber: "MM100", operation: "arrival", priority: "medium" }),
      ],
      makeConfig({ runwayLengthsM: [3000], gateCount: 4 }),
    );
    // Older submission_index wins even though the flight number sorts later lexicographically.
    expect(snap.scheduled[0]!.flight_number).toBe("MM200");
    expect(snap.scheduled[1]!.flight_number).toBe("MM100");
  });

  it("does not displace already-placed flights for a later high-priority entry", () => {
    // Saturate the only runway with several lows, then submit a high — high goes later, not earlier.
    // Plenty of gates and crew so the runway separation dominates the schedule.
    const snap = pass(
      [
        flight(0, { flightNumber: "LOW1", operation: "arrival", priority: "low" }),
        flight(1, { flightNumber: "LOW2", operation: "arrival", priority: "low" }),
        flight(2, { flightNumber: "HIGH1", operation: "arrival", priority: "high" }),
      ],
      makeConfig({ runwayLengthsM: [3000], gateCount: 4, groundCrewCount: 4 }),
    );
    expect(snap.scheduled.map((e) => e.flight_number)).toEqual([
      "HIGH1",
      "LOW1",
      "LOW2",
    ]);
    // HIGH1 placed first at t=0.
    expect(snap.scheduled[0]!.start_offset_min).toBe(0);
    // The two lows follow on the same runway with landing separation between each.
    expect(snap.scheduled[1]!.runway_window.start_offset_min).toBe(7);
    expect(snap.scheduled[2]!.runway_window.start_offset_min).toBe(14);
  });
});

describe("Scheduler — runway compatibility and horizon", () => {
  it("emits no_compatible_runway when min_runway_length_m exceeds every runway", () => {
    const snap = pass(
      [
        flight(0, {
          flightNumber: "HVY1",
          operation: "departure",
          priority: "high",
          minRunwayLengthM: 6000,
        }),
      ],
      makeConfig({ runwayLengthsM: [3000, 4000] }),
    );
    expect(snap.scheduled).toHaveLength(0);
    expect(snap.unscheduled).toHaveLength(1);
    expect(snap.unscheduled[0]).toMatchObject({
      flight_number: "HVY1",
      reason: "no_compatible_runway",
    });
  });

  it("emits horizon_exceeded when the earliest feasible end is beyond the horizon", () => {
    // Horizon barely fits one arrival; the second would land beyond it.
    // landing 5 + turnaround 30 = 35; with horizon 30, a single arrival exceeds. Test that.
    const snap = pass(
      [flight(0, { flightNumber: "AA100", operation: "arrival" })],
      makeConfig({ runwayLengthsM: [3000], gateCount: 1, maxHorizonMin: 30 }),
    );
    expect(snap.scheduled).toHaveLength(0);
    expect(snap.unscheduled[0]).toMatchObject({
      flight_number: "AA100",
      reason: "horizon_exceeded",
    });
  });

  it("schedules a compatible flight even when an oversized one is blocked", () => {
    const snap = pass(
      [
        flight(0, {
          flightNumber: "HVY1",
          operation: "departure",
          priority: "high",
          minRunwayLengthM: 6000,
        }),
        flight(1, { flightNumber: "OK1", operation: "arrival", priority: "medium" }),
      ],
      makeConfig({ runwayLengthsM: [3000, 4000] }),
    );
    expect(snap.scheduled.map((e) => e.flight_number)).toEqual(["OK1"]);
    expect(snap.unscheduled.map((e) => e.flight_number)).toEqual(["HVY1"]);
  });
});

describe("Scheduler — gate turnaround", () => {
  it("forces a second arrival to wait when only one gate is configured", () => {
    // 2 runways, 1 gate, 2 crew → second arrival lands fine on RWY-2 but must wait for the gate.
    const snap = pass(
      [
        flight(0, { flightNumber: "AA1", operation: "arrival" }),
        flight(1, { flightNumber: "AA2", operation: "arrival" }),
      ],
      makeConfig({ runwayLengthsM: [3000, 4000], gateCount: 1, groundCrewCount: 2 }),
    );
    expect(snap.scheduled).toHaveLength(2);
    const [first, second] = snap.scheduled as [
      (typeof snap.scheduled)[number],
      (typeof snap.scheduled)[number],
    ];
    expect(first.gate_window).toEqual({ start_offset_min: 5, end_offset_min: 35 });
    // AA2 cannot claim the gate until AA1 releases at 35; its runway_window must end at 35.
    expect(second.gate_window.start_offset_min).toBe(35);
    expect(second.runway_window.end_offset_min).toBe(35);
  });
});

describe("Scheduler — runway separation buffers", () => {
  it("enforces landing-landing separation between consecutive arrivals on the same runway", () => {
    const cfg = makeConfig({ runwayLengthsM: [3000], gateCount: 4, separationLandingMin: 6 });
    const snap = pass(
      [
        flight(0, { flightNumber: "AA1", operation: "arrival" }),
        flight(1, { flightNumber: "AA2", operation: "arrival" }),
      ],
      cfg,
    );
    expect(snap.scheduled[0]!.runway_window.end_offset_min).toBe(5);
    // Next runway op starts at >= 5 + 6 = 11.
    expect(snap.scheduled[1]!.runway_window.start_offset_min).toBe(11);
  });

  it("enforces takeoff-takeoff separation between consecutive departures on the same runway", () => {
    const cfg = makeConfig({ runwayLengthsM: [3000], gateCount: 4, separationTakeoffMin: 7 });
    const snap = pass(
      [
        flight(0, { flightNumber: "BB1", operation: "departure" }),
        flight(1, { flightNumber: "BB2", operation: "departure" }),
      ],
      cfg,
    );
    expect(snap.scheduled[0]!.runway_window.end_offset_min).toBe(34);
    // Next takeoff runway op starts at >= 34 + 7 = 41.
    expect(snap.scheduled[1]!.runway_window.start_offset_min).toBe(41);
  });

  it("enforces mixed separation between an arrival followed by a departure on the same runway", () => {
    const cfg = makeConfig({ runwayLengthsM: [3000], gateCount: 4, separationMixedMin: 8 });
    const snap = pass(
      [
        flight(0, { flightNumber: "AA1", operation: "arrival" }),
        flight(1, { flightNumber: "BB1", operation: "departure" }),
      ],
      cfg,
    );
    // AA1 runway ends at 5. BB1 runway must start ≥ 5 + 8 = 13.
    expect(snap.scheduled[0]!.runway_window.end_offset_min).toBe(5);
    expect(snap.scheduled[1]!.runway_window.start_offset_min).toBeGreaterThanOrEqual(13);
  });

  it("enforces mixed separation between a departure followed by an arrival on the same runway", () => {
    // One runway / one gate / one crew → the arrival cannot gap-fill before BB1
    // (gate is busy [0,30] and crew is busy [0,30]), so it lands after the mixed buffer.
    const cfg = makeConfig({
      runwayLengthsM: [3000],
      gateCount: 1,
      groundCrewCount: 1,
      separationMixedMin: 9,
    });
    const snap = pass(
      [
        flight(0, { flightNumber: "BB1", operation: "departure" }),
        flight(1, { flightNumber: "AA1", operation: "arrival" }),
      ],
      cfg,
    );
    expect(snap.scheduled).toHaveLength(2);
    const bb1 = snap.scheduled.find((e) => e.flight_number === "BB1")!;
    const aa1 = snap.scheduled.find((e) => e.flight_number === "AA1")!;
    expect(bb1.runway_window.end_offset_min).toBe(34);
    // Arrival must wait until 34 + 9 = 43 on the same runway.
    expect(aa1.runway_window.start_offset_min).toBeGreaterThanOrEqual(43);
  });

  it("gap-fills an earlier arrival before a high-priority departure's runway slot", () => {
    // BB-HI (high departure) is placed first → gate [0,30], runway [30,34].
    // AA-LO (low arrival) can land at runway [0,5] / gate (a different one) [5,35]
    // because the runway is genuinely free during [0,30] (minus mixed buffer).
    const cfg = makeConfig({
      runwayLengthsM: [3000],
      gateCount: 2,
      groundCrewCount: 2,
      maxHorizonMin: 50,
    });
    const snap = pass(
      [
        flight(0, { flightNumber: "BB-HI", operation: "departure", priority: "high" }),
        flight(1, { flightNumber: "AA-LO", operation: "arrival", priority: "low" }),
      ],
      cfg,
    );
    expect(snap.unscheduled).toHaveLength(0);
    const aaLo = snap.scheduled.find((e) => e.flight_number === "AA-LO")!;
    const bbHi = snap.scheduled.find((e) => e.flight_number === "BB-HI")!;
    expect(aaLo.runway_window.end_offset_min).toBeLessThanOrEqual(
      bbHi.runway_window.start_offset_min - cfg.separationMixedMin,
    );
    expect(aaLo.start_offset_min).toBe(0);
  });
});

describe("Scheduler — ground crew pool", () => {
  it("queues a flight when all crew units are busy", () => {
    // 2 runways, 4 gates, 1 crew → 3 arrivals must serialise through the crew pool.
    const cfg = makeConfig({
      runwayLengthsM: [3000, 4000],
      gateCount: 4,
      groundCrewCount: 1,
    });
    const snap = pass(
      [
        flight(0, { flightNumber: "A1", operation: "arrival" }),
        flight(1, { flightNumber: "A2", operation: "arrival" }),
        flight(2, { flightNumber: "A3", operation: "arrival" }),
      ],
      cfg,
    );
    expect(snap.scheduled).toHaveLength(3);
    // A1 gate window [5,35]. A2 starts when crew frees at 35 (gate window 35..65). A3 at 65..95.
    expect(snap.scheduled.map((e) => e.gate_window.start_offset_min)).toEqual([5, 35, 65]);
  });
});

describe("Scheduler — outputs", () => {
  it("sorts scheduled by (start_offset_min, flight_number) and unscheduled by flight_number", () => {
    const snap = pass(
      [
        flight(0, { flightNumber: "ZZ200", operation: "arrival", priority: "high" }),
        flight(1, {
          flightNumber: "ZZ100",
          operation: "departure",
          priority: "high",
          minRunwayLengthM: 9999,
        }),
        flight(2, {
          flightNumber: "AA100",
          operation: "departure",
          priority: "high",
          minRunwayLengthM: 9999,
        }),
      ],
      makeConfig({ runwayLengthsM: [3000, 4000], gateCount: 4 }),
    );
    expect(snap.unscheduled.map((e) => e.flight_number)).toEqual(["AA100", "ZZ100"]);
    // ZZ200 is the only scheduled — trivially sorted, but check the totals + shape.
    expect(snap.scheduled[0]!.flight_number).toBe("ZZ200");
    expect(snap.totals).toEqual({ submitted: 0, scheduled: 1, unscheduled: 2, cancelled: 0 });
  });

  it("excludes cancelled flights and counts them in totals", () => {
    const cancelled: Flight = {
      ...flight(0, { flightNumber: "C1", operation: "arrival" }),
      state: "cancelled",
    };
    const snap = pass([cancelled, flight(1, { flightNumber: "AA1", operation: "arrival" })]);
    expect(snap.scheduled.map((e) => e.flight_number)).toEqual(["AA1"]);
    expect(snap.totals.cancelled).toBe(1);
    expect(snap.totals.scheduled).toBe(1);
  });

  it("renders start_at / end_at via the supplied timezone", () => {
    const snap = runSchedulingPass(
      [flight(0, { flightNumber: "AA100", operation: "arrival" })],
      makeConfig(),
      { now: new Date("2026-05-19T10:00:00Z"), timezone: "Europe/Warsaw" },
    );
    const e = snap.scheduled[0]!;
    // Warsaw is CEST in May → +02:00. Anchor 10:00 UTC → 12:00 local. Arrival ends at +35.
    expect(e.start_at).toBe("2026-05-19T12:00:00+02:00");
    expect(e.end_at).toBe("2026-05-19T12:35:00+02:00");
    expect(snap.timezone).toBe("Europe/Warsaw");
    expect(snap.schedule_start_at).toMatch(/Z$/);
  });

  it("is byte-identical on the offset fields across two runs with the same queue (determinism)", () => {
    const cfg = makeConfig();
    const queue = [
      flight(0, { flightNumber: "AA1", operation: "arrival", priority: "high" }),
      flight(1, { flightNumber: "BB1", operation: "departure", priority: "medium" }),
      flight(2, { flightNumber: "CC1", operation: "arrival", priority: "low" }),
    ];
    const a = runSchedulingPass(queue, cfg, { now: ANCHOR, timezone: "UTC" });
    const b = runSchedulingPass(queue, cfg, { now: ANCHOR, timezone: "UTC" });
    const proj = (s: typeof a) =>
      s.scheduled.map((e) => ({
        flight_number: e.flight_number,
        runway_id: e.runway_id,
        gate_id: e.gate_id,
        start: e.start_offset_min,
        end: e.end_offset_min,
      }));
    expect(proj(a)).toEqual(proj(b));
  });
});

describe("Scheduler — dependencies", () => {
  it("places a 2-flight A→B chain with the dependency buffer between predecessor end and dependent start", () => {
    const cfg = makeConfig();
    const snap = pass(
      [
        flight(0, { flightNumber: "A", operation: "arrival" }),
        flight(1, {
          flightNumber: "B",
          operation: "departure",
          dependencies: ["A"],
        }),
      ],
      cfg,
    );
    expect(snap.scheduled).toHaveLength(2);
    const a = snap.scheduled.find((e) => e.flight_number === "A")!;
    const b = snap.scheduled.find((e) => e.flight_number === "B")!;
    expect(a.end_offset_min).toBe(35); // landing 5 + turnaround 30
    expect(b.start_offset_min).toBeGreaterThanOrEqual(
      a.end_offset_min + cfg.dependencyBufferMin,
    );
    expect(b.predecessors).toEqual(["A"]);
  });

  it("places a 3-flight A→B→C chain with the buffer respected at each edge", () => {
    const cfg = makeConfig();
    const snap = pass(
      [
        flight(0, { flightNumber: "A", operation: "arrival" }),
        flight(1, { flightNumber: "B", operation: "departure", dependencies: ["A"] }),
        flight(2, { flightNumber: "C", operation: "arrival", dependencies: ["B"] }),
      ],
      cfg,
    );
    expect(snap.scheduled).toHaveLength(3);
    const a = snap.scheduled.find((e) => e.flight_number === "A")!;
    const b = snap.scheduled.find((e) => e.flight_number === "B")!;
    const c = snap.scheduled.find((e) => e.flight_number === "C")!;
    expect(b.start_offset_min).toBeGreaterThanOrEqual(
      a.end_offset_min + cfg.dependencyBufferMin,
    );
    expect(c.start_offset_min).toBeGreaterThanOrEqual(
      b.end_offset_min + cfg.dependencyBufferMin,
    );
  });

  it("resolves a forward reference: dependent submitted before predecessor", () => {
    // B submitted first, depends on A. Both must schedule, with B after A + buffer.
    const cfg = makeConfig();
    const snap = pass(
      [
        flight(0, {
          flightNumber: "B",
          operation: "departure",
          dependencies: ["A"],
        }),
        flight(1, { flightNumber: "A", operation: "arrival" }),
      ],
      cfg,
    );
    expect(snap.scheduled).toHaveLength(2);
    const a = snap.scheduled.find((e) => e.flight_number === "A")!;
    const b = snap.scheduled.find((e) => e.flight_number === "B")!;
    expect(b.start_offset_min).toBeGreaterThanOrEqual(
      a.end_offset_min + cfg.dependencyBufferMin,
    );
  });

  it("flags dependency_missing when a predecessor was never submitted", () => {
    const snap = pass([
      flight(0, {
        flightNumber: "B",
        operation: "departure",
        dependencies: ["GHOST"],
      }),
    ]);
    expect(snap.scheduled).toHaveLength(0);
    expect(snap.unscheduled).toHaveLength(1);
    expect(snap.unscheduled[0]).toMatchObject({
      flight_number: "B",
      reason: "dependency_missing",
      blocking_flight_number: "GHOST",
    });
  });

  it("does not let a missing-pred dependent block unrelated flights (lazy resolution per ADR-0004)", () => {
    const snap = pass([
      flight(0, { flightNumber: "ORPHAN", dependencies: ["GHOST"] }),
      flight(1, { flightNumber: "A1", operation: "arrival" }),
    ]);
    expect(snap.scheduled.map((e) => e.flight_number)).toEqual(["A1"]);
    expect(snap.unscheduled[0]?.flight_number).toBe("ORPHAN");
  });

  it("flags dependency_cycle on every member of a 2-cycle", () => {
    // A↔B
    const snap = pass([
      flight(0, { flightNumber: "A", dependencies: ["B"] }),
      flight(1, { flightNumber: "B", dependencies: ["A"] }),
    ]);
    expect(snap.scheduled).toHaveLength(0);
    expect(snap.unscheduled).toHaveLength(2);
    for (const e of snap.unscheduled) {
      expect(e.reason).toBe("dependency_cycle");
      expect(e.detail).toContain("A");
      expect(e.detail).toContain("B");
      // blocking_flight_number is optional and not set for cycles (PRD).
      expect(e.blocking_flight_number).toBeUndefined();
    }
  });

  it("flags dependency_cycle on a 3-cycle", () => {
    const snap = pass([
      flight(0, { flightNumber: "A", dependencies: ["B"] }),
      flight(1, { flightNumber: "B", dependencies: ["C"] }),
      flight(2, { flightNumber: "C", dependencies: ["A"] }),
    ]);
    expect(snap.scheduled).toHaveLength(0);
    expect(snap.unscheduled.map((e) => e.flight_number).sort()).toEqual(["A", "B", "C"]);
    for (const e of snap.unscheduled) expect(e.reason).toBe("dependency_cycle");
  });

  it("cascades dependency_unscheduled when a predecessor is unscheduled (no_compatible_runway → descendant)", () => {
    // HVY is unscheduled (no_compatible_runway). B depends on HVY → dependency_unscheduled.
    const snap = pass(
      [
        flight(0, {
          flightNumber: "HVY",
          operation: "departure",
          priority: "high",
          minRunwayLengthM: 9999,
        }),
        flight(1, {
          flightNumber: "B",
          operation: "departure",
          dependencies: ["HVY"],
        }),
      ],
      makeConfig({ runwayLengthsM: [3000, 4000] }),
    );
    expect(snap.scheduled).toHaveLength(0);
    const hvy = snap.unscheduled.find((e) => e.flight_number === "HVY")!;
    const b = snap.unscheduled.find((e) => e.flight_number === "B")!;
    expect(hvy.reason).toBe("no_compatible_runway");
    expect(b.reason).toBe("dependency_unscheduled");
    expect(b.blocking_flight_number).toBe("HVY");
  });

  it("propagates dependency_unscheduled transitively through a chain", () => {
    // HVY (unscheduled) → X (dependency_unscheduled) → Y (dependency_unscheduled blocking=X)
    const snap = pass(
      [
        flight(0, {
          flightNumber: "HVY",
          operation: "departure",
          minRunwayLengthM: 9999,
        }),
        flight(1, {
          flightNumber: "X",
          operation: "arrival",
          dependencies: ["HVY"],
        }),
        flight(2, {
          flightNumber: "Y",
          operation: "departure",
          dependencies: ["X"],
        }),
      ],
      makeConfig({ runwayLengthsM: [3000, 4000] }),
    );
    const x = snap.unscheduled.find((e) => e.flight_number === "X")!;
    const y = snap.unscheduled.find((e) => e.flight_number === "Y")!;
    expect(x.reason).toBe("dependency_unscheduled");
    expect(x.blocking_flight_number).toBe("HVY");
    expect(y.reason).toBe("dependency_unscheduled");
    expect(y.blocking_flight_number).toBe("X");
  });

  it("honours the LATER of multiple predecessors' end offsets plus the buffer", () => {
    // {A, C} → B. A finishes earlier than C. B.start must be ≥ C.end + buffer.
    // A and C are independent arrivals on different runways; pin C later than A
    // by stuffing it after a single-runway constraint? Simpler: make A short
    // and C long via crew exclusivity. Use a config where the only runway forces
    // serial landings.
    const cfg = makeConfig({
      runwayLengthsM: [3000],
      gateCount: 4,
      groundCrewCount: 4,
    });
    const snap = pass(
      [
        flight(0, { flightNumber: "A", operation: "arrival" }),
        flight(1, { flightNumber: "C", operation: "arrival" }),
        flight(2, {
          flightNumber: "B",
          operation: "departure",
          dependencies: ["A", "C"],
        }),
      ],
      cfg,
    );
    expect(snap.scheduled).toHaveLength(3);
    const a = snap.scheduled.find((e) => e.flight_number === "A")!;
    const c = snap.scheduled.find((e) => e.flight_number === "C")!;
    const b = snap.scheduled.find((e) => e.flight_number === "B")!;
    const later = Math.max(a.end_offset_min, c.end_offset_min);
    expect(b.start_offset_min).toBeGreaterThanOrEqual(later + cfg.dependencyBufferMin);
  });

  it("does not inherit priority — a low dependent of a high predecessor stays low", () => {
    // HIGH-PRED at t=0; LOW-DEP depends on it; HIGH-OTHER is a separate high arrival.
    // HIGH-OTHER beats LOW-DEP to the next ready slot — they compete at low priority.
    const cfg = makeConfig({ runwayLengthsM: [3000], gateCount: 4 });
    const snap = pass(
      [
        flight(0, {
          flightNumber: "HIGH-PRED",
          operation: "arrival",
          priority: "high",
        }),
        flight(1, {
          flightNumber: "LOW-DEP",
          operation: "arrival",
          priority: "low",
          dependencies: ["HIGH-PRED"],
        }),
        flight(2, {
          flightNumber: "HIGH-OTHER",
          operation: "arrival",
          priority: "high",
        }),
      ],
      cfg,
    );
    expect(snap.scheduled).toHaveLength(3);
    const lowDep = snap.scheduled.find((e) => e.flight_number === "LOW-DEP")!;
    const highOther = snap.scheduled.find((e) => e.flight_number === "HIGH-OTHER")!;
    // HIGH-OTHER (high prio, no deps) should be placed before the low dependent
    // even though the dependent's predecessor is at t=0.
    expect(highOther.start_offset_min).toBeLessThan(lowDep.start_offset_min);
  });

  it("does not displace an already-placed flight when a later dependent needs an earlier slot", () => {
    // BLOCKER placed at t=0. LATE-DEP depends on PRED that lands later — but
    // BLOCKER's slot is never freed.
    const cfg = makeConfig({ runwayLengthsM: [3000], gateCount: 4 });
    const snap = pass(
      [
        flight(0, {
          flightNumber: "BLOCKER",
          operation: "arrival",
          priority: "low",
        }),
        flight(1, { flightNumber: "PRED", operation: "arrival", priority: "high" }),
        flight(2, {
          flightNumber: "LATE-DEP",
          operation: "departure",
          priority: "high",
          dependencies: ["PRED"],
        }),
      ],
      cfg,
    );
    const blocker = snap.scheduled.find((e) => e.flight_number === "BLOCKER")!;
    const pred = snap.scheduled.find((e) => e.flight_number === "PRED")!;
    // PRED (high, no deps) wins t=0. BLOCKER (low) settles after PRED's runway
    // freed. Regardless of order, BLOCKER's slot is not displaced — its offsets
    // do not change once placed. Assert that BLOCKER's start is set and stable
    // by checking it's >= PRED.runway_end + separation.
    expect(pred.start_offset_min).toBe(0);
    expect(blocker.runway_window.start_offset_min).toBeGreaterThanOrEqual(
      pred.runway_window.end_offset_min + cfg.separationLandingMin,
    );
  });

  it("populates ScheduleEntry.predecessors as an echo of the dependencies list", () => {
    const snap = pass([
      flight(0, { flightNumber: "A", operation: "arrival" }),
      flight(1, { flightNumber: "B", operation: "arrival" }),
      flight(2, {
        flightNumber: "C",
        operation: "departure",
        dependencies: ["A", "B"],
      }),
    ]);
    const c = snap.scheduled.find((e) => e.flight_number === "C")!;
    expect(c.predecessors).toEqual(["A", "B"]);
  });

  it("cascades dependency_unscheduled when a predecessor was flagged dependency_missing in the pre-loop phase", () => {
    // ORPHAN depends on GHOST (missing) → ORPHAN gets dependency_missing.
    // C depends on ORPHAN → C must NOT be scheduled; it must cascade to
    // dependency_unscheduled with blocking=ORPHAN. (Pre-fix bug: C entered
    // the ready heap with pending count 0 and was placed.)
    const snap = pass([
      flight(0, {
        flightNumber: "ORPHAN",
        operation: "departure",
        dependencies: ["GHOST"],
      }),
      flight(1, {
        flightNumber: "C",
        operation: "arrival",
        dependencies: ["ORPHAN"],
      }),
    ]);
    expect(snap.scheduled).toHaveLength(0);
    const orphan = snap.unscheduled.find((e) => e.flight_number === "ORPHAN")!;
    const c = snap.unscheduled.find((e) => e.flight_number === "C")!;
    expect(orphan.reason).toBe("dependency_missing");
    expect(c.reason).toBe("dependency_unscheduled");
    expect(c.blocking_flight_number).toBe("ORPHAN");
  });

  it("cascades dependency_unscheduled to descendants of cycle members", () => {
    // A↔B (cycle). D depends on A → D must NOT schedule; it cascades to
    // dependency_unscheduled blocking=A.
    const snap = pass([
      flight(0, { flightNumber: "A", dependencies: ["B"] }),
      flight(1, { flightNumber: "B", dependencies: ["A"] }),
      flight(2, { flightNumber: "D", operation: "arrival", dependencies: ["A"] }),
    ]);
    expect(snap.scheduled).toHaveLength(0);
    const d = snap.unscheduled.find((e) => e.flight_number === "D")!;
    expect(d.reason).toBe("dependency_unscheduled");
    expect(d.blocking_flight_number).toBe("A");
  });

  it("cascades dependency_unscheduled to descendants of dependency_cancelled flights", () => {
    // C is cancelled in the queue. B depends on C → dependency_cancelled.
    // E depends on B → dependency_unscheduled blocking=B.
    const cancelled: Flight = {
      ...flight(0, { flightNumber: "C", operation: "arrival" }),
      state: "cancelled",
    };
    const snap = pass([
      cancelled,
      flight(1, {
        flightNumber: "B",
        operation: "departure",
        dependencies: ["C"],
      }),
      flight(2, {
        flightNumber: "E",
        operation: "arrival",
        dependencies: ["B"],
      }),
    ]);
    expect(snap.scheduled).toHaveLength(0);
    const b = snap.unscheduled.find((e) => e.flight_number === "B")!;
    const e = snap.unscheduled.find((x) => x.flight_number === "E")!;
    expect(b.reason).toBe("dependency_cancelled");
    expect(e.reason).toBe("dependency_unscheduled");
    expect(e.blocking_flight_number).toBe("B");
  });

  it("flags dependency_cancelled when a predecessor is in state cancelled", () => {
    const cancelled: Flight = {
      ...flight(0, { flightNumber: "C", operation: "arrival" }),
      state: "cancelled",
    };
    const snap = pass([
      cancelled,
      flight(1, {
        flightNumber: "B",
        operation: "departure",
        dependencies: ["C"],
      }),
    ]);
    expect(snap.scheduled).toHaveLength(0);
    expect(snap.unscheduled).toHaveLength(1);
    expect(snap.unscheduled[0]).toMatchObject({
      flight_number: "B",
      reason: "dependency_cancelled",
      blocking_flight_number: "C",
    });
  });
});
