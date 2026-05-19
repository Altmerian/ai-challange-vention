import { describe, expect, it } from "vitest";

import { AirportState } from "../src/airport-state.js";
import {
  addMinutesToUtcMinuteIso,
  buildAirportStatus,
  buildScheduleCompletion,
  computeRunwayBusyMinutes,
  computeUtilizationPct,
} from "../src/airport-status.js";
import type { Config } from "../src/config.js";
import { runSchedulingPass, type ScheduleEntry } from "../src/scheduler.js";

const PASS_OPTIONS = { now: new Date("2026-05-19T10:00:00Z"), timezone: "UTC" } as const;

function makeConfig(overrides: Partial<Config> = {}): Config {
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
    ...overrides,
  };
}

describe("addMinutesToUtcMinuteIso", () => {
  it("returns the same instant when minutes=0", () => {
    expect(addMinutesToUtcMinuteIso("2026-05-19T10:00:00Z", 0)).toBe(
      "2026-05-19T10:00:00Z",
    );
  });

  it("rolls over to the next year", () => {
    expect(addMinutesToUtcMinuteIso("2024-12-31T23:59:00Z", 2)).toBe(
      "2025-01-01T00:01:00Z",
    );
  });

  it("crosses a leap-day boundary correctly", () => {
    // 2024-02-29 is a real day (2024 is a leap year).
    expect(addMinutesToUtcMinuteIso("2024-02-29T23:59:00Z", 1)).toBe(
      "2024-03-01T00:00:00Z",
    );
  });

  it("crosses a month boundary that is not a leap day", () => {
    expect(addMinutesToUtcMinuteIso("2025-02-28T23:59:00Z", 1)).toBe(
      "2025-03-01T00:00:00Z",
    );
  });

  it("crosses a DST-transition wall-clock boundary in UTC (no offset, no DST in UTC)", () => {
    // 2026-03-29 02:30Z is in the middle of EU spring-forward when expressed
    // in Europe/Warsaw, but UTC has no DST; arithmetic must be straight minute math.
    expect(addMinutesToUtcMinuteIso("2026-03-29T00:59:00Z", 2)).toBe(
      "2026-03-29T01:01:00Z",
    );
  });

  it("strips sub-second precision from the canonical form", () => {
    expect(addMinutesToUtcMinuteIso("2026-05-19T10:00:00Z", 60)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/,
    );
  });
});

describe("computeUtilizationPct", () => {
  it("returns 0 when horizon is non-positive", () => {
    expect(computeUtilizationPct(15, 0)).toBe(0);
    expect(computeUtilizationPct(15, -1)).toBe(0);
  });

  it("returns one-decimal-place rounding", () => {
    // 15 / 240 * 100 = 6.25 → 6.3 (round half away from zero per Math.round on positives).
    expect(computeUtilizationPct(15, 240)).toBeCloseTo(6.3, 10);
  });

  it("hits 100 when busy equals horizon", () => {
    expect(computeUtilizationPct(240, 240)).toBe(100);
  });
});

describe("computeRunwayBusyMinutes", () => {
  it("returns 0 on an empty list", () => {
    expect(computeRunwayBusyMinutes([], makeConfig())).toBe(0);
  });

  it("includes the trailing worst-case separation buffer for the last op", () => {
    // One arrival on RWY-1: runway_window [0, 5], no next op → trailing buffer
    // = max(separation_landing=2, separation_mixed=3) = 3. Total = 8.
    const entry: ScheduleEntry = {
      flight_number: "A1",
      operation: "arrival",
      priority: "high",
      runway_id: "RWY-1",
      gate_id: "GATE-1",
      start_offset_min: 0,
      end_offset_min: 35,
      runway_window: { start_offset_min: 0, end_offset_min: 5 },
      gate_window: { start_offset_min: 5, end_offset_min: 35 },
      start_at: "2026-05-19T10:00:00+00:00",
      end_at: "2026-05-19T10:35:00+00:00",
      predecessors: [],
    };
    expect(computeRunwayBusyMinutes([entry], makeConfig())).toBe(5 + 3);
  });

  it("uses same-type separation between consecutive ops of the same type", () => {
    // Two arrivals: 5 + sep(landing→landing)=2 + 5 + trailing max(2,3)=3 = 15.
    const config = makeConfig();
    const a1: ScheduleEntry = {
      flight_number: "A1",
      operation: "arrival",
      priority: "high",
      runway_id: "RWY-1",
      gate_id: "GATE-1",
      start_offset_min: 0,
      end_offset_min: 35,
      runway_window: { start_offset_min: 0, end_offset_min: 5 },
      gate_window: { start_offset_min: 5, end_offset_min: 35 },
      start_at: "x",
      end_at: "x",
      predecessors: [],
    };
    const a2: ScheduleEntry = {
      flight_number: "A2",
      operation: "arrival",
      priority: "low",
      runway_id: "RWY-1",
      gate_id: "GATE-2",
      start_offset_min: 7,
      end_offset_min: 42,
      runway_window: { start_offset_min: 7, end_offset_min: 12 },
      gate_window: { start_offset_min: 12, end_offset_min: 42 },
      start_at: "x",
      end_at: "x",
      predecessors: [],
    };
    expect(computeRunwayBusyMinutes([a1, a2], config)).toBe(15);
  });
});

