# Task 4 — Implementation Plan

Tracer-bullet vertical slices for the Air Traffic Control MCP server. Each slice cuts through every layer (schema → state/scheduler → MCP surface → tests) and is independently demoable. Source spec: [`PRD.md`](./PRD.md). Glossary: [`CONTEXT.md`](./CONTEXT.md). Decisions: [`docs/adr/`](./docs/adr/). Verification: [`AGENTS.md`](./AGENTS.md).

Repo: [Altmerian/ai-challenge-vention](https://github.com/Altmerian/ai-challenge-vention)

## Status overview

| # | Slice | Type | Blocked by | GH Issue | Status |
|---|---|---|---|---|---|
| 1 | Scaffold + `Config` + `reset_state` + stdio bootstrap | AFK | — | [#9](https://github.com/Altmerian/ai-challenge-vention/issues/9) | - [ ] |
| 2 | `submit_flight` + `atc://queue` | AFK | #9 | [#10](https://github.com/Altmerian/ai-challenge-vention/issues/10) | - [ ] |
| 3 | `generate_schedule` MVP + `atc://runways` + `atc://timeline` + `TimezoneFormatter` + Morning Rush | AFK | #10 | [#11](https://github.com/Altmerian/ai-challenge-vention/issues/11) | - [ ] |
| 4 | Dependencies in `Scheduler` + Connecting Flight | AFK | #11 | [#12](https://github.com/Altmerian/ai-challenge-vention/issues/12) | - [ ] |
| 5 | `cancel_flight` with auto-regen cascade | AFK | #12 | [#13](https://github.com/Altmerian/ai-challenge-vention/issues/13) | - [ ] |
| 6 | `get_airport_status` + Heavy Hauler | AFK | #11, #12 | [#14](https://github.com/Altmerian/ai-challenge-vention/issues/14) | - [ ] |
| 7 | `analyze_bottleneck` (CPM critical path) | AFK | #12 | [#15](https://github.com/Altmerian/ai-challenge-vention/issues/15) | - [ ] |
| 8 | Determinism + extra scenarios + Inspector verification | AFK | #13, #14, #15 | [#16](https://github.com/Altmerian/ai-challenge-vention/issues/16) | - [ ] |
| 9 | `README.md` + `report.md` | AFK | #16 | [#17](https://github.com/Altmerian/ai-challenge-vention/issues/17) | - [ ] |

## Dependency graph

```
#9 ──► #10 ──► #11 ──► #12 ──┬─► #13 ───┐
                             │          │
                             ├─► #14 ───┼─► #16 ──► #17
                             │          │
                             └─► #15 ───┘
```

After `#12` lands, the three follow-ups — `#13` (`cancel_flight`), `#14` (`get_airport_status`), `#15` (`analyze_bottleneck`) — can progress in parallel. `#16` is the convergence point: all three must be done before determinism and the Inspector driver can finish the full verification. `#14` blocks on `#12` (not just `#11`) because the `constraints.dependency_blocking` flag requires the `dependency_*` reason taxonomy that `#12` introduces.

## Per-slice checklist

### Slice 1 — Scaffold + `Config` + `reset_state` + stdio bootstrap · [#9](https://github.com/Altmerian/ai-challenge-vention/issues/9)

- [ ] TypeScript strict project (Node ≥ 20 LTS) with `@modelcontextprotocol/sdk`, `zod`, `vitest`, `tsc` → `dist/`
- [ ] `Config.parseFromEnv` parses all 12 `ATC_*` variables, collects every error, no partial-success state
- [ ] Bootstrap exits non-zero on bad config and prints **all** errors at once
- [ ] `AirportState` exposes `addFlight`, `cancelFlight`, `replaceSchedule`, `reset`; `reset()` sets `submission_index = 0`
- [ ] Tool catalogue lists exactly `reset_state` at this stage
- [ ] Server runs over `StdioServerTransport`; survives an `mcp-inspector --cli` session
- [ ] Unit tests for `Config`: missing var, non-integer, out-of-range, invalid IANA tz, multi-error collection
- [ ] Integration test (vitest + `InMemoryTransport`): start → list tools → call `reset_state`

### Slice 2 — `submit_flight` + `atc://queue` · [#10](https://github.com/Altmerian/ai-challenge-vention/issues/10)

- [ ] `submit_flight` validates input via `zod`, returns `{ accepted: true, flight_number, submission_index }`
- [ ] Duplicate `flight_number` rejected — including against `cancelled` flights (uniqueness forever)
- [ ] Self-dependency rejected at submission with reason `self_dependency`
- [ ] Forward references (depending on a not-yet-submitted predecessor) accepted as-is (ADR-0004)
- [ ] `ErrorEnvelope` collects multiple validation issues into one envelope (test with ≥2 violations)
- [ ] `atc://queue` returns `{ flights: QueueEntry[] }` in submission order; reads do **not** recompute
- [ ] `reset_state` returns non-zero `flights_removed_count` after submissions; next `submission_index` is 0
- [ ] Integration tests: success, duplicate, self-dep, forward-ref, queue shape, multi-error envelope

### Slice 3 — `generate_schedule` MVP + `atc://runways` + `atc://timeline` + `TimezoneFormatter` + Morning Rush · [#11](https://github.com/Altmerian/ai-challenge-vention/issues/11)

- [ ] `Scheduler` is pure `(queue, config) → ScheduleSnapshot`; no I/O, no clock, no env access
- [ ] Independent flights placed earliest-feasibly across compatible runways and any gate, with one crew unit
- [ ] Runway compatibility = `min_runway_length_m ≤ runway.length_m` (only rule); gates are uniform
- [ ] Separation buffers (takeoff / landing / mixed) + `Gate Turnaround` + `ATC_MAX_HORIZON_MIN` respected
- [ ] Contested ordering = (priority desc, submission_index asc); no displacement, no inheritance
- [ ] Unscheduled reasons exercised: `no_compatible_runway`, `horizon_exceeded`
- [ ] `Completion Time` = gate release (arrivals) / runway release (departures); matches `end_offset_min` on each entry
- [ ] `TimezoneFormatter` validates IANA tz; invalid → error envelope, **not** silent UTC fallback
- [ ] `ScheduleEntry` carries integer-minute offsets, ISO-8601 in client tz, **and** explicit `runway_window` + `gate_window` per the PRD derivation rules (arrivals use runway then gate; departures use gate then runway)
- [ ] `schedule_start_at` is **UTC** (per ADR-0002) — per-entry `start_at` / `end_at` are the client-tz render
- [ ] `atc://runways` exposes `busy_minutes` **including trailing separation buffer**, plus `available_windows` and `next_available_at_offset_min` so clients can see availability, not only usage
- [ ] `atc://timeline` flat chronological, sorted by `(start_offset_min, flight_number)`
- [ ] Runway IDs auto-assigned `RWY-1…`; gate IDs auto-assigned `GATE-1…` by env-var position
- [ ] Unit tests for `Scheduler`: single arrival, contested priority, no-compat runway, horizon exceeded, gate turnaround, separation buffer (each variant)
- [ ] Unit tests for `TimezoneFormatter`: non-UTC zone, DST window, invalid IANA throws
- [ ] **Morning Rush** brief scenario passes via `InMemoryTransport` and Inspector CLI walkthrough

### Slice 4 — Dependencies in `Scheduler` + Connecting Flight · [#12](https://github.com/Altmerian/ai-challenge-vention/issues/12)

- [ ] `Scheduler` builds dependency DAG, detects cycles, runs ready-heap loop, cascades failures
- [ ] Missing predecessor at scheduling time → dependent `unscheduled` with reason `dependency_missing` + `blocking_flight_number` (ADR-0004); does not block unrelated flights
- [ ] Cycle → every member `unscheduled` with reason `dependency_cycle`; `detail` names cycle members
- [ ] Unscheduled predecessor → descendants `unscheduled` with reason `dependency_unscheduled` + `blocking_flight_number`
- [ ] Dependency buffer: `dependent.start ≥ max(predecessor.end) + ATC_DEPENDENCY_BUFFER_MIN`
- [ ] `ScheduleEntry.predecessors` populated; `atc://queue` exposes `blocking_flight_number` for `dependency_*` reasons
- [ ] No priority inheritance — low dependent of a high predecessor stays low (assert via test)
- [ ] No displacement of placed flights (assert via test)
- [ ] Unit tests: 2-chain, 3-chain, cycle, forward-ref, `dependency_missing`, `dependency_unscheduled` cascade, multi-predecessor (later end + buffer)
- [ ] **Connecting Flight** brief scenario passes via `InMemoryTransport` and Inspector CLI walkthrough

### Slice 5 — `cancel_flight` with auto-regen cascade · [#13](https://github.com/Altmerian/ai-challenge-vention/issues/13)

- [ ] `cancel_flight({ flight_number, timezone? })` returns `{ cancelled: true, flight_number, schedule }`
- [ ] Transitions `submitted` / `scheduled` / `unscheduled` → `cancelled` (terminal); re-cancel is idempotent
- [ ] Cancelling unknown `flight_number` returns an `isError` envelope
- [ ] `AirportState.cancelFlight` invokes `Scheduler` and replaces the schedule **before** returning
- [ ] Direct + transitive dependents come back `unscheduled` with reason `dependency_cancelled` + `blocking_flight_number`
- [ ] **Narrow stability invariant:** cancelling a flight that has no dependents *and* whose runway/gate slot is uncontested (no waiting flight in the queue could claim it) leaves all other offsets byte-identical. Asserted via a deliberately uncontested fixture; the wider claim ("any cancel leaves unrelated flights stable") is **not** an invariant of greedy scheduling and is not tested.
- [ ] Re-submitting a cancelled `flight_number` is still rejected
- [ ] Unit tests: cancel `submitted`, cancel scheduled leaf (uncontested → stability holds), single-dependent cascade, transitive cascade, idempotency, unknown error, narrow stability fixture
- [ ] Integration test: full submit → schedule → cancel cascade in one round-trip
- [ ] Inspector CLI verification: "cancel A re-evaluates B to `dependency_cancelled` without explicit `generate_schedule`"

### Slice 6 — `get_airport_status` + Heavy Hauler · [#14](https://github.com/Altmerian/ai-challenge-vention/issues/14)

- [ ] `get_airport_status` returns the PRD `AirportStatus` shape **exactly** — no extras (no saturation, no ground_crew in resources, no convenience totals)
- [ ] `flights.by_state` / `flights.by_operation` counts correct
- [ ] `resources.runways[]` includes `busy_minutes` with trailing separation buffer; `resources.gates[]` analogous
- [ ] `constraints.runway_blocking` ⇔ any blocked flight has reason `no_compatible_runway`
- [ ] `constraints.horizon_blocking` ⇔ any has reason `horizon_exceeded`
- [ ] `constraints.dependency_blocking` ⇔ any has a `dependency_*` reason
- [ ] `constraints.any_blocked` = OR of the three
- [ ] `blocked_flights` mirrors current schedule's `unscheduled` entries
- [ ] `schedule_completion` is `null` iff `generate_schedule` has never run in this process. An all-unscheduled pass returns `{ schedule_start_at, makespan_min: 0, completion_at: schedule_start_at }` — **not** `null`.
- [ ] `schedule_start_at` / `completion_at` are UTC ISO-8601 instants (per ADR-0002); client-tz rendering happens via `start_at` / `end_at` on `ScheduleEntry`, not here
- [ ] Status read does not recompute (assert offsets byte-identical across repeated calls)
- [ ] Unit tests: empty queue, post-submission pre-schedule, mixed scheduled/unscheduled, `busy_minutes` math, each `constraints` boolean flip
- [ ] **Heavy Hauler** brief scenario passes via `InMemoryTransport` and Inspector CLI walkthrough

### Slice 7 — `analyze_bottleneck` (CPM critical path) · [#15](https://github.com/Altmerian/ai-challenge-vention/issues/15)

- [ ] `BottleneckAnalyzer` is pure `(schedule, queue) → BottleneckReport`
- [ ] Longest path by **elapsed minutes** (`last.end − first.start`), not by node count (ADR-0003)
- [ ] One-node chains do not count → `bottleneck_exists: false` with `note` when no scheduled inter-deps
- [ ] Cancelled / unscheduled flights excluded from the DAG
- [ ] Tiebreakers in order: elapsed → node count → earliest first-flight start → lex `flight_number` sequence
- [ ] `chain` ordered first → last; matches `ScheduleEntry` shape
- [ ] `cumulative_operation_min` = sum of per-node durations; `cumulative_wait_min = total_elapsed − cumulative_operation` (folds in dependency-buffer **and** resource-contention gaps — see PRD note)
- [ ] `start_at` / `end_at` rendered via `TimezoneFormatter` when chain exists; omitted otherwise
- [ ] Deterministic: re-run on same schedule yields byte-identical report
- [ ] Unit tests: empty queue, no scheduled deps, 2-chain, 3-chain, tiebreak by node count + start + lex, wait-dominated chain (`cumulative_wait_min > 0`), subtree with unscheduled predecessor excluded
- [ ] Integration test: A→B with large gate turnaround → `bottleneck_exists: true`, `chain_length: 2`, wait math matches
- [ ] Inspector CLI verification of the bottleneck assertion

### Slice 8 — Determinism + extra scenarios + Inspector verification · [#16](https://github.com/Altmerian/ai-challenge-vention/issues/16)

- [ ] Determinism harness compares `start_offset_min` / `end_offset_min` / `runway_id` / `gate_id` / `unscheduled[*].reason` across runs; wall-clock fields excluded
- [ ] Ten extra scenario tests via `InMemoryTransport`:
  1. Dependency cycle (`A→B→A`)
  2. Forward reference resolved (`B` submitted before `A`)
  3. Forward reference unresolved (`dependency_missing` with `blocking_flight_number`)
  4. Cancellation cascade through `A→B→C` without explicit `generate_schedule`
  5. Reset state — counts, empty queue, next `submission_index` is 0
  6. Duplicate flight number after cancel — uniqueness holds across `cancelled`
  7. Self-dependency rejected at submission
  8. Heavy Hauler with valid mix — utilization non-zero, `runway_blocking: true`
  9. Bottleneck trivial — `bottleneck_exists: false`
  10. Bottleneck 3-chain — `chain_length: 3`, buffer math, elapsed = `C.end − A.start`
- [ ] Inspector CLI driver (`npm run verify:inspector`) issues protocol checks + 3 brief scenarios + additional verifications from `AGENTS.md` "What to verify via Inspector"; exits non-zero on any failed assertion
- [ ] Driver verifies the **exact** tool catalogue and resource catalogue (no extras, none missing)
- [ ] Driver verifies each tool's input schema rejects at least one malformed input
- [ ] Single command (`npm test` or equivalent) runs unit + integration + Inspector driver; CI is green
- [ ] No partial verification — any failure means fix and re-run the full set

### Slice 9 — `README.md` + `report.md` · [#17](https://github.com/Altmerian/ai-challenge-vention/issues/17)

- [ ] `README.md` contains **only**: one-paragraph description, install + build commands + Node version, full env-var table (required/optional, type, default, validation, example), run command + MCP-client connection (Claude Desktop config + Inspector CLI), tool reference (6 tools) + resource reference (3 resources). No design rationale, no glossary, no internal vocabulary.
- [ ] `report.md` covers: short intro (points to `README.md` for usage), scheduling-approach summary in plain language, tooling, what worked, what didn't / out-of-scope, links to `PRD.md` / `CONTEXT.md` / `docs/adr/` / `AGENTS.md` as canonical agent artefacts.
- [ ] No design rationale leaks into `README.md` (manual re-read check).
- [ ] All cross-links between `README.md`, `report.md`, `PRD.md`, `CONTEXT.md`, `AGENTS.md`, ADRs render and follow.
- [ ] README env-var table matches `Config` validators exactly (no drift) — derive from shared constants or assert with a test.
- [ ] No AI-assistant signature lines in either file.

## Cross-slice lessons worth keeping

_Populated as slices land. Anything that survived from slice to slice and is useful to someone extending the server later goes here — pitfalls of the MCP SDK, zod schema gotchas, deterministic-time test patterns, etc. Check and remove stale entries after each slice closes._

## Sync convention

This file mirrors live GitHub issue state during the build. Update the **Status** column when a slice's GH issue closes; tick the per-slice checkboxes as acceptance criteria are met. After all slices close, the file freezes — further changes should be code/docs edits, not status edits.
