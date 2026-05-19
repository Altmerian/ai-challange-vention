import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { AirportState } from "../src/airport-state.js";
import type { Config } from "../src/config.js";
import { createMcpServer } from "../src/mcp-server.js";

function makeConfig(): Config {
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
  };
}

async function connectClient(): Promise<{
  client: Client;
  state: AirportState;
  cleanup: () => Promise<void>;
}> {
  const state = new AirportState(makeConfig());
  const server = createMcpServer(state);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "atc-test-client", version: "0.0.0" },
    { capabilities: {} },
  );
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    state,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("MCP server (slice 1)", () => {
  it("advertises exactly the reset_state tool", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["reset_state"]);
      const tool = tools[0];
      expect(tool?.description).toContain("Wipe the flight queue");
      expect(tool?.inputSchema?.type).toBe("object");
      expect(tool?.outputSchema?.type).toBe("object");
    } finally {
      await cleanup();
    }
  });

  it("returns the canonical reset_state response on a fresh state", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const response = await client.callTool({ name: "reset_state", arguments: {} });
      expect(response.isError).toBeFalsy();
      expect(response.structuredContent).toEqual({
        cleared: true,
        flights_removed_count: 0,
        schedule_cleared: false,
      });
    } finally {
      await cleanup();
    }
  });

  it("reports the pre-reset counts when state had flights and a schedule", async () => {
    // Slice 1 has no `submit_flight` tool yet; seed via the only path available
    // (direct AirportState mutation) and then verify the *protocol response* —
    // not internal state. Slice 2 will rewrite this seeding via `submit_flight`.
    const { client, state, cleanup } = await connectClient();
    try {
      state.addFlight({ flightNumber: "AA100" });
      state.addFlight({ flightNumber: "BB200" });
      state.replaceSchedule({ note: "placeholder snapshot" });

      const first = await client.callTool({ name: "reset_state", arguments: {} });
      expect(first.isError).toBeFalsy();
      expect(first.structuredContent).toEqual({
        cleared: true,
        flights_removed_count: 2,
        schedule_cleared: true,
      });

      // After reset, the protocol-observable counts should be zeroed.
      const second = await client.callTool({ name: "reset_state", arguments: {} });
      expect(second.isError).toBeFalsy();
      expect(second.structuredContent).toEqual({
        cleared: true,
        flights_removed_count: 0,
        schedule_cleared: false,
      });
    } finally {
      await cleanup();
    }
  });

  it("rejects reset_state input with unexpected fields", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const response = await client.callTool({
        name: "reset_state",
        arguments: { unexpected: 1 } as Record<string, unknown>,
      });
      expect(response.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("lists no resources and no prompts at this stage", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resourcesPromise = client.listResources().catch(() => ({ resources: [] }));
      const promptsPromise = client.listPrompts().catch(() => ({ prompts: [] }));
      const [resources, prompts] = await Promise.all([resourcesPromise, promptsPromise]);
      expect(resources.resources ?? []).toEqual([]);
      expect(prompts.prompts ?? []).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
