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

function parseEnvelopeErrors(response: {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
}): Array<{ reason: string; flight_number?: string; field?: string }> {
  // Prefer structuredContent (typed payload); fall back to content[0].text JSON.
  const structured = response.structuredContent as
    | { errors?: Array<{ reason: string; flight_number?: string; field?: string }> }
    | undefined;
  if (structured?.errors) return structured.errors;
  const text = response.content?.[0]?.text ?? "";
  const parsed = JSON.parse(text) as {
    errors: Array<{ reason: string; flight_number?: string; field?: string }>;
  };
  return parsed.errors;
}

async function readQueue(client: Client): Promise<{
  flights: Array<Record<string, unknown>>;
}> {
  const resp = await client.readResource({ uri: "atc://queue" });
  const first = resp.contents[0];
  if (!first || typeof first.text !== "string") {
    throw new Error("atc://queue did not return a text payload");
  }
  return JSON.parse(first.text) as { flights: Array<Record<string, unknown>> };
}

describe("MCP server — catalogues (slice 2)", () => {
  it("advertises exactly submit_flight and reset_state", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(["reset_state", "submit_flight"]);
    } finally {
      await cleanup();
    }
  });

  it("advertises exactly the atc://queue resource", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const { resources } = await client.listResources();
      expect(resources.map((r) => r.uri)).toEqual(["atc://queue"]);
      expect(resources[0]?.mimeType).toBe("application/json");
    } finally {
      await cleanup();
    }
  });

  it("lists no prompts", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const prompts = await client.listPrompts().catch(() => ({ prompts: [] }));
      expect(prompts.prompts ?? []).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});

