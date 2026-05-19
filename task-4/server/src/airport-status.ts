/**
 * Pure read-model helpers for `get_airport_status`.
 *
 * Reads `state.queue`, `state.config`, and `state.schedule` (the snapshot left
 * by the most recent `generate_schedule` or `cancel_flight`) and projects them
 * into the PRD `AirportStatus` shape — exactly, no extra keys. Does not run
 * the scheduler; repeated calls with no intervening mutation are byte-identical.
 *
 * Shared with `atc://runways` via `computeRunwayBusyMinutes` /
 * `computeUtilizationPct` so the resource view and the status tool publish the
 * same number for the same input.
 *
 * The split matches `scheduler.ts` / `timezone-formatter.ts`: domain logic
 * lives outside `mcp-server.ts`, leaving the protocol-wiring file to declare
 * schemas and register handlers.
 */

import type { AirportState } from "./airport-state.js";
import type {
  FlightOperation,
  FlightState,
} from "./airport-state.js";
import type { Config } from "./config.js";
import {
  separationFor,
  type ScheduleEntry,
  type ScheduleSnapshot,
  type UnscheduledEntry,
} from "./scheduler.js";

export type AirportStatusRunway = Readonly<{
  runway_id: string;
  length_m: number;
  operations_count: number;
  busy_minutes: number;
  utilization_pct: number;
}>;

export type AirportStatusGate = Readonly<{
  gate_id: string;
  operations_count: number;
  busy_minutes: number;
  utilization_pct: number;
}>;

export type ScheduleCompletion = Readonly<{
  schedule_start_at: string;
  makespan_min: number;
  completion_at: string;
}>;

export type AirportStatus = Readonly<{
  flights: Readonly<{
    by_state: Readonly<Record<FlightState, number>>;
    by_operation: Readonly<Record<FlightOperation, number>>;
  }>;
  resources: Readonly<{
    runways: readonly AirportStatusRunway[];
    gates: readonly AirportStatusGate[];
  }>;
  constraints: Readonly<{
    runway_blocking: boolean;
    horizon_blocking: boolean;
    dependency_blocking: boolean;
    any_blocked: boolean;
  }>;
  blocked_flights: readonly UnscheduledEntry[];
  schedule_completion: ScheduleCompletion | null;
}>;

/**
 * Sums `runway_window` durations + every trailing separation buffer. For the
 * **last** op the trailing buffer is `max(same-type sep, mixed sep)` — the
 * worst-case sep before any unknown next op (`separationFor` with `null`).
 *
 * @param byRunwayWindow operations on a single runway, sorted by
 *   `runway_window.start_offset_min`.
 */
export function computeRunwayBusyMinutes(
  byRunwayWindow: readonly ScheduleEntry[],
  config: Config,
): number {
  let busy = 0;
  for (let j = 0; j < byRunwayWindow.length; j++) {
    const op = byRunwayWindow[j]!;
    busy += op.runway_window.end_offset_min - op.runway_window.start_offset_min;
    const nextOp = j + 1 < byRunwayWindow.length ? byRunwayWindow[j + 1]! : null;
    busy += separationFor(op.operation, nextOp?.operation ?? null, config);
  }
  return busy;
}

export function computeUtilizationPct(busyMinutes: number, horizon: number): number {
  if (horizon <= 0) return 0;
  return Math.round((busyMinutes / horizon) * 1000) / 10;
}

/**
 * Adds an integer-minute offset to a UTC ISO-8601 minute-precision instant and
 * returns the resulting instant in the same canonical form (`...:00Z`). Used
 * by `schedule_completion.completion_at` — per ADR-0002 the completion anchor
 * is UTC; client-tz rendering happens on `ScheduleEntry.start_at`/`end_at`,
 * not here.
 */
export function addMinutesToUtcMinuteIso(iso: string, minutes: number): string {
  const t = Date.parse(iso);
  const next = new Date(t + minutes * 60_000);
  return next.toISOString().replace(/\.\d+Z$/, "Z");
}

/**
 * An all-unscheduled pass returns `{ schedule_start_at, makespan_min: 0,
 * completion_at: schedule_start_at }` per the PRD — **not** `null`.
 */
export function buildScheduleCompletion(snapshot: ScheduleSnapshot): ScheduleCompletion {
  let makespan = 0;
  for (const e of snapshot.scheduled) {
    if (e.end_offset_min > makespan) makespan = e.end_offset_min;
  }
  return {
    schedule_start_at: snapshot.schedule_start_at,
    makespan_min: makespan,
    completion_at: addMinutesToUtcMinuteIso(snapshot.schedule_start_at, makespan),
  };
}