describe("buildScheduleCompletion", () => {
  it("returns makespan = 0 and completion_at = schedule_start_at when no flights are scheduled", () => {
    const sc = buildScheduleCompletion({
      generated_at: "2026-05-19T10:00:00Z",
      schedule_start_at: "2026-05-19T10:00:00Z",
      timezone: "UTC",
      horizon_min: 240,
      scheduled: [],
      unscheduled: [],
      totals: { submitted: 0, scheduled: 0, unscheduled: 0, cancelled: 0 },
    });
    expect(sc).toEqual({
      schedule_start_at: "2026-05-19T10:00:00Z",
      makespan_min: 0,
      completion_at: "2026-05-19T10:00:00Z",
    });
  });

  it("returns the max end_offset_min as the makespan, and the UTC completion instant", () => {
    const sc = buildScheduleCompletion({
      generated_at: "2026-05-19T10:00:00Z",
      schedule_start_at: "2026-05-19T10:00:00Z",
      timezone: "UTC",
      horizon_min: 240,
      scheduled: [
        {
          flight_number: "A",
          operation: "arrival",
          priority: "high",
          runway_id: "RWY-1",
          gate_id: "GATE-1",
          start_offset_min: 0,
          end_offset_min: 35,
          runway_window: { start_offset_min: 0, end_offset_min: 5 },
          gate_window: { start_offset_min: 5, end_offset_min: 35 },
          start_at: "x",
          end_at: "x",
          predecessors: [],
        },
        {
          flight_number: "B",
          operation: "departure",
          priority: "medium",
          runway_id: "RWY-1",
          gate_id: "GATE-2",
          start_offset_min: 40,
          end_offset_min: 74,
          runway_window: { start_offset_min: 70, end_offset_min: 74 },
          gate_window: { start_offset_min: 40, end_offset_min: 70 },
          start_at: "x",
          end_at: "x",
          predecessors: [],
        },
      ],
      unscheduled: [],
      totals: { submitted: 0, scheduled: 2, unscheduled: 0, cancelled: 0 },
    });
    expect(sc.makespan_min).toBe(74);
    expect(sc.completion_at).toBe("2026-05-19T11:14:00Z");
  });
});

