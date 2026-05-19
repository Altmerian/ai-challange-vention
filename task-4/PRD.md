# PRD — Air Traffic Control MCP Server

> **Audience:** AI agents implementing the server in `task-4/`. Not for human evaluators — they read `README.md` and `report.md`.
> **Companions:** [`CONTEXT.md`](./CONTEXT.md) (domain glossary), [`docs/adr/`](./docs/adr/) (decisions), [`AGENTS.md`](./AGENTS.md) (verification checklist).

## Problem Statement

An MCP-compatible AI client (Claude Desktop, Inspector, custom agent, etc.) needs to coordinate **Flights** through a busy airport: it has to submit arrivals and departures, observe how they get placed across constrained resources, understand why some can't be placed, and react when disruptions cascade through dependent flights. Today the client has no shared scheduler — every AI assistant reinvents flight scheduling client-side or skips the problem.

## Solution

A lightweight TypeScript MCP server (`@modelcontextprotocol/sdk`, stdio transport, in-memory state) that exposes a deterministic greedy scheduler as MCP tools and resources. The server accepts flight submissions through a queue, computes a fresh **Schedule** on demand over configured runways / gates / ground crew, surfaces the result and the operational state through tools and `atc://*` resources, and re-evaluates dependents whenever a flight is cancelled.

## User Stories

