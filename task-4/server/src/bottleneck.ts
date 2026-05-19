/**
 * Pure longest-elapsed-path analyser for the current schedule (PRD §17–18,
 * ADR-0003). The bottleneck is the dependency chain through `scheduled` flights
 * that maximises `last.end_offset_min - first.start_offset_min` — **not** the
 * chain with the most nodes. Edges to/from `cancelled` or `unscheduled` flights
 * are excluded; the cascade rules from slice 4 already guarantee a clean cut so
 * `scheduledByNumber.has(pred)` is sufficient.
 *
 * Tiebreakers, applied in order:
 *   elapsed minutes desc → node count desc → first-flight `start_offset_min` asc
 *   → lex `flight_number` sequence asc.
 *
 * A one-node "chain" is not a chain — schedules with no scheduled inter-deps
 * report `bottleneck_exists: false` with a `note`.
 *
 * Determinism: the DP is total-order at every tiebreak, so re-running on the
 * same snapshot yields a byte-identical report. The module takes `timezone` as
 * an explicit input and is otherwise pure of I/O, clock, and env access.
 */

import type { ScheduleEntry, ScheduleSnapshot } from "./scheduler.js";
import { formatOffsetInZone } from "./timezone-formatter.js";

export type BottleneckReport = Readonly<{
  bottleneck_exists: boolean;
  chain_length: number;
  total_elapsed_min: number;
  cumulative_operation_min: number;
  cumulative_wait_min: number;
  start_at?: string;
  end_at?: string;
  chain: readonly ScheduleEntry[];
  note?: string;
}>;

export type AnalyzeBottleneckOptions = Readonly<{
  timezone: string;
}>;

const NOTE_NO_PASS = "no scheduling pass has run";
const NOTE_NO_SCHEDULED = "no scheduled flights";
const NOTE_NO_EDGES = "no scheduled dependency edges";

export function analyzeBottleneck(
  snapshot: ScheduleSnapshot | null,
  options: AnalyzeBottleneckOptions,
): BottleneckReport {
  if (snapshot === null) {
    return emptyReport(NOTE_NO_PASS);
  }
  if (snapshot.scheduled.length === 0) {
    return emptyReport(NOTE_NO_SCHEDULED);
  }

  const best = findLongestChain(snapshot);
  if (best === null) {
    return emptyReport(NOTE_NO_EDGES);
  }

  const first = best[0]!;
  const last = best[best.length - 1]!;
  const totalElapsedMin = last.end_offset_min - first.start_offset_min;
  let cumulativeOperationMin = 0;
  for (const entry of best) {
    cumulativeOperationMin += entry.end_offset_min - entry.start_offset_min;
  }
  const cumulativeWaitMin = totalElapsedMin - cumulativeOperationMin;

  // Anchor is the snapshot's UTC `schedule_start_at` (ADR-0002). Re-render the
  // chain endpoints in the caller's timezone — chain entries retain their
  // snapshot-timezone rendering on their own `start_at` / `end_at` fields.
  const anchor = new Date(snapshot.schedule_start_at);
  const startAt = formatOffsetInZone(first.start_offset_min, anchor, options.timezone);
  const endAt = formatOffsetInZone(last.end_offset_min, anchor, options.timezone);

  return {
    bottleneck_exists: true,
    chain_length: best.length,
    total_elapsed_min: totalElapsedMin,
    cumulative_operation_min: cumulativeOperationMin,
    cumulative_wait_min: cumulativeWaitMin,
    start_at: startAt,
    end_at: endAt,
    chain: best,
  };
}

function emptyReport(note: string): BottleneckReport {
  return {
    bottleneck_exists: false,
    chain_length: 0,
    total_elapsed_min: 0,
    cumulative_operation_min: 0,
    cumulative_wait_min: 0,
    chain: [],
    note,
  };
}

/**
 * DP over the scheduled-only sub-DAG. For each node `v`, track the single best
 * chain ending at `v` under the full tiebreak comparator. Extension along an
 * edge `u → v` is monotone with respect to that comparator (a chain ending at
 * `u` that beats a sibling does so again after appending `v`, since `v`
 * contributes identically to both), so a single representative per node is
 * sufficient.
 *
 * Topological order is taken from `start_offset_min` ascending: any scheduled
 * predecessor `u` of a scheduled `v` satisfies `v.start_offset_min >=
 * u.end_offset_min + ATC_DEPENDENCY_BUFFER_MIN > u.start_offset_min` since
 * durations are positive, so the sort processes predecessors before dependents.
 */
function findLongestChain(snapshot: ScheduleSnapshot): readonly ScheduleEntry[] | null {
  const scheduled = snapshot.scheduled;
  const byNumber = new Map<string, ScheduleEntry>();
  for (const entry of scheduled) byNumber.set(entry.flight_number, entry);

  const ordered = [...scheduled].sort((a, b) => {
    if (a.start_offset_min !== b.start_offset_min) {
      return a.start_offset_min - b.start_offset_min;
    }
    return compareFlightNumber(a.flight_number, b.flight_number);
  });

  const bestEndingAt = new Map<string, readonly ScheduleEntry[]>();
  for (const v of ordered) {
    let best: readonly ScheduleEntry[] = [v];
    for (const predNumber of v.predecessors) {
      const u = byNumber.get(predNumber);
      if (u === undefined) continue;
      const uBest = bestEndingAt.get(u.flight_number);
      if (uBest === undefined) continue;
      const candidate = [...uBest, v];
      if (compareChain(candidate, best) < 0) best = candidate;
    }
    bestEndingAt.set(v.flight_number, best);
  }

  let globalBest: readonly ScheduleEntry[] | null = null;
  for (const chain of bestEndingAt.values()) {
    if (chain.length < 2) continue;
    if (globalBest === null || compareChain(chain, globalBest) < 0) {
      globalBest = chain;
    }
  }
  return globalBest;
}

/**
 * Returns negative if `a` is the better chain (so it sorts first). After the
 * elapsed and count comparisons, the chains have equal length, which makes the
 * lex comparison a straight element-wise walk.
 */
function compareChain(
  a: readonly ScheduleEntry[],
  b: readonly ScheduleEntry[],
): number {
  const aElapsed = a[a.length - 1]!.end_offset_min - a[0]!.start_offset_min;
  const bElapsed = b[b.length - 1]!.end_offset_min - b[0]!.start_offset_min;
  if (aElapsed !== bElapsed) return bElapsed - aElapsed;
  if (a.length !== b.length) return b.length - a.length;
  const aStart = a[0]!.start_offset_min;
  const bStart = b[0]!.start_offset_min;
  if (aStart !== bStart) return aStart - bStart;
  for (let i = 0; i < a.length; i++) {
    const cmp = compareFlightNumber(a[i]!.flight_number, b[i]!.flight_number);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function compareFlightNumber(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
