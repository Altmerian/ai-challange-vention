/**
 * Constructs the MCP server surface — registers tools and resources against an
 * `AirportState`. Slice 3 added `generate_schedule`, the `atc://runways` and
 * `atc://timeline` resources, and wired the deep `Scheduler` + `TimezoneFormatter`
 * modules in. Slice 5 adds `cancel_flight` (with auto-regen cascade). Slice 6
 * adds `get_airport_status` (pure read over the current snapshot). `analyze_bottleneck`
 * follows in slice 7.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  type AirportState,
  type Flight,
  type ScheduleSnapshot,
} from "./airport-state.js";
import {
  buildAirportStatus,
  computeRunwayBusyMinutes,
  computeUtilizationPct,
} from "./airport-status.js";
import { errorEnvelope, type ValidationIssue } from "./error-envelope.js";
import { isValidIanaTimezone } from "./config.js";
import {
  runSchedulingPass,
  separationFor,
  type ResourceWindow,
  type ScheduleEntry,
  type UnscheduledEntry,
} from "./scheduler.js";

export const SERVER_INFO = {
  name: "atc-mcp-server",
  version: "0.1.0",
  title: "Air Traffic Control",
} as const;

const ResetStateInputSchema = z.strictObject({});

const ResetStateOutputShape = {
  cleared: z.literal(true),
  flights_removed_count: z.number().int().nonnegative(),
  schedule_cleared: z.boolean(),
} as const;

const SubmitFlightInputSchema = z.strictObject({
  flight_number: z.string().min(1),
  operation: z.enum(["arrival", "departure"]),
  priority: z.enum(["high", "medium", "low"]),
  dependencies: z.array(z.string().min(1)).optional(),
  min_runway_length_m: z.number().int().positive().optional(),
});

const SubmitFlightOutputShape = {
  accepted: z.literal(true),
  flight_number: z.string(),
  submission_index: z.number().int().nonnegative(),
} as const;

const GenerateScheduleInputSchema = z.strictObject({
  timezone: z.string().min(1).optional(),
});

const CancelFlightInputSchema = z.strictObject({
  flight_number: z.string().min(1),
  timezone: z.string().min(1).optional(),
});

const ResourceWindowSchema = z.object({
  start_offset_min: z.number().int().nonnegative(),
  end_offset_min: z.number().int().nonnegative(),
});

const ScheduleEntrySchema = z.object({
  flight_number: z.string(),
  operation: z.enum(["arrival", "departure"]),
  priority: z.enum(["high", "medium", "low"]),
  runway_id: z.string(),
  gate_id: z.string(),
  start_offset_min: z.number().int().nonnegative(),
  end_offset_min: z.number().int().nonnegative(),
  runway_window: ResourceWindowSchema,
  gate_window: ResourceWindowSchema,
  start_at: z.string(),
  end_at: z.string(),
  predecessors: z.array(z.string()),
});

const UnscheduledEntrySchema = z.object({
  flight_number: z.string(),
  operation: z.enum(["arrival", "departure"]),
  priority: z.enum(["high", "medium", "low"]),
  reason: z.enum([
    "no_compatible_runway",
    "horizon_exceeded",
    "dependency_cycle",
    "dependency_missing",
    "dependency_cancelled",
    "dependency_unscheduled",
  ]),
  detail: z.string(),
  blocking_flight_number: z.string().optional(),
});

const ScheduleSnapshotSchema = z.object({
  generated_at: z.string(),
  schedule_start_at: z.string(),
  timezone: z.string(),
  horizon_min: z.number().int().nonnegative(),
  scheduled: z.array(ScheduleEntrySchema),
  unscheduled: z.array(UnscheduledEntrySchema),
  totals: z.object({
    submitted: z.number().int().nonnegative(),
    scheduled: z.number().int().nonnegative(),
    unscheduled: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  }),
});

const GenerateScheduleOutputShape = {
  schedule: ScheduleSnapshotSchema,
} as const;

const CancelFlightOutputShape = {
  cancelled: z.literal(true),
  flight_number: z.string(),
  schedule: ScheduleSnapshotSchema,
} as const;

const GetAirportStatusInputSchema = z.strictObject({
  timezone: z.string().min(1).optional(),
});

const GetAirportStatusOutputShape = {
  flights: z.object({
    by_state: z.object({
      submitted: z.number().int().nonnegative(),
      scheduled: z.number().int().nonnegative(),
      unscheduled: z.number().int().nonnegative(),
      cancelled: z.number().int().nonnegative(),
    }),
    by_operation: z.object({
      arrival: z.number().int().nonnegative(),
      departure: z.number().int().nonnegative(),
    }),
  }),
  resources: z.object({
    runways: z.array(
      z.object({
        runway_id: z.string(),
        length_m: z.number().int().nonnegative(),
        operations_count: z.number().int().nonnegative(),
        busy_minutes: z.number().int().nonnegative(),
        utilization_pct: z.number().nonnegative(),
      }),
    ),
    gates: z.array(
      z.object({
        gate_id: z.string(),
        operations_count: z.number().int().nonnegative(),
        busy_minutes: z.number().int().nonnegative(),
        utilization_pct: z.number().nonnegative(),
      }),
    ),
  }),
  constraints: z.object({
    runway_blocking: z.boolean(),
    horizon_blocking: z.boolean(),
    dependency_blocking: z.boolean(),
    any_blocked: z.boolean(),
  }),
  blocked_flights: z.array(UnscheduledEntrySchema),
  schedule_completion: z
    .object({
      schedule_start_at: z.string(),
      makespan_min: z.number().int().nonnegative(),
      completion_at: z.string(),
    })
    .nullable(),
} as const;

const QUEUE_URI = "atc://queue";
const RUNWAYS_URI = "atc://runways";
const TIMELINE_URI = "atc://timeline";

export function createMcpServer(state: AirportState): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {},
      resources: {},
    },
  });

  server.registerTool(
    "reset_state",
    {
      title: "Reset airport state",
      description:
        "Wipe the flight queue, drop the current schedule, and reset the submission-index counter to 0. Configuration is not touched.",
      inputSchema: ResetStateInputSchema,
      outputSchema: ResetStateOutputShape,
    },
    async () => {
      const { flightsRemovedCount, scheduleCleared } = state.reset();
      const structuredContent = {
        cleared: true as const,
        flights_removed_count: flightsRemovedCount,
        schedule_cleared: scheduleCleared,
      };
      return {
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      };
    },
  );

  server.registerTool(
    "submit_flight",
    {
      title: "Submit a flight to the queue",
      description:
        "Append a flight to the queue and assign a strictly-increasing submission_index. " +
        "Duplicate flight numbers (including against cancelled flights) and self-dependencies are rejected. " +
        "Forward-referenced predecessors are accepted and resolved at scheduling time (ADR-0004).",
      inputSchema: SubmitFlightInputSchema,
      outputSchema: SubmitFlightOutputShape,
    },
    async (args) => {
      const flightNumber = args.flight_number;
      const rawDeps = args.dependencies ?? [];
      // Silently de-duplicate dependency edges (CONTEXT.md → Dependency Edge).
      const dedupedDeps = Array.from(new Set(rawDeps));

      const issues: ValidationIssue[] = [];

      if (dedupedDeps.includes(flightNumber)) {
        issues.push({
          reason: "self_dependency",
          message: `flight ${flightNumber} cannot depend on itself`,
          flight_number: flightNumber,
          field: "dependencies",
        });
      }

      // Run uniqueness check regardless of self-dep so a request that violates
      // both surfaces both issues in one envelope (PRD User Story 25).
      const existing = state.findFlight(flightNumber);
      if (existing !== undefined) {
        issues.push({
          reason: "duplicate_flight_number",
          message: `flight number ${flightNumber} already exists (state: ${existing.state})`,
          flight_number: flightNumber,
          field: "flight_number",
        });
      }

      if (issues.length > 0) {
        return errorEnvelope(issues);
      }

      const filteredDeps = dedupedDeps.filter((d) => d !== flightNumber);
      const outcome = state.addFlight({
        flightNumber,
        operation: args.operation,
        priority: args.priority,
        dependencies: filteredDeps,
        ...(args.min_runway_length_m !== undefined
          ? { minRunwayLengthM: args.min_runway_length_m }
          : {}),
      });

      if (!outcome.ok) {
        // Defensive — `findFlight` above should have caught this. Treat as a TOCTOU
        // race and surface as a duplicate envelope rather than throwing.
        return errorEnvelope([
          {
            reason: "duplicate_flight_number",
            message: `flight number ${flightNumber} already exists`,
            flight_number: flightNumber,
            field: "flight_number",
          },
        ]);
      }

      const structuredContent = {
        accepted: true as const,
        flight_number: outcome.flight.flightNumber,
        submission_index: outcome.flight.submissionIndex,
      };
      return {
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      };
    },
  );

  server.registerTool(
    "generate_schedule",
    {
      title: "Generate the airport schedule",
      description:
        "Replace the current schedule with a freshly computed one based on the current flight queue and configuration. " +
        "Optionally accepts an IANA `timezone` that drives `start_at` / `end_at` rendering on schedule entries; the underlying offsets are timezone-free.",
      inputSchema: GenerateScheduleInputSchema,
      outputSchema: GenerateScheduleOutputShape,
    },
    async (args) => {
      const timezone = args.timezone ?? state.config.defaultTimezone;
      if (!isValidIanaTimezone(timezone)) {
        return errorEnvelope([
          {
            reason: "invalid_input",
            message: `unknown IANA timezone "${timezone}"`,
            field: "timezone",
          },
        ]);
      }
      const snapshot = runSchedulingPass(state.queue, state.config, {
        now: new Date(),
        timezone,
      });
      state.replaceSchedule(snapshot);
      const structuredContent = { schedule: snapshot };
      return {
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      };
    },
  );

  server.registerTool(
    "cancel_flight",
    {
      title: "Cancel a flight and auto-regen the schedule",
      description:
        "Mark a flight `cancelled` (terminal, idempotent) and immediately re-run the scheduler. " +
        "Direct + transitive dependents come back as `unscheduled` with reason `dependency_cancelled` / `dependency_unscheduled` in the same round-trip — no explicit `generate_schedule` is required. " +
        "Returns an error envelope for an unknown `flight_number` or an invalid IANA `timezone`.",
      inputSchema: CancelFlightInputSchema,
      outputSchema: CancelFlightOutputShape,
    },
    async (args) => {
      const flightNumber = args.flight_number;
      const timezone = args.timezone ?? state.config.defaultTimezone;
      if (!isValidIanaTimezone(timezone)) {
        return errorEnvelope([
          {
            reason: "invalid_input",
            message: `unknown IANA timezone "${timezone}"`,
            field: "timezone",
          },
        ]);
      }
      const outcome = state.cancelFlight(flightNumber, {
        now: new Date(),
        timezone,
      });
      if (!outcome.ok) {
        return errorEnvelope([
          {
            reason: "invalid_input",
            message: `flight number ${flightNumber} does not exist`,
            flight_number: flightNumber,
            field: "flight_number",
          },
        ]);
      }
      const structuredContent = {
        cancelled: true as const,
        flight_number: flightNumber,
        schedule: outcome.schedule,
      };
      return {
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      };
    },
  );

  server.registerTool(
    "get_airport_status",
    {
      title: "Inspect the airport status",
      description:
        "Read-only snapshot of the current queue and most recent schedule: flight counts by state and operation, per-runway and per-gate utilization, resource constraint indicators, blocked flights, and schedule completion timing. Does not recompute — the schedule is whatever the most recent `generate_schedule` or `cancel_flight` left in place.",
      inputSchema: GetAirportStatusInputSchema,
      outputSchema: GetAirportStatusOutputShape,
    },
    async (args) => {
      const timezone = args.timezone ?? state.config.defaultTimezone;
      if (!isValidIanaTimezone(timezone)) {
        return errorEnvelope([
          {
            reason: "invalid_input",
            message: `unknown IANA timezone "${timezone}"`,
            field: "timezone",
          },
        ]);
      }
      const structuredContent = buildAirportStatus(state);
      return {
        structuredContent,
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      };
    },
  );

  server.registerResource(
    "queue",
    QUEUE_URI,
    {
      title: "Flight queue",
      description:
        "Every flight ever submitted, in submission order, including cancelled and unscheduled entries. Reads do not trigger recomputation.",
      mimeType: "application/json",
    },
    async (uri) => {
      const snapshot = state.schedule;
      const scheduledMap = buildScheduledIndex(snapshot);
      const unscheduledMap = buildUnscheduledIndex(snapshot);
      const body = {
        flights: state.queue.map((f) => toQueueEntry(f, scheduledMap, unscheduledMap)),
      };
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(body),
          },
        ],
      };
    },
  );

  server.registerResource(
    "runways",
    RUNWAYS_URI,
    {
      title: "Runway availability and usage",
      description:
        "Per-runway scheduled operations, busy minutes (including trailing separation buffer), utilization, and available windows within [0, horizon].",
      mimeType: "application/json",
    },
    async (uri) => {
      const body = buildRunwaysResource(state);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(body),
          },
        ],
      };
    },
  );

  server.registerResource(
    "timeline",
    TIMELINE_URI,
    {
      title: "Operation timeline",
      description:
        "Flat chronological list of every scheduled operation across the airport, sorted by start_offset_min then flight_number.",
      mimeType: "application/json",
    },
    async (uri) => {
      const snapshot = state.schedule;
      const operations: ScheduleEntry[] = snapshot ? [...snapshot.scheduled] : [];
      // `snapshot.scheduled` is already sorted by (start_offset_min, flight_number);
      // copying it preserves that order and shields the resource view from mutation.
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify({ operations }),
          },
        ],
      };
    },
  );

  return server;
}

function buildScheduledIndex(
  snapshot: ScheduleSnapshot | null,
): Map<string, ScheduleEntry> {
  const m = new Map<string, ScheduleEntry>();
  if (!snapshot) return m;
  for (const e of snapshot.scheduled) m.set(e.flight_number, e);
  return m;
}

function buildUnscheduledIndex(
  snapshot: ScheduleSnapshot | null,
): Map<string, UnscheduledEntry> {
  const m = new Map<string, UnscheduledEntry>();
  if (!snapshot) return m;
  for (const e of snapshot.unscheduled) m.set(e.flight_number, e);
  return m;
}

function toQueueEntry(
  flight: Flight,
  scheduledByNumber: Map<string, ScheduleEntry>,
  unscheduledByNumber: Map<string, UnscheduledEntry>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    flight_number: flight.flightNumber,
    operation: flight.operation,
    priority: flight.priority,
    dependencies: flight.dependencies,
    state: flight.state,
    submission_index: flight.submissionIndex,
    ...(flight.minRunwayLengthM !== undefined
      ? { min_runway_length_m: flight.minRunwayLengthM }
      : {}),
  };
  if (flight.state === "scheduled") {
    const entry = scheduledByNumber.get(flight.flightNumber);
    if (entry !== undefined) {
      base.runway_id = entry.runway_id;
      base.gate_id = entry.gate_id;
      base.start_offset_min = entry.start_offset_min;
      base.end_offset_min = entry.end_offset_min;
      base.runway_window = entry.runway_window;
      base.gate_window = entry.gate_window;
      base.start_at = entry.start_at;
      base.end_at = entry.end_at;
    }
  } else if (flight.state === "unscheduled") {
    const entry = unscheduledByNumber.get(flight.flightNumber);
    if (entry !== undefined) {
      base.reason = entry.reason;
      base.detail = entry.detail;
      if (entry.blocking_flight_number !== undefined) {
        base.blocking_flight_number = entry.blocking_flight_number;
      }
    }
  }
  return base;
}

type RunwayResource = Readonly<{
  runway_id: string;
  length_m: number;
  operations: ScheduleEntry[];
  busy_minutes: number;
  utilization_pct: number;
  available_windows: ResourceWindow[];
  next_available_at_offset_min: number | null;
}>;

function buildRunwaysResource(state: AirportState): { runways: RunwayResource[] } {
  const snapshot = state.schedule;
  const horizon = snapshot?.horizon_min ?? state.config.maxHorizonMin;
  const runways: RunwayResource[] = state.config.runwayLengthsM.map((length_m, i) => {
    const id = `RWY-${i + 1}`;
    const operations = snapshot
      ? snapshot.scheduled.filter((e) => e.runway_id === id).slice()
      : [];
    // Resource contract: operations are sorted by `start_offset_min` per the PRD
    // (`atc://runways` row). The separation-buffer math below reads them by
    // `runway_window` order, which equals `start_offset_min` order for arrivals
    // and could in principle differ for departures — but on a given runway, the
    // greedy scheduler emits non-overlapping runway_windows so both orderings
    // coincide here. We still sort `operations` by `start_offset_min` for the
    // published view and re-sort a separate working copy by runway_window for
    // the math, keeping the wire contract independent of the calculation.
    operations.sort(
      (a, b) =>
        a.start_offset_min - b.start_offset_min ||
        compareFlightNumberStr(a.flight_number, b.flight_number),
    );
    const byRunwayWindow = operations
      .slice()
      .sort(
        (a, b) => a.runway_window.start_offset_min - b.runway_window.start_offset_min,
      );

    const busyMinutes = computeRunwayBusyMinutes(byRunwayWindow, state.config);
    const utilizationPct = computeUtilizationPct(busyMinutes, horizon);

    const availableWindows = computeAvailableWindows(byRunwayWindow, horizon, state.config);
    const nextAvailable =
      availableWindows.length > 0 ? availableWindows[0]!.start_offset_min : null;

    return {
      runway_id: id,
      length_m,
      operations,
      busy_minutes: busyMinutes,
      utilization_pct: utilizationPct,
      available_windows: availableWindows,
      next_available_at_offset_min: nextAvailable,
    };
  });
  return { runways };
}

function compareFlightNumberStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function computeAvailableWindows(
  operations: readonly ScheduleEntry[],
  horizon: number,
  config: AirportState["config"],
): ResourceWindow[] {
  const windows: ResourceWindow[] = [];
  let cursor = 0;
  for (let j = 0; j < operations.length; j++) {
    const op = operations[j]!;
    if (op.runway_window.start_offset_min > cursor) {
      const winEnd = Math.min(op.runway_window.start_offset_min, horizon);
      if (winEnd > cursor) {
        windows.push({ start_offset_min: cursor, end_offset_min: winEnd });
      }
    }
    const nextOp = j + 1 < operations.length ? operations[j + 1]! : null;
    const sep = separationFor(op.operation, nextOp?.operation ?? null, config);
    cursor = Math.max(cursor, op.runway_window.end_offset_min + sep);
    if (cursor >= horizon) break;
  }
  if (cursor < horizon) {
    windows.push({ start_offset_min: cursor, end_offset_min: horizon });
  }
  return windows;
}