1. As an **operator**, I want to configure the airport (runway lengths, gate count, ground-crew count, buffers, horizon) entirely through environment variables at startup, so that no airport state leaks into source.
2. As an **operator**, I want startup to fail loudly with **all** configuration errors collected and printed at once, so that I can fix every typo in a single round.
3. As an **operator**, I want state to be process-local and ephemeral, so that the server is simple to deploy and a restart guarantees a clean slate when I want to change configuration.
4. As an **AI client**, I want to call `submit_flight` with a `flight_number`, `operation` (arrival/departure), `priority` (high/medium/low), an optional list of `dependencies`, and an optional `min_runway_length_m`, so that I can express a flight plan in one call.
5. As an **AI client**, I want the server to assign a `submission_index` and return it in the response, so that I can trace queue order and deterministic tiebreaks.
6. As an **AI client**, I want duplicate flight numbers — including against cancelled flights — to be rejected at submission, so that flight numbers stay unique forever.
7. As an **AI client**, I want self-dependencies rejected immediately at submission with reason `self_dependency`, so that obvious malformed flight plans fail fast.
8. As an **AI client**, I want forward-referenced predecessors (submit B-depends-on-A before A exists) to be accepted, so that I can wire up a multi-leg journey in any order.
9. As an **AI client**, I want `generate_schedule` to replace the current schedule with a freshly computed one based on the current queue and configuration, so that I have a single explicit moment of scheduling.
10. As an **AI client**, I want repeated `generate_schedule` calls with the same queue and configuration to produce byte-identical canonical offsets, so that determinism is verifiable.
11. As an **AI client**, I want higher-priority **Ready Flights** placed earlier when resources are contested, so that critical operations get preferred slots.
12. As an **AI client**, I want flights that can't be placed to remain in the queue in state `unscheduled` with a reason from a fixed taxonomy (`no_compatible_runway` · `horizon_exceeded` · `dependency_cycle` · `dependency_missing` · `dependency_cancelled` · `dependency_unscheduled`), so that I can react precisely.
13. As an **AI client**, I want `cancel_flight` to mark the target `cancelled` (terminal, idempotent) and immediately trigger a fresh **Scheduling Pass**, so that dependents are re-evaluated without an explicit follow-up call.
14. As an **AI client**, I want `cancel_flight` to return both the cancellation acknowledgement and the new schedule snapshot, so that I see the consequences in one round-trip.
15. As an **AI client**, I want `reset_state` to wipe the queue, drop the schedule, and reset `submission_index` to 0, so that I can begin a fresh scenario in the same session.
16. As an **AI client**, I want `get_airport_status` to return flight counts by state and operation, per-runway and per-gate capacity/usage, resource constraint indicators, the list of blocked flights with reasons, and the schedule completion timing — and nothing else, so that the payload matches the brief exactly.
17. As an **AI client**, I want `analyze_bottleneck` to return the longest dependency chain through scheduled flights measured in elapsed minutes (not node count), with deterministic tiebreaking, so that I can explain the schedule's makespan.
18. As an **AI client**, I want `analyze_bottleneck` to report `bottleneck_exists: false` when no qualifying chain exists (no scheduled inter-dependencies), so that I can branch cleanly.
19. As an **AI client**, I want to inspect the `atc://queue` resource for every flight in the queue including cancelled and unscheduled ones, so that I have a full audit view.
20. As an **AI client**, I want to inspect the `atc://runways` resource for per-runway scheduled operations and utilization, so that I can spot under- or over-used runways.
21. As an **AI client**, I want to inspect the `atc://timeline` resource for a flat chronological list of every scheduled operation, so that I can see "what happens next" across the whole airport.
22. As an **AI client**, I want each schedule entry to carry both canonical integer-minute offsets (`start_offset_min` / `end_offset_min`) **and** ISO-8601 timestamps with offset (`start_at` / `end_at`), so that I can compare exactly for determinism *and* render to humans.
23. As an **AI client**, I want every tool that emits timestamps to accept an optional `timezone` argument (IANA name), so that timestamps come back in the user's local zone.
24. As an **AI client**, I want an invalid IANA timezone to fail with an error envelope (not silently fall back to UTC), so that misconfiguration is loud.
25. As an **AI client**, I want validation errors to come back as MCP `isError: true` envelopes (with all problems collected, not just the first), so that I can detect failures structurally and fix them in batches.
26. As an **AI client**, I want runway-length compatibility to be the only flight-vs-runway constraint, so that the matching rule is one line of logic and easy to reason about.
27. As an **AI client**, I want gates to be uniform — any flight can use any gate — so that I never need to specify gate preferences.
28. As an **AI client**, I want the scheduler to respect **Separation Buffers** (takeoff, landing, mixed) on each runway, **Gate Turnaround** on each gate, **Dependency Buffer** between predecessor completion and dependent start, and the **Scheduling Horizon** as a hard wall, so that the schedule is realistic and bounded.
29. As an **AI client**, I want the scheduler to never displace already-placed flights — a high-priority flight that can't fit becomes `unscheduled` with a reason — so that the algorithm's behaviour is predictable.
30. As an **AI client**, I want the scheduler to use no priority inheritance — a low-priority predecessor stays low — so that the priority I assign is the priority I get.
31. As an **AI client**, I want operations to consume both **Runway** and **Gate** with one **Ground Crew** unit during the gate window, ordered correctly per operation type (arrival = runway→gate, departure = gate→runway), so that resource usage matches real operations.
32. As an **AI client**, I want a flight's **Completion Time** to be the moment its gate releases (arrivals) or its runway releases (departures), so that dependents anchor off the right moment.
33. As an **implementing agent**, I want canonical scenario tests for the three brief scenarios plus ten extras, so that I can verify behaviour end-to-end before signing off.
34. As an **implementing agent**, I want a required Inspector verification checklist in `AGENTS.md`, so that protocol-level regressions are caught before merge.
35. As an **evaluator**, I want a tight `README.md` covering install/build/run/env-vars/tool-and-resource reference and nothing else, so that I can verify the submission in minutes.

## Implementation Decisions

### Module structure

The implementation is split between **deep** modules (small interface, large encapsulated behaviour, isolated unit-testable) and **shallow** modules (wiring layers that compose the deep modules into the MCP surface).

#### Deep modules

- **`Scheduler`** — pure function `(queue: Flight[], config: Config) → ScheduleSnapshot`. Implements the greedy dependency-respecting algorithm: build dependency DAG → detect cycles → loop selecting the **Ready Flight** with `(priority desc, submission_index asc)` → find earliest feasible window across compatible runways and any gate (and any free crew unit) → place it. No I/O, no clock, no env access. Resource selection tiebreaks are: (a) earliest feasible `start_offset_min`, then (b) lowest runway index, then (c) lowest gate index. **Crew-unit selection is not part of the published tiebreak rule** — once a feasible `(runway, gate)` slot is chosen, the scheduler picks the smallest-index ground-crew unit whose existing reservations leave a gap fitting the gate_window. This keeps placement deterministic without exposing crew identity to the wire contract. The implementation pattern looks roughly like:

  ```ts
  // Decision shape only — not a complete implementation
  function runSchedulingPass(queue: Flight[], cfg: Config): ScheduleSnapshot {
    const graph = buildDependencyGraph(queue);
    const cyclic = findCycles(graph);                       // flights in cycles → unscheduled
    const calendar = emptyCalendar(cfg);                    // runways + gates + crew pool
    const ready: Heap<Flight> = ...;                        // ordered by (priority, submission_index)
    const result = new ScheduleSnapshot();
    while (!ready.empty()) {
      const f = ready.pop();
      const slot = findEarliestFeasibleSlot(f, calendar, cfg);
      if (!slot) { result.markUnscheduled(f, reasonFor(f, cfg)); continue; }
      calendar.reserve(slot);
      result.place(f, slot);
      for (const dep of dependentsOf(f, graph)) if (allPredecessorsPlaced(dep, result)) ready.push(dep);
    }
    cascadeUnscheduledDependents(result, graph);            // dependency_unscheduled propagation
    return result;
  }
  ```

