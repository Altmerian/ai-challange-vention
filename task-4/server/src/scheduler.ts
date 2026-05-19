/**
 * Pure deterministic greedy dependency-aware scheduler.
 *
 * Algorithm (per ADR-0001 / PRD `Scheduling Pass`):
 *   1. Build dependency adjacency on the active subgraph (non-cancelled flights).
 *   2. Detect strongly-connected components via Tarjan; every SCC of size ≥ 2
 *      becomes `dependency_cycle` (self-loops are rejected at submission, so
 *      single-node SCCs are always acyclic).
 *   3. For each remaining flight, scan its `dependencies` in order; the **first**
 *      predecessor that is missing from the queue triggers `dependency_missing`,
 *      the first one in state `cancelled` triggers `dependency_cancelled`.
 *      `blocking_flight_number` points at that predecessor (ADR-0004).
 *   4. Run a ready-heap loop: at each step pop the highest-priority flight whose
 *      predecessors are all placed, tiebroken by `submission_index`. Compute its
 *      earliest start as `max(predecessor.end_offset_min) + ATC_DEPENDENCY_BUFFER_MIN`
 *      and find the earliest feasible slot across compatible runways × any gate ×
 *      the ground-crew pool. Earliest feasible placement is gap-aware: a later-
 *      placed flight may legitimately slot *before* an already-placed flight in
 *      time as long as no resource conflict arises and runway separation buffers
 *      fit on both sides. No displacement, no priority inheritance.
 *   5. After the loop, cascade `dependency_unscheduled` to any active flight not
 *      yet placed — its first unscheduled predecessor (in `dependencies` order)
 *      becomes its `blocking_flight_number`.
 *
 * The module takes `now` and `timezone` as explicit inputs so it remains pure of
 * I/O and clock access.
 */

import type { Config } from "./config.js";
import type { Flight, FlightOperation, FlightPriority } from "./airport-state.js";
import { formatOffsetInZone } from "./timezone-formatter.js";

export type ResourceWindow = Readonly<{
  start_offset_min: number;
  end_offset_min: number;
}>;

export type ScheduleEntry = Readonly<{
  flight_number: string;
  operation: FlightOperation;
  priority: FlightPriority;
  runway_id: string;
  gate_id: string;
  start_offset_min: number;
  end_offset_min: number;
  runway_window: ResourceWindow;
  gate_window: ResourceWindow;
  start_at: string;
  end_at: string;
  predecessors: readonly string[];
}>;

export type UnscheduledReason =
  | "no_compatible_runway"
  | "horizon_exceeded"
  | "dependency_cycle"
  | "dependency_missing"
  | "dependency_cancelled"
  | "dependency_unscheduled";

export type UnscheduledEntry = Readonly<{
  flight_number: string;
  operation: FlightOperation;
  priority: FlightPriority;
  reason: UnscheduledReason;
  detail: string;
  blocking_flight_number?: string;
}>;

export type ScheduleTotals = Readonly<{
  submitted: number;
  scheduled: number;
  unscheduled: number;
  cancelled: number;
}>;

export type ScheduleSnapshot = Readonly<{
  generated_at: string;
  schedule_start_at: string;
  timezone: string;
  horizon_min: number;
  scheduled: readonly ScheduleEntry[];
  unscheduled: readonly UnscheduledEntry[];
  totals: ScheduleTotals;
}>;

export type RunSchedulingPassOptions = Readonly<{
  now: Date;
  timezone: string;
}>;

const PRIORITY_RANK: Readonly<Record<FlightPriority, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

type RunwayOp = Readonly<{
  op: FlightOperation;
  start: number;
  end: number;
}>;

type RunwaySlot = {
  readonly id: string;
  readonly length_m: number;
  ops: RunwayOp[];
};

type GateSlot = {
  readonly id: string;
  ops: ResourceWindow[];
};

type CrewSlot = {
  ops: ResourceWindow[];
};

