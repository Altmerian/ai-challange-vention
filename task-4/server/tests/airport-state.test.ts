import { describe, expect, it } from "vitest";

import { AirportState, type ScheduleSnapshot } from "../src/airport-state.js";
import type { Config } from "../src/config.js";

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