- **`BottleneckAnalyzer`** — pure function `(schedule: ScheduleSnapshot, queue: Flight[]) → BottleneckReport`. Implements longest-weighted-path through the dependency DAG restricted to `scheduled` flights, weighted by elapsed minutes (`end - start` per node, gaps included implicitly via `last.end - first.start`). Standard topological-order DP. Tiebreak: elapsed → node count → earliest start → lex flight numbers.

- **`Config`** — `parseFromEnv(env: NodeJS.ProcessEnv) → Result<Config, ConfigError[]>`. Parses every `ATC_*` variable, validates type and bounds, collects every error, returns either a typed immutable config or the full error list. No partial-success states.

- **`TimezoneFormatter`** — pure function `(offsetMin: integer, anchor: Date /* UTC */, tz: string /* IANA */) → string /* ISO-8601 with offset */`. Validates the IANA name against the system tz database; throws a typed error on invalid input. Uses `Intl.DateTimeFormat` with `timeZone` option to compute the offset.

#### Shallow modules

- **`AirportState`** — in-memory store owning: the flight queue (durable list with every submission ever made), the current schedule (nullable), the submission-index counter. API: `addFlight`, `cancelFlight`, `replaceSchedule`, `reset`, plus read accessors. `cancelFlight` internally invokes the **Scheduler** to satisfy the auto-regen requirement. No persistence layer behind it.

- **`McpServer`** — instantiates `@modelcontextprotocol/sdk` `Server`, registers six tool handlers and three resource handlers. Each handler: validates input via zod, calls into `AirportState` / `Scheduler` / `BottleneckAnalyzer`, formats the response through `TimezoneFormatter`, returns. No business logic in the handler.

- **`ErrorEnvelope`** — utility to format MCP error responses, collecting multiple validation issues into a single envelope.

- **Bootstrap (`index.ts`)** — entrypoint: parses `Config`, exits non-zero on errors (printing all of them), constructs `AirportState`, constructs `McpServer`, attaches `StdioServerTransport`, runs.

### Tool contract (`@modelcontextprotocol/sdk` Tool definitions)

| Tool | Input | Output |
| --- | --- | --- |
| `submit_flight` | `{ flight_number: string, operation: "arrival"\|"departure", priority: "high"\|"medium"\|"low", dependencies?: string[], min_runway_length_m?: integer }` | `{ accepted: true, flight_number, submission_index }` or error envelope |
| `cancel_flight` | `{ flight_number: string, timezone?: string }` | `{ cancelled: true, flight_number, schedule: ScheduleSnapshot }` |
| `generate_schedule` | `{ timezone?: string }` | `{ schedule: ScheduleSnapshot }` |
| `get_airport_status` | `{ timezone?: string }` | `AirportStatus` (shape below) |
| `analyze_bottleneck` | `{ timezone?: string }` | `BottleneckReport` (shape below) |
| `reset_state` | `{}` | `{ cleared: true, flights_removed_count, schedule_cleared }` |

### Resource contract (URI scheme `atc://`)