type Placement = Readonly<{
  runway: RunwaySlot;
  gate: GateSlot;
  runwayWindow: ResourceWindow;
  gateWindow: ResourceWindow;
  start_offset_min: number;
  end_offset_min: number;
}>;

export function runSchedulingPass(
  queue: readonly Flight[],
  config: Config,
  { now, timezone }: RunSchedulingPassOptions,
): ScheduleSnapshot {
  const runways = buildRunways(config);
  const gates = buildGates(config);
  const crew = buildCrew(config);

  const scheduleStart = truncateToMinute(now);
  const generatedAt = toUtcMinuteIso(scheduleStart);

  const queueByNumber = new Map<string, Flight>();
  for (const f of queue) queueByNumber.set(f.flightNumber, f);

  const active = queue.filter((f) => f.state !== "cancelled");
  const activeByNumber = new Map<string, Flight>();
  for (const f of active) activeByNumber.set(f.flightNumber, f);

  const scheduledMap = new Map<string, ScheduleEntry>();
  const unscheduledMap = new Map<string, UnscheduledEntry>();

  // 1. Cycles — every SCC of size ≥ 2 in the active subgraph is a cycle.
  const cycleMembers = findCycleMembers(active, activeByNumber);
  if (cycleMembers.size > 0) {
    const cycleLabel = [...cycleMembers].sort().join(", ");
    for (const flightNumber of cycleMembers) {
      const f = activeByNumber.get(flightNumber)!;
      unscheduledMap.set(flightNumber, {
        flight_number: flightNumber,
        operation: f.operation,
        priority: f.priority,
        reason: "dependency_cycle",
        detail: `cycle members: ${cycleLabel}`,
      });
    }
  }

  // 2. Missing / cancelled predecessors — direct neighbours only. Descendants
  //    fall to the cascade in step 4 as `dependency_unscheduled`.
  for (const f of active) {
    if (unscheduledMap.has(f.flightNumber)) continue;
    for (const dep of f.dependencies) {
      const pred = queueByNumber.get(dep);
      if (pred === undefined) {
        unscheduledMap.set(f.flightNumber, {
          flight_number: f.flightNumber,
          operation: f.operation,
          priority: f.priority,
          reason: "dependency_missing",
          detail: `predecessor ${dep} not found in queue`,
          blocking_flight_number: dep,
        });
        break;
      }
      if (pred.state === "cancelled") {
        unscheduledMap.set(f.flightNumber, {
          flight_number: f.flightNumber,
          operation: f.operation,
          priority: f.priority,
          reason: "dependency_cancelled",
          detail: `predecessor ${dep} is cancelled`,
          blocking_flight_number: dep,
        });
        break;
      }
    }
  }

  // 3. Ready-heap loop over remaining flights.
  // `dependents` is the reverse adjacency over active flights that are still
  // candidates (not yet unscheduled). Predecessors that were ruled out as
  // missing/cancelled/cycle stay in the pending count so the dependent never
  // reaches the ready heap — the cascade in step 4 then marks it
  // `dependency_unscheduled`. Skipping them here would let descendants of a
  // pre-loop unscheduled predecessor get scheduled instead of cascaded.
  const dependents = new Map<string, string[]>();
  const pendingPredCount = new Map<string, number>();
  const eligible: Flight[] = [];
  for (const f of active) {
    if (unscheduledMap.has(f.flightNumber)) continue;
    let count = 0;
    for (const dep of f.dependencies) {
      const pred = activeByNumber.get(dep);
      if (pred === undefined) continue;
      count++;
      // Only register `f` as a dependent of `dep` when `dep` can still be
      // placed — an unscheduled `dep` will never emit a placement event, so
      // the entry would be dead weight.
      if (!unscheduledMap.has(dep)) {
        const list = dependents.get(dep);
        if (list === undefined) dependents.set(dep, [f.flightNumber]);
        else list.push(f.flightNumber);
      }
    }
    pendingPredCount.set(f.flightNumber, count);
    eligible.push(f);
  }

  const ready: Flight[] = eligible.filter(
    (f) => (pendingPredCount.get(f.flightNumber) ?? 0) === 0,
  );

  while (ready.length > 0) {
    ready.sort(compareForPass);
    const flight = ready.shift()!;

    let earliestStart = 0;
    for (const dep of flight.dependencies) {
      const predEntry = scheduledMap.get(dep);
      if (predEntry === undefined) continue;
      const candidate = predEntry.end_offset_min + config.dependencyBufferMin;
      if (candidate > earliestStart) earliestStart = candidate;
    }

    const requiredLength = flight.minRunwayLengthM ?? 0;
    const compatibleRunways = runways.filter((r) => r.length_m >= requiredLength);
    if (compatibleRunways.length === 0) {
      unscheduledMap.set(flight.flightNumber, {
        flight_number: flight.flightNumber,
        operation: flight.operation,
        priority: flight.priority,
        reason: "no_compatible_runway",
        detail:
          requiredLength > 0
            ? `no runway with length_m >= ${requiredLength}`
            : "no runway configured",
      });
      continue;
    }

    const placement = findEarliestPlacement(
      flight,
      compatibleRunways,
      gates,
      crew,
      config,
      earliestStart,
    );
    if (placement === null) {
      unscheduledMap.set(flight.flightNumber, {
        flight_number: flight.flightNumber,
        operation: flight.operation,
        priority: flight.priority,
        reason: "horizon_exceeded",
        detail: `earliest feasible end > ATC_MAX_HORIZON_MIN (${config.maxHorizonMin})`,
      });
      continue;
    }

    commitPlacement(placement, flight.operation, crew);
    scheduledMap.set(flight.flightNumber, {
      flight_number: flight.flightNumber,
      operation: flight.operation,
      priority: flight.priority,
      runway_id: placement.runway.id,
      gate_id: placement.gate.id,
      start_offset_min: placement.start_offset_min,
      end_offset_min: placement.end_offset_min,
      runway_window: placement.runwayWindow,
      gate_window: placement.gateWindow,
      start_at: formatOffsetInZone(placement.start_offset_min, scheduleStart, timezone),
      end_at: formatOffsetInZone(placement.end_offset_min, scheduleStart, timezone),
      predecessors: flight.dependencies,
    });

    for (const depFlight of dependents.get(flight.flightNumber) ?? []) {
      const remaining = (pendingPredCount.get(depFlight) ?? 0) - 1;
      pendingPredCount.set(depFlight, remaining);
      if (remaining === 0) {
        ready.push(activeByNumber.get(depFlight)!);
      }
    }
  }

  // 4. Cascade `dependency_unscheduled`. Any active flight not yet placed and
  //    not yet flagged must depend on an unscheduled flight; surface the first
  //    such predecessor (in `dependencies` order) as the blocking flight.
  // Iterate until quiescent: a flight cascaded in one round becomes a valid
  // blocker for its own dependents in the next.
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of active) {
      if (scheduledMap.has(f.flightNumber)) continue;
      if (unscheduledMap.has(f.flightNumber)) continue;
      let blocking: string | undefined;
      for (const dep of f.dependencies) {
        if (unscheduledMap.has(dep)) {
          blocking = dep;
          break;
        }
      }
      if (blocking === undefined) continue;
      unscheduledMap.set(f.flightNumber, {
        flight_number: f.flightNumber,
        operation: f.operation,
        priority: f.priority,
        reason: "dependency_unscheduled",
        detail: `predecessor ${blocking} is unscheduled`,
        blocking_flight_number: blocking,
      });
      changed = true;
    }
  }

  const scheduledEntries = [...scheduledMap.values()].sort(compareScheduledEntries);
  const unscheduledEntries = [...unscheduledMap.values()].sort((a, b) =>
    compareFlightNumber(a.flight_number, b.flight_number),
  );

  return {
    generated_at: generatedAt,
    schedule_start_at: generatedAt,
    timezone,
    horizon_min: config.maxHorizonMin,
    scheduled: scheduledEntries,
    unscheduled: unscheduledEntries,
    totals: computeTotals(queue, scheduledEntries.length, unscheduledEntries.length),
  };
}

