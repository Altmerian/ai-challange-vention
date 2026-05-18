# Bottleneck = longest path by elapsed minutes (CPM critical path)

`analyze_bottleneck` returns the dependency chain through `scheduled` flights that maximises `last.end_offset_min − first.start_offset_min` (elapsed wall-clock minutes). It is **not** the chain with the most nodes. Tiebreakers in order: elapsed minutes, then node count, then earliest first-flight start, then lexicographic flight-number sequence. A one-node "chain" is not a chain — schedules with no dependency edges between scheduled flights report `bottleneck_exists: false`.

## Why

The brief's phrase "longest active scheduled dependency chain ... accounting for operation durations and required dependency buffers" is ambiguous between two readings:

1. **Longest by elapsed minutes** — the chain whose first-flight-start to last-flight-end span is largest. Naturally includes both operation durations and dependency buffers (the buffers manifest as gaps between predecessor end and dependent start in the placed schedule).
2. **Longest by node count** — the chain with the most flights in it.

We chose (1) because a 5-flight chain of 2-minute operations is not the same kind of bottleneck as a 2-flight chain straddling a 4-hour buffer. The "drives the total schedule duration" phrase in the brief points squarely at elapsed time, not flight count. This is the standard Critical Path Method semantics from project scheduling literature.

## Consequences

Determinism is preserved across passes because every tiebreaker is a total order. The output exposes both `cumulative_operation_min` and `cumulative_buffer_min` so the AI agent can reason about whether the bottleneck is driven by operation time or by waiting.
