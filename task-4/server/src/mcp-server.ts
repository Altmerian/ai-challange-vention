/**
 * Constructs the MCP server surface — registers tools and resources against an
 * `AirportState`. Slice 2 adds `submit_flight` and the `atc://queue` resource.
 * Later slices extend this file with `generate_schedule`, `cancel_flight`,
 * `get_airport_status`, `analyze_bottleneck`, and the two remaining resources.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AirportState, Flight } from "./airport-state.js";
import { errorEnvelope, type ValidationIssue } from "./error-envelope.js";

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

const QUEUE_URI = "atc://queue";

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
      const body = { flights: state.queue.map(toQueueEntry) };
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

  return server;
}

function toQueueEntry(flight: Flight): Record<string, unknown> {
  return {
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
}