/**
 * Separation buffer between two consecutive runway operations.
 *
 * The `null` form returns the **worst-case trailing buffer** — the maximum
 * separation the runway might need before any future op type. Used by
 * `atc://runways` to publish `busy_minutes` / `available_windows` after the
 * very last op, where the next op type is unknown and the published value
 * must remain safe for either next op.
 */
export function separationFor(
  prevOp: FlightOperation,
  nextOp: FlightOperation | null,
  config: Config,
): number {
  if (nextOp === null) {
    const sameType =
      prevOp === "arrival" ? config.separationLandingMin : config.separationTakeoffMin;
    return Math.max(sameType, config.separationMixedMin);
  }
  if (prevOp === nextOp) {
    return prevOp === "arrival" ? config.separationLandingMin : config.separationTakeoffMin;
  }
  return config.separationMixedMin;
}

/**
 * Tarjan SCC restricted to the active subgraph. Returns every flight that is
 * a member of a strongly-connected component of size ≥ 2. Self-loops are
 * rejected at submission, so single-node SCCs are always acyclic.
 *
 * Recursive — flight counts in a scheduling pass are small (tens at most),
 * comfortably below Node's default stack depth.
 */
function findCycleMembers(
  active: readonly Flight[],
  activeByNumber: ReadonlyMap<string, Flight>,
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const f of active) {
    const targets: string[] = [];
    for (const d of f.dependencies) if (activeByNumber.has(d)) targets.push(d);
    adj.set(f.flightNumber, targets);
  }

  let index = 0;
  const indexMap = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycleMembers = new Set<string>();

  function strongconnect(v: string): void {
    indexMap.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indexMap.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indexMap.get(w)!));
      }
    }

    if (lowlink.get(v)! === indexMap.get(v)!) {
      const scc: string[] = [];
      while (true) {
        const w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      if (scc.length > 1) for (const x of scc) cycleMembers.add(x);
    }
  }

  for (const f of active) {
    if (!indexMap.has(f.flightNumber)) strongconnect(f.flightNumber);
  }
  return cycleMembers;
}

