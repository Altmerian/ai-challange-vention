#!/usr/bin/env node
/**
 * Slice 8 — single Inspector CLI driver.
 *
 * Drives the freshly-built ATC MCP server over real stdio transport via the
 * MCP SDK client. Covers the full **What to verify via Inspector** checklist
 * in `task-4/AGENTS.md`:
 *
 *   Protocol-level checks
 *     A. Server starts and a session is established.
 *     B. Tool catalogue is exactly {analyze_bottleneck, cancel_flight,
 *        generate_schedule, get_airport_status, reset_state, submit_flight}.
 *     C. Resource catalogue is exactly {atc://queue, atc://runways, atc://timeline}.
 *     D. Each tool's input schema rejects at least one malformed input.
 *
 *   Brief scenarios
 *     E. Morning Rush — four mixed flights, no overlap, priority order respected.
 *     F. Heavy Hauler — heavy unscheduled with no_compatible_runway, valid
 *        flights scheduled, constraints.runway_blocking true.
 *     G. Connecting Flight — A→B scheduled with dependency-buffer respected.
 *
 *   Additional verifications
 *     H. analyze_bottleneck on Connecting Flight returns the [A,B] chain.
 *     I. cancel_flight A in Connecting Flight → B becomes
 *        unscheduled/dependency_cancelled WITHOUT an explicit generate_schedule.
 *     J. reset_state empties the queue and resets submission_index to 0.
 *     K. Determinism — same scenario run twice (reset_state between) yields
 *        byte-identical scheduled offsets / runway_id / gate_id / unscheduled
 *        reasons. Wall-clock fields are excluded from the comparison.
 *
 * Exits 0 if every assertion passes; non-zero on any mismatch. Replaces the
 * per-slice slice-N-stdio-driver.mjs scripts — those remain as historical
 * verification logs but are no longer the canonical entry point.
 *
 * Usage: node verify-inspector.mjs <path-to-dist/index.js>
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import process from "node:process";

const SERVER = process.argv[2];
if (!SERVER) {
  console.error("Usage: node verify-inspector.mjs <path-to-dist/index.js>");
  process.exit(2);
}

const ENV = {
  ATC_RUNWAY_LENGTHS_M: "2500,3500",
  ATC_GATE_COUNT: "4",
  ATC_GROUND_CREW_COUNT: "2",
  ATC_LANDING_DURATION_MIN: "5",
  ATC_TAKEOFF_DURATION_MIN: "4",
  ATC_GATE_TURNAROUND_MIN: "30",
  ATC_SEPARATION_TAKEOFF_MIN: "2",
  ATC_SEPARATION_LANDING_MIN: "2",
  ATC_SEPARATION_MIXED_MIN: "3",
  ATC_DEPENDENCY_BUFFER_MIN: "15",
  ATC_MAX_HORIZON_MIN: "240",
  ATC_DEFAULT_TIMEZONE: "UTC",
};
const DEPENDENCY_BUFFER = Number(ENV.ATC_DEPENDENCY_BUFFER_MIN);

const EXPECTED_TOOLS = [
  "analyze_bottleneck",
  "cancel_flight",
  "generate_schedule",
  "get_airport_status",
  "reset_state",
  "submit_flight",
];
const EXPECTED_RESOURCES = ["atc://queue", "atc://runways", "atc://timeline"];

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${msg}`);
}

async function withClient(fn) {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
    env: { ...process.env, ...ENV },
  });
  const client = new Client(
    { name: "verify-inspector", version: "0.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function parseEnvelopeErrors(resp) {
  const text = resp.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text).errors ?? [];
  } catch {
    return [];
  }
}

function readJson(resp) {
  return JSON.parse(resp.contents[0].text);
}

function noWindowOverlap(ops, pick, groupBy) {
  const byGroup = new Map();
  for (const op of ops) {
    const key = groupBy(op);
    const arr = byGroup.get(key) ?? [];
    arr.push(pick(op));
    byGroup.set(key, arr);
  }
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => a.start_offset_min - b.start_offset_min);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].start_offset_min < arr[i - 1].end_offset_min) return false;
    }
  }
  return true;
}

/**
 * Determinism projection — keeps every field whose value is a function of the
 * input queue + config (must be byte-identical across runs), and drops
 * wall-clock-derived fields. AGENTS.md names a floor (offsets, runway/gate ids,
 * unscheduled reasons); we project a superset so a regression in
 * `predecessors` order, `priority` placement, `runway_window` / `gate_window`
 * derivation, or `blocking_flight_number` linkage also fails the harness.
 */