describe("submit_flight", () => {
  it("accepts a valid submission and returns submission_index 0", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
        },
      });
      expect(resp.isError).toBeFalsy();
      expect(resp.structuredContent).toEqual({
        accepted: true,
        flight_number: "AA100",
        submission_index: 0,
      });
    } finally {
      await cleanup();
    }
  });

  it("assigns strictly-increasing submission_index across calls", async () => {
    const { client, cleanup } = await connectClient();
    try {
      for (let i = 0; i < 3; i++) {
        const resp = await client.callTool({
          name: "submit_flight",
          arguments: {
            flight_number: `AA${100 + i}`,
            operation: i % 2 === 0 ? "arrival" : "departure",
            priority: "medium",
          },
        });
        expect(resp.isError).toBeFalsy();
        expect((resp.structuredContent as { submission_index: number }).submission_index).toBe(i);
      }
    } finally {
      await cleanup();
    }
  });

  it("rejects a duplicate flight number with reason duplicate_flight_number", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const dup = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "departure", priority: "low" },
      });
      expect(dup.isError).toBe(true);
      const errors = parseEnvelopeErrors(dup);
      expect(errors.map((e) => e.reason)).toEqual(["duplicate_flight_number"]);
      expect(errors[0]?.flight_number).toBe("AA100");
    } finally {
      await cleanup();
    }
  });

  it("rejects self-dependency at submission with reason self_dependency", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          dependencies: ["AA100"],
        },
      });
      expect(resp.isError).toBe(true);
      const errors = parseEnvelopeErrors(resp);
      expect(errors.map((e) => e.reason)).toEqual(["self_dependency"]);
      expect(errors[0]?.flight_number).toBe("AA100");
    } finally {
      await cleanup();
    }
  });

  it("accepts forward-referenced predecessors without resolving them (ADR-0004)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "BB200",
          operation: "departure",
          priority: "medium",
          dependencies: ["AA100"], // not yet submitted
        },
      });
      expect(resp.isError).toBeFalsy();
      expect(resp.structuredContent).toEqual({
        accepted: true,
        flight_number: "BB200",
        submission_index: 0,
      });
      // Queue carries the unresolved edge as-is.
      const queue = await readQueue(client);
      expect(queue.flights[0]?.dependencies).toEqual(["AA100"]);
      expect(queue.flights[0]?.state).toBe("submitted");
    } finally {
      await cleanup();
    }
  });

  it("collects multiple violations into one envelope (self-dep AND duplicate)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          dependencies: ["AA100"],
        },
      });
      expect(resp.isError).toBe(true);
      const reasons = parseEnvelopeErrors(resp)
        .map((e) => e.reason)
        .sort();
      expect(reasons).toEqual(["duplicate_flight_number", "self_dependency"]);
    } finally {
      await cleanup();
    }
  });

  it("rejects unknown fields via the strict input schema", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          weight_kg: 80_000,
        } as Record<string, unknown>,
      });
      expect(resp.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("rejects invalid priority via the schema", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "URGENT",
        } as Record<string, unknown>,
      });
      expect(resp.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("atc://queue resource", () => {
  it("returns flights in submission order with the QueueEntry shape", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "AA100",
          operation: "arrival",
          priority: "high",
          min_runway_length_m: 3000,
        },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "BB200",
          operation: "departure",
          priority: "medium",
          dependencies: ["AA100"],
        },
      });
      const queue = await readQueue(client);
      expect(queue.flights).toHaveLength(2);
      expect(queue.flights[0]).toEqual({
        flight_number: "AA100",
        operation: "arrival",
        priority: "high",
        dependencies: [],
        state: "submitted",
        submission_index: 0,
        min_runway_length_m: 3000,
      });
      expect(queue.flights[1]).toEqual({
        flight_number: "BB200",
        operation: "departure",
        priority: "medium",
        dependencies: ["AA100"],
        state: "submitted",
        submission_index: 1,
      });
      // min_runway_length_m is absent (not undefined) when unset.
      expect(Object.prototype.hasOwnProperty.call(queue.flights[1], "min_runway_length_m")).toBe(
        false,
      );
    } finally {
      await cleanup();
    }
  });

  it("silently de-duplicates a dependency list before storing it", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: {
          flight_number: "CC300",
          operation: "departure",
          priority: "low",
          dependencies: ["AA100", "AA100", "BB200", "AA100"],
        },
      });
      const queue = await readQueue(client);
      expect(queue.flights[0]?.dependencies).toEqual(["AA100", "BB200"]);
    } finally {
      await cleanup();
    }
  });

  it("does not recompute on repeated reads (byte-identical payload)", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      const r1 = await client.readResource({ uri: "atc://queue" });
      const r2 = await client.readResource({ uri: "atc://queue" });
      expect(r1.contents[0]?.text).toBe(r2.contents[0]?.text);
    } finally {
      await cleanup();
    }
  });
});

describe("reset_state — flow with submit_flight", () => {
  it("returns the canonical reset_state response on a fresh state", async () => {
    const { client, cleanup } = await connectClient();
    try {
      const resp = await client.callTool({ name: "reset_state", arguments: {} });
      expect(resp.isError).toBeFalsy();
      expect(resp.structuredContent).toEqual({
        cleared: true,
        flights_removed_count: 0,
        schedule_cleared: false,
      });
    } finally {
      await cleanup();
    }
  });

  it("counts submitted flights and resets submission_index to 0", async () => {
    const { client, cleanup } = await connectClient();
    try {
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "AA100", operation: "arrival", priority: "high" },
      });
      await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "BB200", operation: "departure", priority: "low" },
      });

      const reset = await client.callTool({ name: "reset_state", arguments: {} });
      expect(reset.structuredContent).toEqual({
        cleared: true,
        flights_removed_count: 2,
        schedule_cleared: false,
      });

      // Next submission should claim submission_index 0 again.
      const fresh = await client.callTool({
        name: "submit_flight",
        arguments: { flight_number: "ZZ999", operation: "arrival", priority: "medium" },
      });
      expect((fresh.structuredContent as { submission_index: number }).submission_index).toBe(0);

      const queue = await readQueue(client);
      expect(queue.flights).toHaveLength(1);
      expect(queue.flights[0]?.flight_number).toBe("ZZ999");
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
});