function buildRunways(config: Config): RunwaySlot[] {
  return config.runwayLengthsM.map((length_m, i) => ({
    id: `RWY-${i + 1}`,
    length_m,
    ops: [],
  }));
}

function buildGates(config: Config): GateSlot[] {
  return Array.from({ length: config.gateCount }, (_, i) => ({
    id: `GATE-${i + 1}`,
    ops: [],
  }));
}

function buildCrew(config: Config): CrewSlot[] {
  return Array.from({ length: config.groundCrewCount }, () => ({ ops: [] }));
}

function compareForPass(a: Flight, b: Flight): number {
  const pri = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (pri !== 0) return pri;
  return a.submissionIndex - b.submissionIndex;
}

function compareScheduledEntries(a: ScheduleEntry, b: ScheduleEntry): number {
  if (a.start_offset_min !== b.start_offset_min) {
    return a.start_offset_min - b.start_offset_min;
  }
  return compareFlightNumber(a.flight_number, b.flight_number);
}

function compareFlightNumber(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function findEarliestPlacement(
  flight: Flight,
  compatibleRunways: readonly RunwaySlot[],
  gates: readonly GateSlot[],
  crew: readonly CrewSlot[],
  config: Config,
  earliestStart: number,
): Placement | null {
  let best: { placement: Placement; runwayIdx: number; gateIdx: number } | null = null;

  for (let ri = 0; ri < compatibleRunways.length; ri++) {
    const r = compatibleRunways[ri]!;
    const runwayBusy = extendedRunwayBusy(r, flight.operation, config);
    for (let gi = 0; gi < gates.length; gi++) {
      const g = gates[gi]!;
      const candidate = projectPlacement(
        flight.operation,
        r,
        g,
        runwayBusy,
        crew,
        config,
        earliestStart,
      );
      if (candidate === null) continue;
      if (candidate.end_offset_min > config.maxHorizonMin) continue;
      if (
        best === null ||
        candidate.start_offset_min < best.placement.start_offset_min ||
        (candidate.start_offset_min === best.placement.start_offset_min &&
          (ri < best.runwayIdx ||
            (ri === best.runwayIdx && gi < best.gateIdx)))
      ) {
        best = { placement: candidate, runwayIdx: ri, gateIdx: gi };
      }
    }
  }
  return best?.placement ?? null;
}

/**
 * Returns the runway's busy intervals **inflated** with the separation buffers
 * that apply when placing a new op of `newOp` type. The new op's runway_window
 * must lie outside every inflated interval.
 *
 * Each existing op `o` becomes:
 *   - `start := max(0, o.start - separationFor(newOp, o.op))`
 *     (the buffer that must precede `o` from the new op's side)
 *   - `end   := o.end + separationFor(o.op, newOp)`
 *     (the buffer that must trail `o` before the new op may run)
 *
 * The result is sorted by **inflated** start. Sorting by the raw `o.start`
 * before inflation is not safe: `sepBefore` depends on `o.op`, so two ops
 * with different types can swap order once the type-dependent buffer is
 * subtracted. `nextFreeWindow` relies on ascending start order to enforce
 * its early-exit invariant, so the post-inflation sort is the correctness-
 * critical one.
 */
function extendedRunwayBusy(
  runway: RunwaySlot,
  newOp: FlightOperation,
  config: Config,
): ResourceWindow[] {
  return runway.ops
    .map((o) => ({
      start_offset_min: Math.max(0, o.start - separationFor(newOp, o.op, config)),
      end_offset_min: o.end + separationFor(o.op, newOp, config),
    }))
    .sort((a, b) => a.start_offset_min - b.start_offset_min);
}

/**
 * Finds the smallest `t >= t_min` such that the window `[t, t + duration]` does
 * not overlap any interval in `busy`. Assumes `busy` is sorted by `start_offset_min`.
 * Adjacent / overlapping busy intervals are tolerated — we walk and push past each.
 */
function nextFreeWindow(
  busy: readonly ResourceWindow[],
  t_min: number,
  duration: number,
): number {
  let t = t_min;
  for (const iv of busy) {
    if (iv.start_offset_min >= t + duration) break;
    if (iv.end_offset_min <= t) continue;
    t = iv.end_offset_min;
  }
  return t;
}

function projectPlacement(
  operation: FlightOperation,
  runway: RunwaySlot,
  gate: GateSlot,
  runwayBusy: readonly ResourceWindow[],
  crew: readonly CrewSlot[],
  config: Config,
  earliestStart: number,
): Placement | null {
  const landing = config.landingDurationMin;
  const takeoff = config.takeoffDurationMin;
  const turnaround = config.gateTurnaroundMin;
  const horizon = config.maxHorizonMin;

  let t = earliestStart;
  // The iteration is bounded by the total number of resource intervals (each
  // pass advances `t` past at least one boundary). 256 is generous.
  for (let iter = 0; iter < 256; iter++) {
    const runwayWindow: ResourceWindow =
      operation === "arrival"
        ? { start_offset_min: t, end_offset_min: t + landing }
        : { start_offset_min: t + turnaround, end_offset_min: t + turnaround + takeoff };
    const gateWindow: ResourceWindow =
      operation === "arrival"
        ? { start_offset_min: t + landing, end_offset_min: t + landing + turnaround }
        : { start_offset_min: t, end_offset_min: t + turnaround };
    const opEnd =
      operation === "arrival" ? gateWindow.end_offset_min : runwayWindow.end_offset_min;
    if (opEnd > horizon) return null;

    const runwayDuration = runwayWindow.end_offset_min - runwayWindow.start_offset_min;
    const gateDuration = gateWindow.end_offset_min - gateWindow.start_offset_min;

    const runwayNext = nextFreeWindow(runwayBusy, runwayWindow.start_offset_min, runwayDuration);
    if (runwayNext > runwayWindow.start_offset_min) {
      t = operation === "arrival" ? runwayNext : runwayNext - turnaround;
      continue;
    }

    const gateNext = nextFreeWindow(gate.ops, gateWindow.start_offset_min, gateDuration);
    if (gateNext > gateWindow.start_offset_min) {
      t = operation === "arrival" ? gateNext - landing : gateNext;
      continue;
    }

    // At least one crew unit must have a gap that fits the gate_window in place
    // (not "next free" — the slot must align with the chosen runway+gate).
    let crewOk = false;
    let earliestCrewFree = Infinity;
    for (const c of crew) {
      const cNext = nextFreeWindow(c.ops, gateWindow.start_offset_min, gateDuration);
      if (cNext === gateWindow.start_offset_min) {
        crewOk = true;
        break;
      }
      if (cNext < earliestCrewFree) earliestCrewFree = cNext;
    }
    if (!crewOk) {
      t = operation === "arrival" ? earliestCrewFree - landing : earliestCrewFree;
      continue;
    }

    return {
      runway,
      gate,
      runwayWindow,
      gateWindow,
      start_offset_min:
        operation === "arrival" ? runwayWindow.start_offset_min : gateWindow.start_offset_min,
      end_offset_min:
        operation === "arrival" ? gateWindow.end_offset_min : runwayWindow.end_offset_min,
    };
  }
  return null;
}

function commitPlacement(
  placement: Placement,
  operation: FlightOperation,
  crew: CrewSlot[],
): void {
  insertSorted(placement.runway.ops, {
    op: operation,
    start: placement.runwayWindow.start_offset_min,
    end: placement.runwayWindow.end_offset_min,
  }, (a, b) => a.start - b.start);
  insertSorted(
    placement.gate.ops,
    placement.gateWindow,
    (a, b) => a.start_offset_min - b.start_offset_min,
  );
  reserveCrewUnit(crew, placement.gateWindow);
}

/**
 * Reserves a single ground-crew unit whose existing intervals leave a gap fitting
 * the gate_window. Picks the smallest-index eligible unit. The earliest-placement
 * search already proved at least one such unit exists.
 */
function reserveCrewUnit(crew: CrewSlot[], gateWindow: ResourceWindow): void {
  const duration = gateWindow.end_offset_min - gateWindow.start_offset_min;
  for (const c of crew) {
    if (nextFreeWindow(c.ops, gateWindow.start_offset_min, duration) === gateWindow.start_offset_min) {
      insertSorted(c.ops, gateWindow, (a, b) => a.start_offset_min - b.start_offset_min);
      return;
    }
  }
  // The earliest-placement search guaranteed feasibility — falling through here
  // means we've broken our own invariant.
  throw new Error("scheduler invariant violated: no crew unit free for the chosen gate window");
}

function insertSorted<T>(arr: T[], item: T, cmp: (a: T, b: T) => number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cmp(arr[mid]!, item) <= 0) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, item);
}

function truncateToMinute(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

function toUtcMinuteIso(d: Date): string {
  // d is already minute-truncated; toISOString emits "...:00.000Z" so we strip
  // the milliseconds to keep the canonical minute-precision form.
  return d.toISOString().replace(/\.\d+Z$/, "Z");
}

function computeTotals(
  queue: readonly Flight[],
  scheduledCount: number,
  unscheduledCount: number,
): ScheduleTotals {
  let cancelled = 0;
  for (const f of queue) if (f.state === "cancelled") cancelled += 1;
  // After a pass, every non-cancelled flight is either scheduled or unscheduled —
  // so `submitted` (the queue state) is 0 unless a flight is added between the
  // pass and the snapshot, which cannot happen during a synchronous pass.
  return {
    submitted: 0,
    scheduled: scheduledCount,
    unscheduled: unscheduledCount,
    cancelled,
  };
}