function projectForDeterminism(snap) {
  return {
    scheduled: snap.scheduled
      .map((e) => ({
        flight_number: e.flight_number,
        operation: e.operation,
        priority: e.priority,
        runway_id: e.runway_id,
        gate_id: e.gate_id,
        start_offset_min: e.start_offset_min,
        end_offset_min: e.end_offset_min,
        runway_window: e.runway_window,
        gate_window: e.gate_window,
        predecessors: e.predecessors,
      }))
      .sort((a, b) => (a.flight_number < b.flight_number ? -1 : 1)),
    unscheduled: snap.unscheduled
      .map((e) => ({
        flight_number: e.flight_number,
        operation: e.operation,
        priority: e.priority,
        reason: e.reason,
        ...(e.blocking_flight_number !== undefined
          ? { blocking_flight_number: e.blocking_flight_number }
          : {}),
      }))
      .sort((a, b) => (a.flight_number < b.flight_number ? -1 : 1)),
  };
}

console.log("=== A/B/C: server starts, catalogues are exactly the published sets ===");
await withClient(async (client) => {
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name).sort();
  assert(
    JSON.stringify(toolNames) === JSON.stringify(EXPECTED_TOOLS),
    `tool catalogue is exactly ${JSON.stringify(EXPECTED_TOOLS)} (got ${JSON.stringify(toolNames)})`,
  );

  const { resources } = await client.listResources();
  const resUris = resources.map((r) => r.uri).sort();
  assert(
    JSON.stringify(resUris) === JSON.stringify(EXPECTED_RESOURCES),
    `resource catalogue is exactly ${JSON.stringify(EXPECTED_RESOURCES)} (got ${JSON.stringify(resUris)})`,
  );

  // Every tool advertises a strict input schema — additionalProperties:false.
  for (const tool of tools) {
    assert(
      tool.inputSchema?.additionalProperties === false,
      `tool ${tool.name} inputSchema has additionalProperties:false`,
    );
  }
});

console.log("\n=== D: each tool's input schema rejects malformed input ===");
await withClient(async (client) => {
  // submit_flight — missing required flight_number.
  const submitBad = await client.callTool({
    name: "submit_flight",
    arguments: { operation: "arrival", priority: "high" },
  });
  assert(submitBad.isError === true, "submit_flight rejects missing flight_number");

  // cancel_flight — unknown field via strict schema.
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "A1", operation: "arrival", priority: "high" },
  });
  const cancelBad = await client.callTool({
    name: "cancel_flight",
    arguments: { flight_number: "A1", reason: "weather" },
  });
  assert(cancelBad.isError === true, "cancel_flight rejects unknown field");

  // generate_schedule — invalid IANA timezone.
  const genBad = await client.callTool({
    name: "generate_schedule",
    arguments: { timezone: "Mars/Olympus" },
  });
  assert(genBad.isError === true, "generate_schedule rejects invalid IANA timezone");

  // get_airport_status — invalid IANA timezone.
  const statusBad = await client.callTool({
    name: "get_airport_status",
    arguments: { timezone: "Mars/Olympus" },
  });
  assert(statusBad.isError === true, "get_airport_status rejects invalid IANA timezone");

  // analyze_bottleneck — invalid IANA timezone + unknown field.
  const bottleneckBadTz = await client.callTool({
    name: "analyze_bottleneck",
    arguments: { timezone: "Mars/Olympus" },
  });
  assert(
    bottleneckBadTz.isError === true,
    "analyze_bottleneck rejects invalid IANA timezone",
  );
  const bottleneckBadField = await client.callTool({
    name: "analyze_bottleneck",
    arguments: { unexpected: 1 },
  });
  assert(
    bottleneckBadField.isError === true,
    "analyze_bottleneck rejects unknown field",
  );

  // reset_state — unknown field.
  const resetBad = await client.callTool({
    name: "reset_state",
    arguments: { unexpected: 1 },
  });
  assert(resetBad.isError === true, "reset_state rejects unknown field");

  // Spot-check the error envelope shape on one of them.
  const tze = parseEnvelopeErrors(bottleneckBadTz);
  assert(
    tze.length > 0 && tze[0].reason === "invalid_input" && tze[0].field === "timezone",
    `bad timezone envelope carries field=timezone (got ${JSON.stringify(tze)})`,
  );
});

