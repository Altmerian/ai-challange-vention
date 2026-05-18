# Forward-reference dependencies are allowed; unknown predecessors fail at schedule time, not submission time

`submit_flight` accepts a `dependencies` list naming flight numbers that may not yet exist in the queue. The dependency is recorded as-is; resolution happens during the next **Scheduling Pass**. If the predecessor is still unknown at scheduling time, the dependent flight is marked `unscheduled` with reason `dependency_missing` (and the unknown flight number in `detail`), but its presence in the queue does not block any other flight. Self-references are the one exception — they are rejected at submission with reason `self_dependency`, because self-cycles are the only cycle cheap enough to detect without the full DAG.

## Why

The alternative — rejecting submissions naming an unknown predecessor — forces users to topologically sort their submissions, which is hostile to the natural "wire up a multi-leg journey" workflow where the user has all the flight numbers but submits them in an arbitrary order. Lazy resolution at scheduling time lets the user submit in any order and lets the scheduler diagnose whether the chain ever resolves. The `dependency_missing` reason makes the failure visible at the same level as other unscheduled reasons.

## Consequences

The queue may legitimately contain flights whose dependencies will never resolve (typo in flight number, predecessor never submitted). These appear in `atc://queue` with state `unscheduled` and reason `dependency_missing` — the user must explicitly `cancel_flight` them if they want them out of the queue. The system never auto-prunes orphans. The reason taxonomy is large (six entries) precisely so each failure mode is reported with full fidelity.
