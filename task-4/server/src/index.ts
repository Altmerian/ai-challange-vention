#!/usr/bin/env node
/**
 * Bootstrap for the Air Traffic Control MCP server.
 *
 * Parses `Config` from `process.env`, exits non-zero with **every** collected error
 * printed at once when validation fails (PRD User Story #2), then attaches an MCP
 * server to `StdioServerTransport`.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AirportState } from "./airport-state.js";
import { formatErrors, parseFromEnv } from "./config.js";
import { createMcpServer } from "./mcp-server.js";

async function main(): Promise<void> {
  const result = parseFromEnv(process.env);
  if (!result.ok) {
    process.stderr.write(formatErrors(result.errors) + "\n");
    process.exit(1);
  }

  const state = new AirportState(result.config);
  const server = createMcpServer(state);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio transport reserves stdout for JSON-RPC frames — startup log goes to stderr.
  process.stderr.write("Air Traffic Control MCP server started.\n");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