describe("buildAirportStatus", () => {
  it("returns the canonical empty-state shape", () => {
    const state = new AirportState(makeConfig({ runwayLengthsM: [2500] }));
    const status = buildAirportStatus(state);
    expect(status).toEqual({
      flights: {
        by_state: { submitted: 0, scheduled: 0, unscheduled: 0, cancelled: 0 },
        by_operation: { arrival: 0, departure: 0 },
      },
      resources: {
        runways: [
          {
            runway_id: "RWY-1",
            length_m: 2500,
            operations_count: 0,
            busy_minutes: 0,
            utilization_pct: 0,
          },
        ],
        gates: [
          { gate_id: "GATE-1", operations_count: 0, busy_minutes: 0, utilization_pct: 0 },
          { gate_id: "GATE-2", operations_count: 0, busy_minutes: 0, utilization_pct: 0 },
          { gate_id: "GATE-3", operations_count: 0, busy_minutes: 0, utilization_pct: 0 },
          { gate_id: "GATE-4", operations_count: 0, busy_minutes: 0, utilization_pct: 0 },
        ],
      },
      constraints: {
        runway_blocking: false,
        horizon_blocking: false,
        dependency_blocking: false,
        any_blocked: false,
      },
      blocked_flights: [],
      schedule_completion: null,
    });
  });

  it("does NOT recompute — repeated calls leave state.schedule reference identical", () => {
    const state = new AirportState(makeConfig());
    state.addFlight({
      flightNumber: "A1",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    const snapshot = runSchedulingPass(state.queue, state.config, PASS_OPTIONS);
    state.replaceSchedule(snapshot);

    const beforeRef = state.schedule;
    const s1 = buildAirportStatus(state);
    const s2 = buildAirportStatus(state);
    const afterRef = state.schedule;

    // Strongest evidence of "no recomputation": the stored snapshot reference
    // is the same object before and after. A scheduler rerun would install a
    // new snapshot via `replaceSchedule` and break this.
    expect(afterRef).toBe(beforeRef);

    // And the projected payload is byte-identical across calls.
    expect(JSON.stringify(s2)).toBe(JSON.stringify(s1));
  });

  it("omits blocking_flight_number on non-dependency reasons (no undefined leak)", () => {
    const state = new AirportState(makeConfig());
    state.addFlight({
      flightNumber: "HVY",
      operation: "departure",
      priority: "high",
      dependencies: [],
      minRunwayLengthM: 9999,
    });
    const snapshot = runSchedulingPass(state.queue, state.config, PASS_OPTIONS);
    state.replaceSchedule(snapshot);

    const status = buildAirportStatus(state);
    expect(status.blocked_flights).toHaveLength(1);
    const blocked = status.blocked_flights[0]!;
    expect(blocked.reason).toBe("no_compatible_runway");
    // JSON.stringify must omit the optional key — not emit "blocking_flight_number":undefined.
    const text = JSON.stringify(blocked);
    expect(text).not.toContain("blocking_flight_number");
    // And the property is absent on the runtime object, not present-with-undefined.
    expect(Object.prototype.hasOwnProperty.call(blocked, "blocking_flight_number")).toBe(
      false,
    );
  });

  it("counts queue entries by raw state and operation regardless of schedule presence", () => {
    const state = new AirportState(makeConfig());
    state.addFlight({
      flightNumber: "A1",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    state.addFlight({
      flightNumber: "A2",
      operation: "arrival",
      priority: "medium",
      dependencies: [],
    });
    state.addFlight({
      flightNumber: "D1",
      operation: "departure",
      priority: "low",
      dependencies: [],
    });

    // No pass run yet — every queue entry is still `submitted`.
    const pre = buildAirportStatus(state);
    expect(pre.flights.by_state).toEqual({
      submitted: 3,
      scheduled: 0,
      unscheduled: 0,
      cancelled: 0,
    });
    expect(pre.flights.by_operation).toEqual({ arrival: 2, departure: 1 });
  });

  it("computes the four constraints booleans from each kind of unscheduled reason", () => {
    // Override: tiny horizon to provoke `horizon_exceeded`, plus a heavy that
    // produces `no_compatible_runway`, plus a dependent of a heavy that
    // cascades to `dependency_unscheduled`.
    const state = new AirportState(makeConfig({ maxHorizonMin: 5 }));
    state.addFlight({
      flightNumber: "HVY",
      operation: "departure",
      priority: "high",
      dependencies: [],
      minRunwayLengthM: 9999,
    });
    state.addFlight({
      flightNumber: "BIG",
      operation: "arrival",
      priority: "high",
      dependencies: [],
    });
    state.addFlight({
      flightNumber: "B",
      operation: "departure",
      priority: "high",
      dependencies: ["HVY"],
    });

    const snapshot = runSchedulingPass(state.queue, state.config, PASS_OPTIONS);
    state.replaceSchedule(snapshot);

    const status = buildAirportStatus(state);
    expect(status.constraints).toEqual({
      runway_blocking: true,
      horizon_blocking: true,
      dependency_blocking: true,
      any_blocked: true,
    });
  });
});
