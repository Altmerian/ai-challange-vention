/**
 * In-memory shell for the Air Traffic Control server state.
 *
 * Owns the Flight Queue, the current Schedule (nullable), and the Submission Index
 * counter (see CONTEXT.md). Slice 2 fills in `addFlight` with the real Flight shape
 * (operation/priority/dependencies/min_runway_length_m) and a uniqueness check that
 * covers cancelled flights too (Flight Number Uniqueness — see PRD User Story 6).
 */

import type { Config } from "./config.js";

export type FlightOperation = "arrival" | "departure";
export type FlightPriority = "high" | "medium" | "low";

/**
 * `cancelled` is terminal; `scheduled` / `unscheduled` flip per Scheduling Pass.
 * Slice 2 only ever sets `submitted` — the others land with `generate_schedule`
 * and `cancel_flight` in later slices.
 */
export type FlightState = "submitted" | "scheduled" | "unscheduled" | "cancelled";

/**
 * Input to `AirportState.addFlight` — the handler is expected to have already
 * de-duplicated `dependencies` and rejected self-references before calling.
 */
export type FlightSubmission = Readonly<{
  flightNumber: string;
  operation: FlightOperation;
  priority: FlightPriority;
  dependencies: readonly string[];
  minRunwayLengthM?: number;
}>;

export type Flight = Readonly<
  FlightSubmission & {
    state: FlightState;
    submissionIndex: number;
  }
>;

/**
 * Placeholder `ScheduleSnapshot` shape — refined in slice 3.
 */
export type ScheduleSnapshot = unknown;

export type ResetResult = Readonly<{
  flightsRemovedCount: number;
  scheduleCleared: boolean;
}>;

export type AddFlightOutcome =
  | { ok: true; flight: Flight }
  | { ok: false; reason: "duplicate_flight_number"; existing: Flight };

export class AirportState {
  readonly #config: Config;
  #queue: Flight[] = [];
  #byFlightNumber: Map<string, Flight> = new Map();
  #schedule: ScheduleSnapshot | null = null;
  #nextSubmissionIndex = 0;

  constructor(config: Config) {
    this.#config = config;
  }

  get config(): Config {
    return this.#config;
  }

  get queue(): readonly Flight[] {
    return this.#queue;
  }

  get schedule(): ScheduleSnapshot | null {
    return this.#schedule;
  }

  get nextSubmissionIndex(): number {
    return this.#nextSubmissionIndex;
  }

  findFlight(flightNumber: string): Flight | undefined {
    return this.#byFlightNumber.get(flightNumber);
  }

  /**
   * Appends a flight to the queue in state `submitted`. Rejects a flight number
   * that already exists in the queue in **any** state — including `cancelled`
   * (Flight Number Uniqueness is forever; no resurrection semantics).
   */
  addFlight(submission: FlightSubmission): AddFlightOutcome {
    const existing = this.#byFlightNumber.get(submission.flightNumber);
    if (existing !== undefined) {
      return { ok: false, reason: "duplicate_flight_number", existing };
    }
    const flight: Flight = {
      flightNumber: submission.flightNumber,
      operation: submission.operation,
      priority: submission.priority,
      dependencies: submission.dependencies,
      ...(submission.minRunwayLengthM !== undefined
        ? { minRunwayLengthM: submission.minRunwayLengthM }
        : {}),
      state: "submitted",
      submissionIndex: this.#nextSubmissionIndex,
    };
    this.#queue.push(flight);
    this.#byFlightNumber.set(flight.flightNumber, flight);
    this.#nextSubmissionIndex += 1;
    return { ok: true, flight };
  }

  cancelFlight(_flightNumber: string): void {
    throw new Error("AirportState.cancelFlight not implemented until slice 5");
  }

  replaceSchedule(snapshot: ScheduleSnapshot): void {
    this.#schedule = snapshot;
  }

  /**
   * Wipes the queue, drops the schedule, resets the submission-index counter to 0.
   * Returns the counts captured before the clear so callers can report what changed.
   */
  reset(): ResetResult {
    const flightsRemovedCount = this.#queue.length;
    const scheduleCleared = this.#schedule !== null;
    this.#queue = [];
    this.#byFlightNumber.clear();
    this.#schedule = null;
    this.#nextSubmissionIndex = 0;
    return { flightsRemovedCount, scheduleCleared };
  }
}
