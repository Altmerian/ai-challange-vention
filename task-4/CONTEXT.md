# Air Traffic Control MCP Server

The domain context for a Model Context Protocol server that schedules arrivals and departures across a finite set of airport resources and exposes that schedule to MCP clients.

## Language

**Flight**:
One atomic airport **Operation** — either an **Arrival** or a **Departure** — identified by a flight number.
_Avoid_: aircraft, plane, leg.

**Operation**:
Synonym for **Flight** when emphasizing the scheduling-unit aspect.
_Avoid_: movement, slot.

**Arrival**:
A **Flight** whose lifecycle is: land on a **Runway** → release runway → claim a **Gate** + **Ground Crew** for the **Gate Turnaround** window → release.
_Avoid_: inbound (only as adjective in dependency narratives).

**Departure**:
A **Flight** whose lifecycle is: claim a **Gate** + **Ground Crew** for the **Gate Turnaround** window → release gate → take off from a **Runway** → release.
_Avoid_: outbound (only as adjective).

**Runway**:
A capacity-1 resource with a single configured attribute, `length_m`, that holds one **Flight** for its landing or takeoff duration plus a trailing **Separation Buffer** before the next flight may claim it.

**Gate**:
A capacity-1 resource (uniform — no attributes, no per-flight gate requirements) that holds one **Flight** for the **Gate Turnaround** window.

**Runway Requirement**:
An optional per-**Flight** value `min_length_m`. The flight is compatible only with **Runways** whose `length_m ≥ min_length_m`. Implicitly encodes aircraft weight: heavier flights specify a higher `min_length_m`. Absent means no length constraint.

**Ground Crew**:
A pooled resource of N interchangeable units; one unit is held alongside the **Gate** for the full **Gate Turnaround** window.

**Gate Turnaround**:
The configured duration a **Gate** (and a **Ground Crew** unit) is occupied per **Flight**. Same value for **Arrival** parking and **Departure** boarding.

**Separation Buffer**:
The minimum gap on the same **Runway** between two consecutive operations, parameterized by the (prev, next) operation-type pair: `takeoff`, `landing`, or `mixed`.

**Dependency Buffer**:
The minimum gap between a **Predecessor** flight's completion and its **Dependent** flight's start.

**Predecessor / Dependent**:
A **Dependency** is an edge from a **Dependent** flight to its **Predecessor** flight. The **Dependent** cannot start until the **Predecessor** has completed plus the **Dependency Buffer**. Standard CPM scheduling vocabulary.
_Avoid_: parent flight, source flight.

**Completion Time** (of a Flight):
For an **Arrival**, the moment its **Gate** is released. For a **Departure**, the moment its **Runway** is released (wheels-up). Used as the anchor for dependents.

**Start Time** (of a Flight):
For an **Arrival**, runway touchdown. For a **Departure**, the moment its **Gate** is first claimed (start of boarding).

**Landing Duration / Takeoff Duration**:
Configured constants for how long an **Arrival** holds a **Runway** for landing and how long a **Departure** holds it for takeoff. Not per-flight.

**Schedule Start**:
The wall-clock moment a `generate_schedule` call begins computing, captured as a UTC ISO-8601 timestamp truncated to minute precision. All operation timestamps are expressed as integer-minute offsets from this anchor, and externally also as absolute timestamps derived from it.
_Avoid_: epoch, t-zero (only as informal shorthand).

**Time Unit**:
The minute. Every duration, buffer, horizon, and offset stored in the schedule is a non-negative integer count of minutes. Sub-minute precision is not represented.

**Submission Index**:
A monotonically increasing integer assigned by the server to each submitted **Flight** in arrival order. Used as the deterministic tiebreaker when all other scheduling criteria are equal.

**Scheduling Horizon**:
A configured upper bound (in minutes) on any operation's end offset. A **Flight** whose earliest feasible end exceeds the horizon becomes **Unscheduled** with reason `horizon_exceeded` and remains visible.

**Client Timezone**:
An IANA timezone name (e.g. `Europe/Warsaw`) optionally supplied per tool call to format `start_at` / `end_at` strings in client-local time. Internally the schedule is timezone-free (UTC + minute offsets); the client timezone is presentation only. Falls back to a single configured default when not supplied.