console.log("\n=== E: Morning Rush brief scenario ===");
await withClient(async (client) => {
  await client.callTool({ name: "reset_state", arguments: {} });
  const subs = [
    { flight_number: "HA1", operation: "arrival", priority: "high" },
    { flight_number: "MD1", operation: "departure", priority: "medium" },
    { flight_number: "LA1", operation: "arrival", priority: "low" },
    { flight_number: "LD1", operation: "departure", priority: "low" },
  ];
  for (const s of subs) {
    const resp = await client.callTool({ name: "submit_flight", arguments: s });
    assert(!resp.isError, `submit_flight(${s.flight_number}) accepted`);
  }
  const gen = await client.callTool({ name: "generate_schedule", arguments: {} });
  const snap = gen.structuredContent.schedule;
  assert(snap.scheduled.length === 4, "all four flights scheduled");
  assert(snap.unscheduled.length === 0, "no flights unscheduled");

  const timeline = readJson(await client.readResource({ uri: "atc://timeline" }));
  assert(
    noWindowOverlap(timeline.operations, (e) => e.runway_window, (e) => e.runway_id),
    "no runway_window overlap on the same runway",
  );
  assert(
    noWindowOverlap(timeline.operations, (e) => e.gate_window, (e) => e.gate_id),
    "no gate_window overlap on the same gate",
  );

  const byNumber = new Map(timeline.operations.map((o) => [o.flight_number, o]));
  assert(
    byNumber.get("HA1").start_offset_min <= byNumber.get("LA1").start_offset_min,
    "HA1 (high) placed no later than LA1 (low) when contested",
  );
  assert(
    byNumber.get("MD1").start_offset_min <= byNumber.get("LD1").start_offset_min,
    "MD1 (medium) placed no later than LD1 (low)",
  );
});

console.log("\n=== F: Heavy Hauler brief scenario ===");
await withClient(async (client) => {
  await client.callTool({ name: "reset_state", arguments: {} });
  await client.callTool({
    name: "submit_flight",
    arguments: {
      flight_number: "HVY1",
      operation: "departure",
      priority: "high",
      min_runway_length_m: 9999,
    },
  });
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "OK1", operation: "arrival", priority: "medium" },
  });
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "OK2", operation: "departure", priority: "low" },
  });
  const gen = await client.callTool({ name: "generate_schedule", arguments: {} });
  const snap = gen.structuredContent.schedule;
  const heavy = snap.unscheduled.find((e) => e.flight_number === "HVY1");
  assert(
    heavy?.reason === "no_compatible_runway",
    "HVY1 unscheduled with reason no_compatible_runway",
  );
  assert(
    snap.scheduled.map((e) => e.flight_number).sort().join(",") === "OK1,OK2",
    "valid flights (OK1, OK2) are scheduled",
  );

  const status = (
    await client.callTool({ name: "get_airport_status", arguments: {} })
  ).structuredContent;
  assert(status.constraints.runway_blocking === true, "constraints.runway_blocking = true");
});

console.log("\n=== G: Connecting Flight brief scenario ===");
const connecting = await withClient(async (client) => {
  await client.callTool({ name: "reset_state", arguments: {} });
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "A", operation: "arrival", priority: "high" },
  });
  await client.callTool({
    name: "submit_flight",
    arguments: {
      flight_number: "B",
      operation: "departure",
      priority: "medium",
      dependencies: ["A"],
    },
  });
  const gen = await client.callTool({ name: "generate_schedule", arguments: {} });
  const snap = gen.structuredContent.schedule;
  const aEntry = snap.scheduled.find((e) => e.flight_number === "A");
  const bEntry = snap.scheduled.find((e) => e.flight_number === "B");
  assert(aEntry !== undefined && bEntry !== undefined, "both A and B scheduled");
  assert(
    bEntry.start_offset_min >= aEntry.end_offset_min + DEPENDENCY_BUFFER,
    "B.start_offset_min >= A.end_offset_min + ATC_DEPENDENCY_BUFFER_MIN",
  );

  // Timeline ordering reflects the dependency: A appears before B.
  const timeline = readJson(await client.readResource({ uri: "atc://timeline" }));
  const aIdx = timeline.operations.findIndex((o) => o.flight_number === "A");
  const bIdx = timeline.operations.findIndex((o) => o.flight_number === "B");
  assert(aIdx >= 0 && bIdx > aIdx, "timeline orders A before B");

  return { aEntry, bEntry };
});

