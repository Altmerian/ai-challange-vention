/**
 * Constructs the MCP server surface — registers tools and resources against an
 * `AirportState`. Slice 1 registers exactly one tool: `reset_state`. Later slices
 * extend this file with `submit_flight`, `generate_schedule`, etc., and the three
 * `atc://*` resources.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AirportState } from "./airport-state.js";

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

export function createMcpServer(state: AirportState): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: {},
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
        content: [
          {
            type: "text",
            text: JSON.stringify(structuredContent),
          },
        ],
      };
    },
  );

  return server;
}