**Priority**:
A discrete level on a **Flight**: `high`, `medium`, or `low`, with a strict total order `high > medium > low`. Drives the order in which ready flights are placed by the scheduler. Not numeric; not inherited along **Dependency** edges; does not cause displacement of already-placed flights.

**Ready Flight**:
A non-cancelled **Flight** whose every **Predecessor** has already been placed (or which has no predecessors) during a `generate_schedule` pass.

**Scheduling Pass**:
The single invocation of `generate_schedule` that replaces the current schedule. Algorithm: while any **Ready Flight** exists, pick the one with `(priority desc, submission_index asc)`, place it in its earliest feasible `(start, end)` window across all compatible runways and any gate, mark its dependents as candidates for the next iteration. Resource selection picks the assignment that yields the earliest feasible start, tiebreaking by lowest runway index then lowest gate index.

**Unscheduled (state)**:
A **Flight** the most recent **Scheduling Pass** could not place. Carries a reason from a fixed taxonomy: `no_compatible_runway`, `horizon_exceeded`, `dependency_cycle`, `dependency_missing`, `dependency_cancelled`, `dependency_unscheduled` (each pointing at the offending flight number where applicable).

**Dependency Edge**:
A directed edge from a **Dependent Flight** to one of its **Predecessor Flights**. A flight may have zero or more predecessors. Forward references are permitted: it is legal to `submit_flight` a dependent before its predecessor exists. Self-references are rejected at submission. Duplicate edges to the same predecessor are silently deduplicated. Dependency direction in the API: the `dependencies` list on a flight names *its* predecessors.

**Bottleneck Chain**:
The longest path through the **Dependency Edge** subgraph restricted to `scheduled` **Flights**, measured in elapsed minutes (`last.end_offset_min − first.start_offset_min`). Computed by `analyze_bottleneck`. Tiebreakers: elapsed minutes → node count → earliest start offset → lexicographic flight-number sequence. A one-node path is not a chain. A schedule with no qualifying chain reports `bottleneck_exists: false`.

**Flight Queue**:
The durable list of every **Flight** ever submitted to the server, including those in `cancelled` state. Mutated only by `submit_flight` (append), `cancel_flight` (transition to `cancelled`), and `reset_state` (clear entirely). Independent of any **Schedule**.

**Reset**:
Wiping the in-memory state — flight queue, current schedule, and submission-index counter — without touching configuration. Performed by the `reset_state` MCP tool. The only alternative way to reach a clean state is restarting the server process, which is also the only way to change configuration.

**Schedule**:
A derived snapshot of placements (or `unscheduled` reasons) for every non-cancelled **Flight** in the **Flight Queue** at the moment a **Scheduling Pass** ran. Fully replaced on each pass — never patched in place.

**Flight State**:
One of `submitted` (in queue, no pass has touched it yet), `scheduled` (placed by the most recent pass), `unscheduled` (most recent pass could not place; carries a reason), or `cancelled` (user-cancelled, terminal, excluded from future passes). There is no `completed` state — the system does not simulate execution.

**Cancellation**:
A queue mutation that flips a **Flight** to `cancelled` (terminal, idempotent) and immediately triggers a fresh **Scheduling Pass** so dependents are re-evaluated. Cancelling an unknown flight number is an error.

**Flight Number Uniqueness**:
A flight number is unique forever in a server's lifetime. Resubmitting an existing flight number — including one in `cancelled` state — is an error. No update or resurrection semantics.

## Relationships

- A **Flight** is either an **Arrival** or a **Departure** — never both.
- Every **Flight** uses exactly one **Runway** and exactly one **Gate** and one **Ground Crew** unit over its lifecycle.
- An **Arrival** uses its **Runway** before its **Gate**; a **Departure** uses its **Gate** before its **Runway**.
- A **Dependency** links a **Dependent Flight** to its **Predecessor Flight**: `dependent.start ≥ predecessor.completion + dependency_buffer`.

## Example dialogue

> **Dev:** "If an inbound **Arrival** lands at 09:00 and its gate is released at 09:30, when can the connecting outbound **Departure** start boarding?"
> **Domain expert:** "Add the **Dependency Buffer**. If that's 15 minutes, the **Departure**'s **Start Time** — gate claim — must be ≥ 09:45. Wheels-up follows the **Gate Turnaround** plus takeoff duration."

## Flagged ambiguities

_(none yet)_