| URI | Content shape | Notes |
| --- | --- | --- |
| `atc://queue` | `{ flights: QueueEntry[] }` — every flight ever submitted, in submission order. Includes cancelled and unscheduled. Each entry carries: `flight_number`, `operation`, `priority`, `dependencies`, `min_runway_length_m?`, `state` (`submitted`/`scheduled`/`unscheduled`/`cancelled`), `submission_index`, plus the placement (if `scheduled`) or `reason`+`detail`+`blocking_flight_number?` (if `unscheduled`) | Reads current in-memory state; does not trigger recomputation. |
| `atc://runways` | `{ runways: [{ runway_id, length_m, operations: ScheduleEntry[], busy_minutes, utilization_pct, available_windows: [{ start_offset_min, end_offset_min }], next_available_at_offset_min: integer \| null }] }` | Operations sorted by `start_offset_min`. `busy_minutes` sums `runway_window` durations plus every trailing separation buffer; for the **last** operation on a runway the trailing buffer is `max(separation_for(prev.operation, prev.operation), separation_for_mixed)` — the worst-case sep before any unknown next op (kept conservative so the published number remains safe regardless of which op type comes next). `utilization_pct` = `round(busy_minutes / horizon_min * 1000) / 10` (one decimal place). `available_windows` are the gaps between operations (including trailing separation buffers) over `[0, horizon_min]`; `next_available_at_offset_min` is the start of the first such gap that begins at or after the current pass's t=0, or `null` if the runway is saturated for the horizon. Before any `generate_schedule` call, every runway returns `operations: []`, `busy_minutes: 0`, and `available_windows: [{0, horizon_min}]`. |
| `atc://timeline` | `{ operations: ScheduleEntry[] }` — flat chronological list across the whole airport, sorted by `start_offset_min` then `flight_number` | Runway-agnostic view. Before any `generate_schedule` call, returns `{ operations: [] }`. |

### Shared output shapes

**`ScheduleSnapshot`:**
```ts
{
  generated_at: string,           // UTC ISO-8601 instant (minute precision) — when this pass ran
  schedule_start_at: string,      // UTC ISO-8601 instant (minute precision) — the canonical t=0 anchor (per ADR-0002)
  timezone: string,               // echoes the IANA name used; presentation only — anchor is always UTC
  horizon_min: integer,
  scheduled: ScheduleEntry[],     // sorted by (start_offset_min, flight_number)
  unscheduled: UnscheduledEntry[], // sorted by flight_number
  totals: { submitted, scheduled, unscheduled, cancelled }   // integer counts
}
```
The canonical t=0 anchor is **always UTC**. Client-zone rendering happens per-entry via `start_at` / `end_at` on each `ScheduleEntry` (and analogous fields elsewhere). `schedule_start_at` and `generated_at` are equal: the snapshot is built synchronously from the `now` captured at the start of the pass, truncated to minute precision. `totals` reports **current state counts** — after a pass, every non-cancelled flight is either `scheduled` or `unscheduled`, so `totals.submitted` is always 0 in any snapshot the scheduler emits. `flights.by_state` in `AirportStatus` reads the same counts off `AirportState.queue` and so will report `submitted: 0` once `generate_schedule` has run.

**`ScheduleEntry`:**
```ts
{
  flight_number, operation, priority,
  runway_id, gate_id,
  start_offset_min, end_offset_min,      // operation span: touchdown→gate-release (arrival) | gate-claim→wheels-up (departure)
  runway_window: { start_offset_min, end_offset_min },  // exclusive runway occupancy for this operation
  gate_window:   { start_offset_min, end_offset_min },  // exclusive gate occupancy for this operation
  start_at, end_at,                       // ISO-8601 with offset, formatted in client timezone — render of operation span
  predecessors: string[]                  // echoes dependencies
}
```
Derivation rules (the Scheduler emits both windows directly; tests and clients consume them as-is):

- **Arrival:** `runway_window = [start_offset_min, start_offset_min + ATC_LANDING_DURATION_MIN]`; `gate_window = [runway_window.end_offset_min, end_offset_min]`; `end_offset_min = gate_window.end_offset_min`.
- **Departure:** `gate_window = [start_offset_min, start_offset_min + ATC_GATE_TURNAROUND_MIN]`; `runway_window = [gate_window.end_offset_min, end_offset_min]`; `end_offset_min = runway_window.end_offset_min`.

The trailing **Separation Buffer** is enforced as a gap **between** consecutive runway operations (not folded into `runway_window`): `next.runway_window.start_offset_min ≥ prev.runway_window.end_offset_min + separation_for(prev.operation, next.operation)`. Overlap tests on a single runway/gate become "no two windows overlap"; the separation rule is a second, independent assertion.