/**
 * Pure read over `AirportState`. Counts queue entries by state/operation,
 * computes per-resource utilisation off the current snapshot (if any), derives
 * the four `constraints` booleans from the snapshot's `unscheduled` reasons,
 * and returns the `schedule_completion` triple (or `null` if no pass has ever
 * run in this process).
 *
 * Does **not** trigger a scheduling pass. Repeated calls with no intervening
 * mutation yield byte-identical payloads.
 */
export function buildAirportStatus(state: AirportState): AirportStatus {
  const snapshot = state.schedule;
  const horizon = snapshot?.horizon_min ?? state.config.maxHorizonMin;

  const byState: Record<FlightState, number> = {
    submitted: 0,
    scheduled: 0,
    unscheduled: 0,
    cancelled: 0,
  };
  const byOperation: Record<FlightOperation, number> = { arrival: 0, departure: 0 };
  for (const f of state.queue) {
    byState[f.state] += 1;
    byOperation[f.operation] += 1;
  }

  const runways: AirportStatusRunway[] = state.config.runwayLengthsM.map(
    (length_m, i) => {
      const id = `RWY-${i + 1}`;
      const ops = snapshot
        ? snapshot.scheduled
            .filter((e) => e.runway_id === id)
            .slice()
            .sort(
              (a, b) =>
                a.runway_window.start_offset_min - b.runway_window.start_offset_min,
            )
        : [];
      const busy = computeRunwayBusyMinutes(ops, state.config);
      return {
        runway_id: id,
        length_m,
        operations_count: ops.length,
        busy_minutes: busy,
        utilization_pct: computeUtilizationPct(busy, horizon),
      };
    },
  );

  const gates: AirportStatusGate[] = Array.from(
    { length: state.config.gateCount },
    (_, i) => {
      const id = `GATE-${i + 1}`;
      const ops = snapshot ? snapshot.scheduled.filter((e) => e.gate_id === id) : [];
      // Gate `busy_minutes` is the sum of `gate_window` durations with NO
      // trailing buffer — gate turnaround already covers the gap before the
      // next op (PRD `AirportStatus` notes).
      let busy = 0;
      for (const op of ops) {
        busy += op.gate_window.end_offset_min - op.gate_window.start_offset_min;
      }
      return {
        gate_id: id,
        operations_count: ops.length,
        busy_minutes: busy,
        utilization_pct: computeUtilizationPct(busy, horizon),
      };
    },
  );

  const unscheduled = snapshot?.unscheduled ?? [];
  let runwayBlocking = false;
  let horizonBlocking = false;
  let dependencyBlocking = false;
  for (const u of unscheduled) {
    if (u.reason === "no_compatible_runway") runwayBlocking = true;
    else if (u.reason === "horizon_exceeded") horizonBlocking = true;
    else if (
      u.reason === "dependency_cycle" ||
      u.reason === "dependency_missing" ||
      u.reason === "dependency_cancelled" ||
      u.reason === "dependency_unscheduled"
    ) {
      dependencyBlocking = true;
    }
  }
  const anyBlocked = runwayBlocking || horizonBlocking || dependencyBlocking;

  // Strip `undefined` from optional keys so JSON.stringify omits them cleanly
  // (the snapshot's `UnscheduledEntry` leaves `blocking_flight_number` undefined
  // on non-dependency reasons; `exactOptionalPropertyTypes: true` + the output
  // schema both require absent-vs-undefined consistency).
  const blockedFlights: UnscheduledEntry[] = unscheduled.map((u) => ({
    flight_number: u.flight_number,
    operation: u.operation,
    priority: u.priority,
    reason: u.reason,
    detail: u.detail,
    ...(u.blocking_flight_number !== undefined
      ? { blocking_flight_number: u.blocking_flight_number }
      : {}),
  }));

  const scheduleCompletion: ScheduleCompletion | null = snapshot
    ? buildScheduleCompletion(snapshot)
    : null;

  return {
    flights: { by_state: byState, by_operation: byOperation },
    resources: { runways, gates },
    constraints: {
      runway_blocking: runwayBlocking,
      horizon_blocking: horizonBlocking,
      dependency_blocking: dependencyBlocking,
      any_blocked: anyBlocked,
    },
    blocked_flights: blockedFlights,
    schedule_completion: scheduleCompletion,
  };
}
