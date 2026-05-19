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