**`UnscheduledEntry`:**
```ts
{
  flight_number, operation, priority,
  reason: "no_compatible_runway" | "horizon_exceeded" | "dependency_cycle"
        | "dependency_missing" | "dependency_cancelled" | "dependency_unscheduled",
  detail: string,                         // human-readable explanation
  blocking_flight_number?: string         // only for dependency_* reasons
}
```

**`AirportStatus`:**
```ts
{
  flights: {
    by_state: { submitted, scheduled, unscheduled, cancelled },
    by_operation: { arrival, departure }
  },
  resources: {
    runways: [{ runway_id, length_m, operations_count, busy_minutes, utilization_pct }],
    gates:   [{ gate_id,             operations_count, busy_minutes, utilization_pct }]
  },
  constraints: {
    runway_blocking, horizon_blocking, dependency_blocking, any_blocked  // booleans
  },
  blocked_flights: UnscheduledEntry[],
  schedule_completion: { schedule_start_at, makespan_min, completion_at } | null
}
```
`schedule_start_at` and `completion_at` are **UTC ISO-8601 instants** (presentation in the client zone happens in tool responses that carry `timezone`, not here). `schedule_completion` is `null` iff `generate_schedule` has never run in this process; an all-unscheduled pass returns `{ schedule_start_at, makespan_min: 0, completion_at: schedule_start_at }`. Runway `busy_minutes` includes the trailing separation buffer (the runway is unavailable during it); the **last** op's trailing buffer is `max(same-type sep, mixed sep)` — the worst-case sep before any unknown next op, kept conservative so the published number stays safe regardless of next op type. Gate `busy_minutes` is the sum of `gate_window` durations (no trailing buffer — gate turnaround already covers it). Ground crew is *not* in `resources` — the brief names only runways and gates.

**`BottleneckReport`:**
```ts
{
  bottleneck_exists: boolean,
  chain_length: integer,                  // 0 if !exists
  total_elapsed_min: integer,
  cumulative_operation_min: integer,      // sum of (end_offset_min - start_offset_min) across chain nodes
  cumulative_wait_min: integer,           // total_elapsed - cumulative_operation; folds in dependency-buffer waits AND resource-contention gaps
  start_at?: string, end_at?: string,     // client-tz render of the chain's first start / last end
  chain: ScheduleEntry[],                 // ordered first → last
  note?: string                           // e.g. "no scheduled dependency edges"
}
```
`cumulative_wait_min` is intentionally broad: in greedy scheduling, gaps between predecessor end and dependent start can come from the dependency buffer, from resource contention, or from both — splitting them cleanly is not tractable without re-running the scheduler. Clients that need to attribute waiting should compare against `ATC_DEPENDENCY_BUFFER_MIN × (chain_length − 1)`.

### Environment variables

All required unless marked optional. Validation errors are collected and printed together at startup; the process exits non-zero if any error is present.

| Variable | Type | Validation |
| --- | --- | --- |
| `ATC_RUNWAY_LENGTHS_M` | comma-separated ints | ≥1 entry, each ≥1 — defines runway count and lengths in one place |
| `ATC_GATE_COUNT` | int | ≥1 |
| `ATC_GROUND_CREW_COUNT` | int | ≥1 |
| `ATC_LANDING_DURATION_MIN` | int | ≥1 |
| `ATC_TAKEOFF_DURATION_MIN` | int | ≥1 |
| `ATC_GATE_TURNAROUND_MIN` | int | ≥1 |
| `ATC_SEPARATION_TAKEOFF_MIN` | int | ≥0 |
| `ATC_SEPARATION_LANDING_MIN` | int | ≥0 |
| `ATC_SEPARATION_MIXED_MIN` | int | ≥0 |
| `ATC_DEPENDENCY_BUFFER_MIN` | int | ≥0 |
| `ATC_MAX_HORIZON_MIN` | int | ≥1 |
| `ATC_DEFAULT_TIMEZONE` *(optional)* | IANA tz name | parses against system tz db (defaults to `UTC`) |

Runway IDs auto-assigned `RWY-1`, `RWY-2`, …; gate IDs auto-assigned `GATE-1`, `GATE-2`, … by position.

### Architectural decisions

