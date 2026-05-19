import { describe, expect, it } from "vitest";

import { AirportState, type ScheduleSnapshot } from "../src/airport-state.js";
import type { Config } from "../src/config.js";
import { runSchedulingPass } from "../src/scheduler.js";

const CANCEL_OPTIONS = { now: new Date("2026-05-19T10:00:00Z"), timezone: "UTC" } as const;

const EMPTY_SNAPSHOT: ScheduleSnapshot = {
  generated_at: "2026-05-19T10:00:00Z",
  schedule_start_at: "2026-05-19T10:00:00Z",
  timezone: "UTC",
  horizon_min: 240,
  scheduled: [],
  unscheduled: [],
  totals: { submitted: 0, scheduled: 0, unscheduled: 0, cancelled: 0 },
};

function makeState(): AirportState {
  const cfg: Config = {
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
  return new AirportState(cfg);
}

describe("AirportState.addFlight", () => {
  it("assigns submission_index 0 to the first flight and increments", () => {
    const state = makeState();
    const a = state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    const b = state.addFlight({
      flightNumber: "BB200",
      operation: "departure",
      priority: "low",
      dependencies: [],
    });
    expect(a.ok && a.flight.submissionIndex).toBe(0);
    expect(b.ok && b.flight.submissionIndex).toBe(1);
    expect(state.nextSubmissionIndex).toBe(2);
  });

  it("rejects a duplicate flight number with the duplicate_flight_number outcome", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    const second = state.addFlight({
      flightNumber: "AA100",
      operation: "departure",
      priority: "low",
      dependencies: [],
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("duplicate_flight_number");
    expect(second.existing.flightNumber).toBe("AA100");
    expect(state.queue).toHaveLength(1);
    // Submission index did not move forward on the failed insert.
    expect(state.nextSubmissionIndex).toBe(1);
  });

  it("stores optional min_runway_length_m only when supplied", () => {
    const state = makeState();
    const withReq = state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
      minRunwayLengthM: 3000,
    });
    const withoutReq = state.addFlight({
      flightNumber: "BB200",
      operation: "departure",
      priority: "low",
      dependencies: [],
    });
    expect(withReq.ok && withReq.flight.minRunwayLengthM).toBe(3000);
    expect(withoutReq.ok && "minRunwayLengthM" in withoutReq.flight).toBe(false);
  });

  it("findFlight returns the placed flight or undefined", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    expect(state.findFlight("AA100")?.state).toBe("submitted");
    expect(state.findFlight("ZZ999")).toBeUndefined();
  });
});

describe("AirportState.reset", () => {
  it("clears queue, schedule, and submission counter and reports the prior counts", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    state.addFlight({
      flightNumber: "BB200",
      operation: "departure",
      priority: "low",
      dependencies: [],
    });
    state.replaceSchedule(EMPTY_SNAPSHOT);

    const r1 = state.reset();
    expect(r1).toEqual({ flightsRemovedCount: 2, scheduleCleared: true });
    expect(state.queue).toHaveLength(0);
    expect(state.nextSubmissionIndex).toBe(0);
    expect(state.findFlight("AA100")).toBeUndefined();

    const r2 = state.reset();
    expect(r2).toEqual({ flightsRemovedCount: 0, scheduleCleared: false });
  });

  it("frees the flight number for re-submission only because uniqueness is per-process: same number after reset is allowed", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    state.reset();
    const again = state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    expect(again.ok).toBe(true);
  });
});

