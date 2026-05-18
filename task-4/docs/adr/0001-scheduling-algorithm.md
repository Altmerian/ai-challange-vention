# Greedy dependency-respecting scheduling with strict priority

A **Scheduling Pass** uses a greedy algorithm: build the dependency DAG, then in a loop pick the **Ready Flight** with the highest priority (tiebreaking by lowest `submission_index`), place it in its earliest feasible resource window, and continue until the ready-set is empty. Resource selection picks the assignment yielding the earliest feasible start, tiebreaking by lowest runway/gate index. The algorithm does no displacement (already-placed flights are never moved), no priority inheritance (a low-priority predecessor stays low even when blocking a high dependent), and no global optimisation. This is deliberately *not* an optimal scheduler.

## Why

The brief asks for *correct* and *priority-respecting* scheduling, never *optimal*. Greedy gives us deterministic output (provable from the strict ready-set tiebreak), trivial reasoning about edge cases, and a transparent execution model that an AI client can explain. The alternative — MILP / CP-SAT — would yield better makespan in contested scenarios but introduces a heavy dependency, makes determinism awkward (solver tie-breaking is implementation-defined), and obscures why a specific placement was chosen.

## Considered alternatives

- **CP-SAT (Google OR-Tools)** — optimal makespan, but heavyweight dependency and determinism requires careful seed/strategy pinning.
- **Priority inheritance up dependency chains** — convenient but surprising; users would have to mentally simulate inheritance to predict outcomes. Marking a chain `high` end-to-end is explicit and clear.
- **Displacement (a high-priority flight bumps a low)** — massively complicates the algorithm and the `generate_schedule` mental model; unscheduled-with-reason is the cleaner outcome.

## Consequences

A `high`-priority flight that can't fit gets reported `unscheduled` rather than displacing a lower-priority flight. Users surprised by this should re-read this ADR. Repeated `generate_schedule` calls with the same queue + config are byte-identical (modulo the `schedule_start_at` wall-clock anchor), which makes determinism testing trivial.