console.log("\n=== H: analyze_bottleneck on Connecting Flight returns [A, B] ===");
await withClient(async (client) => {
  await client.callTool({ name: "reset_state", arguments: {} });
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "A", operation: "arrival", priority: "high" },
  });
  await client.callTool({
    name: "submit_flight",
    arguments: {
      flight_number: "B",
      operation: "departure",
      priority: "medium",
      dependencies: ["A"],
    },
  });
  await client.callTool({ name: "generate_schedule", arguments: {} });
  const resp = await client.callTool({ name: "analyze_bottleneck", arguments: {} });
  const report = resp.structuredContent;
  assert(report.bottleneck_exists === true, "bottleneck_exists is true");
  assert(report.chain_length === 2, `chain_length is 2 (got ${report.chain_length})`);
  const chainNumbers = report.chain.map((e) => e.flight_number);
  assert(
    JSON.stringify(chainNumbers) === JSON.stringify(["A", "B"]),
    `chain is [A, B] (got ${JSON.stringify(chainNumbers)})`,
  );
  // The only gap on an uncontested A→B chain is the dependency buffer.
  assert(
    report.cumulative_wait_min === DEPENDENCY_BUFFER,
    `cumulative_wait_min equals ATC_DEPENDENCY_BUFFER_MIN (${DEPENDENCY_BUFFER})`,
  );
});

console.log("\n=== I: cancel_flight A → B becomes dependency_cancelled (auto-regen) ===");
await withClient(async (client) => {
  await client.callTool({ name: "reset_state", arguments: {} });
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "A", operation: "arrival", priority: "high" },
  });
  await client.callTool({
    name: "submit_flight",
    arguments: {
      flight_number: "B",
      operation: "departure",
      priority: "medium",
      dependencies: ["A"],
    },
  });
  await client.callTool({ name: "generate_schedule", arguments: {} });

  const cancel = await client.callTool({
    name: "cancel_flight",
    arguments: { flight_number: "A" },
  });
  assert(!cancel.isError, "cancel_flight A accepted");
  // The cancel response carries the fresh schedule — no follow-up generate_schedule.
  const sched = cancel.structuredContent.schedule;
  const b = sched.unscheduled.find((e) => e.flight_number === "B");
  assert(b !== undefined, "B is in unscheduled after cancel");
  assert(
    b?.reason === "dependency_cancelled",
    `B.reason is dependency_cancelled (got ${b?.reason})`,
  );
  assert(
    b?.blocking_flight_number === "A",
    `B.blocking_flight_number is A (got ${b?.blocking_flight_number})`,
  );

  // Confirm a follow-up read returns the same state — no implicit recomputation.
  const queue = readJson(await client.readResource({ uri: "atc://queue" }));
  const bQ = queue.flights.find((f) => f.flight_number === "B");
  assert(bQ?.state === "unscheduled", "queue reflects B's unscheduled state");
});

console.log("\n=== J: reset_state empties the queue and resets submission_index to 0 ===");
await withClient(async (client) => {
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "A", operation: "arrival", priority: "high" },
  });
  await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "B", operation: "departure", priority: "low" },
  });
  const reset = await client.callTool({ name: "reset_state", arguments: {} });
  assert(reset.structuredContent.flights_removed_count === 2, "reset removed 2 flights");

  const queue = readJson(await client.readResource({ uri: "atc://queue" }));
  assert(queue.flights.length === 0, "queue is empty after reset");

  const fresh = await client.callTool({
    name: "submit_flight",
    arguments: { flight_number: "X", operation: "arrival", priority: "medium" },
  });
  assert(
    fresh.structuredContent.submission_index === 0,
    `next submission_index is 0 (got ${fresh.structuredContent.submission_index})`,
  );
});

console.log("\n=== K: determinism — two passes, byte-identical projected snapshots ===");
await withClient(async (client) => {
  async function runFixture() {
    await client.callTool({ name: "reset_state", arguments: {} });
    const subs = [
      { flight_number: "A", operation: "arrival", priority: "high" },
      {
        flight_number: "B",
        operation: "departure",
        priority: "high",
        dependencies: ["A"],
      },
      {
        flight_number: "HVY",
        operation: "departure",
        priority: "high",
        min_runway_length_m: 9999,
      },
      { flight_number: "C", operation: "arrival", priority: "medium" },
      { flight_number: "D", operation: "departure", priority: "low" },
    ];
    for (const s of subs) {
      const resp = await client.callTool({ name: "submit_flight", arguments: s });
      if (resp.isError) throw new Error(`submit_flight(${s.flight_number}) failed`);
    }
    const gen = await client.callTool({ name: "generate_schedule", arguments: {} });
    return projectForDeterminism(gen.structuredContent.schedule);
  }
  const first = await runFixture();
  const second = await runFixture();
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "two passes produce byte-identical projected snapshots (offsets + reasons)",
  );
});

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} assertion(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `\nAll Inspector-driven verification checks passed (verified against ${SERVER}).`,
);
// Connecting Flight handoff values for debugging if needed.
void connecting;