describe("AirportState.cancelFlight", () => {
  it("returns unknown_flight_number for a flight that was never submitted", () => {
    const state = makeState();
    const outcome = state.cancelFlight("ZZ999", CANCEL_OPTIONS);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("unknown_flight_number");
  });

  it("cancels a submitted flight, runs a pass, and stores the snapshot", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "AA100",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    const outcome = state.cancelFlight("AA100", CANCEL_OPTIONS);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(state.findFlight("AA100")?.state).toBe("cancelled");
    expect(outcome.schedule.scheduled).toHaveLength(0);
    expect(outcome.schedule.unscheduled).toHaveLength(0);
    expect(outcome.schedule.totals.cancelled).toBe(1);
    // Snapshot stored: subsequent reads see the cancellation reflected.
    expect(state.schedule).toBe(outcome.schedule);
  });

  it("cancels a scheduled leaf flight without dependents and keeps neighbouring offsets byte-identical (narrow stability)", () => {
    // Over-provisioned: 4 gates, 2 runways, 2 crew, no contention.
    const state = makeState();
    state.addFlight({
      flightNumber: "KEEP",
      operation: "arrival",
      priority: "medium",
      dependencies: [],
    });
    state.addFlight({
      flightNumber: "LEAF",
      operation: "departure",
      priority: "low",
      dependencies: [],
    });
    // Establish a pre-cancel baseline schedule where LEAF was actually scheduled,
    // so the post-cancel comparison is against a real scheduled-leaf state.
    const baseline = runSchedulingPass(state.queue, state.config, CANCEL_OPTIONS);
    state.replaceSchedule(baseline);
    expect(baseline.scheduled).toHaveLength(2);
    expect(state.findFlight("LEAF")?.state).toBe("scheduled");
    const keepBefore = baseline.scheduled.find((e) => e.flight_number === "KEEP")!;

    const outcome = state.cancelFlight("LEAF", CANCEL_OPTIONS);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.schedule.scheduled).toHaveLength(1);
    const keepAfter = outcome.schedule.scheduled.find((e) => e.flight_number === "KEEP")!;
    // Narrow stability: cancelling an uncontested leaf leaves KEEP's placement
    // byte-identical (offsets, windows, runway/gate assignment).
    expect(keepAfter.start_offset_min).toBe(keepBefore.start_offset_min);
    expect(keepAfter.end_offset_min).toBe(keepBefore.end_offset_min);
    expect(keepAfter.runway_id).toBe(keepBefore.runway_id);
    expect(keepAfter.gate_id).toBe(keepBefore.gate_id);
    expect(keepAfter.runway_window).toEqual(keepBefore.runway_window);
    expect(keepAfter.gate_window).toEqual(keepBefore.gate_window);
  });

  it("cancels an unscheduled flight and flips its state to cancelled", () => {
    // Configure a no_compatible_runway flight by requiring a length no runway provides.
    const state = makeState();
    state.addFlight({
      flightNumber: "HVY",
      operation: "departure",
      priority: "high",
      dependencies: [],
      minRunwayLengthM: 9999,
    });
    // Run the pass so HVY lands in state `unscheduled` first.
    const baseline = runSchedulingPass(state.queue, state.config, CANCEL_OPTIONS);
    state.replaceSchedule(baseline);
    expect(state.findFlight("HVY")?.state).toBe("unscheduled");

    const outcome = state.cancelFlight("HVY", CANCEL_OPTIONS);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(state.findFlight("HVY")?.state).toBe("cancelled");
    expect(outcome.schedule.scheduled).toHaveLength(0);
    expect(outcome.schedule.unscheduled).toHaveLength(0);
    expect(outcome.schedule.totals.cancelled).toBe(1);
  });

  it("cancels a scheduled flight with one dependent and cascades dependency_cancelled to it", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "A",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    state.addFlight({
      flightNumber: "B",
      operation: "departure",
      priority: "medium",
      dependencies: ["A"],
    });
    const outcome = state.cancelFlight("A", CANCEL_OPTIONS);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const b = outcome.schedule.unscheduled.find((e) => e.flight_number === "B");
    expect(b?.reason).toBe("dependency_cancelled");
    expect(b?.blocking_flight_number).toBe("A");
    expect(state.findFlight("A")?.state).toBe("cancelled");
    expect(state.findFlight("B")?.state).toBe("unscheduled");
  });

  it("cascades transitively: cancelling A leaves B as dependency_cancelled and C as dependency_unscheduled", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "A",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    state.addFlight({
      flightNumber: "B",
      operation: "departure",
      priority: "high",
      dependencies: ["A"],
    });
    state.addFlight({
      flightNumber: "C",
      operation: "departure",
      priority: "high",
      dependencies: ["B"],
    });
    const outcome = state.cancelFlight("A", CANCEL_OPTIONS);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const b = outcome.schedule.unscheduled.find((e) => e.flight_number === "B");
    const c = outcome.schedule.unscheduled.find((e) => e.flight_number === "C");
    expect(b?.reason).toBe("dependency_cancelled");
    expect(b?.blocking_flight_number).toBe("A");
    expect(c?.reason).toBe("dependency_unscheduled");
    expect(c?.blocking_flight_number).toBe("B");
  });

  it("idempotent re-cancel returns the same stored snapshot without re-running the pass", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "A",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    const first = state.cancelFlight("A", CANCEL_OPTIONS);
    expect(first.ok).toBe(true);
    const second = state.cancelFlight("A", {
      ...CANCEL_OPTIONS,
      now: new Date("2026-06-01T00:00:00Z"),
    });
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Same snapshot reference — no fresh pass on idempotent re-cancel.
    expect(second.schedule).toBe(first.schedule);
  });

  it("rejects re-submission of a cancelled flight number (uniqueness survives cancellation)", () => {
    const state = makeState();
    state.addFlight({
      flightNumber: "A",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    state.cancelFlight("A", CANCEL_OPTIONS);
    const again = state.addFlight({
      flightNumber: "A",
      operation: "departure",
      priority: "low",
      dependencies: [],
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe("duplicate_flight_number");
    expect(again.existing.state).toBe("cancelled");
  });
});