- **Stack:** TypeScript strict mode, Node ≥ 20 LTS, `@modelcontextprotocol/sdk` for MCP, `zod` for runtime validation everywhere, `vitest` for tests, `tsc` build to `dist/`.
- **Transport:** stdio only.
- **State:** in-memory only; restart wipes the queue. `reset_state` is the in-process equivalent.
- **Scheduling algorithm:** greedy with strict priority, no displacement, no inheritance. See [ADR-0001](./docs/adr/0001-scheduling-algorithm.md).
- **Time model:** integer minutes + wall-clock anchor + per-call IANA timezone. See [ADR-0002](./docs/adr/0002-time-and-timezone-model.md).
- **Bottleneck:** elapsed minutes, not node count. See [ADR-0003](./docs/adr/0003-bottleneck-by-elapsed-minutes.md).
- **Forward-reference dependencies:** allowed; unknown predecessor → `dependency_missing` at scheduling time. See [ADR-0004](./docs/adr/0004-forward-reference-dependencies.md).

## Testing Decisions

### What makes a good test here

- Tests target **external behaviour** of a module, not implementation details. For `Scheduler`, that means asserting on the returned `ScheduleSnapshot` — never on its private graph or calendar structures.
- No mocking of collaborators *within* a deep module. Exercise the module end-to-end with plain-data inputs.
- Integration tests speak MCP protocol via the SDK's `InMemoryTransport`, not by calling handlers directly — to catch schema/framing regressions.
- Scenario tests follow the brief's three scenarios verbatim and assert the brief's stated "Expected result" bullets — these tests are the ground truth for the submission.

### Modules to test

| Module | Test layer | Why |
| --- | --- | --- |
| `Scheduler` | Unit (vitest) | Deep core; the most logic, easiest to test in isolation with hand-built queues. |
| `BottleneckAnalyzer` | Unit (vitest) | Pure function; easy to test trivial / 1-node / multi-chain / tie cases. |
| `Config` | Unit (vitest) | Validation rules deserve direct tests covering each error path. |
| `TimezoneFormatter` | Unit (vitest) | Edge cases around DST transitions, invalid zones, integer-minute boundary. |
| `McpServer` (tools + resources) | Integration (vitest + `InMemoryTransport`) | Validates the MCP surface end-to-end through the protocol. |
| End-to-end scenarios | Integration (vitest + `InMemoryTransport`) | The three brief scenarios + ten extras (cycle, forward reference, cancellation cascade, determinism, reset, duplicate, self-dependency, heavy hauler with valid flights, bottleneck trivial, bottleneck 3-chain). |
| Server through stdio | Manual via MCP Inspector (CLI mode) per `AGENTS.md` checklist | Catches stdio-framing and packaging issues that `InMemoryTransport` won't surface. |

### Prior art

None in this repo for MCP servers. The testing approach mirrors common Node MCP server testing patterns: pure-function scheduler core + protocol-level integration via the SDK's in-memory transport + Inspector-driven smoke verification.

## Out of Scope

- Persistence of any kind (no SQLite, no JSON files, no Redis). State is process-local.
- Authentication, multi-tenancy, or user identity.
- Streamable HTTP transport.
- Optimal scheduling (the algorithm is deliberately greedy; see ADR-0001).
- Wall-clock execution / simulated time advancement / a `completed` flight state.
- Per-gate or per-crew attributes; gates and crew are uniform pools.
- Per-runway attributes beyond `length_m`.
- Per-edge dependency buffer (single global value).
- Priority inheritance up dependency chains.
- Displacement of already-placed flights to accommodate a higher-priority newcomer.
- Update or resurrection semantics on flight numbers (a number is unique forever in a server's lifetime).
- Dynamic configuration changes (env vars are read once at startup; restart to change).
- UI, dashboard, or web frontend.
- Performance / load testing.
- Snapshot or property-based testing.

## Further Notes

- The split between **`README.md`** (humans, evaluators) and the rest of `task-4/` (`CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, `docs/adr/`, `PRD.md`, tests — all for implementing agents) is enforced: design rationale, decision trade-offs, and internal terminology must not leak into `README.md`.
- The `report.md` is the human-facing post-mortem: scheduling approach summary, tooling used, what worked, what didn't. Separate from `README.md`'s "how to use it".
- The full reasoning behind every design choice in this PRD is recorded in the four ADRs under `docs/adr/`. The terms used throughout this PRD are defined in `CONTEXT.md` — implementing agents must use those terms exclusively.
