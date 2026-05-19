/**
 * In-memory shell for the Air Traffic Control server state.
 *
 * Owns the Flight Queue, the current Schedule (nullable), and the Submission Index
 * counter (see CONTEXT.md). This file establishes the API surface; the queue mutation
 * and schedule-replacement semantics are wired in by later slices. Reset behaviour
 * (slice 1 AC) is fully implemented here because `reset_state` ships in this slice.
 */

import type { Config } from "./config.js";

/**
 * Placeholder `Flight` shape. Later slices will refine fields (priority, dependencies,
 * etc.) — kept minimal here so slice 1 doesn't pre-commit to fields it doesn't use.
 */
export type Flight = Readonly<{
  flightNumber: string;
  submissionIndex: number;
}>;

/**
 * Placeholder `ScheduleSnapshot` shape — refined in slice 3.
 */
export type ScheduleSnapshot = unknown;

export type ResetResult = Readonly<{
  flightsRemovedCount: number;
  scheduleCleared: boolean;
}>;

export class AirportState {
  readonly #config: Config;
  #queue: Flight[] = [];
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

  addFlight(flight: Omit<Flight, "submissionIndex">): Flight {
    const placed: Flight = {
      ...flight,
      submissionIndex: this.#nextSubmissionIndex,
    };
    this.#queue.push(placed);
    this.#nextSubmissionIndex += 1;
    return placed;
  }

  cancelFlight(_flightNumber: string): void {
    throw new Error("AirportState.cancelFlight not implemented in slice 1");
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
    this.#schedule = null;
    this.#nextSubmissionIndex = 0;
    return { flightsRemovedCount, scheduleCleared };
  }
}
