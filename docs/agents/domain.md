# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **multi-context** workspace: each top-level task folder is its own context with its own domain language and ADRs. The root holds only system-wide decisions and a `CONTEXT-MAP.md` pointer (when one exists).

## Active contexts

| Context  | Path      | Status   |
| -------- | --------- | -------- |
| Task 1   | `task-1/` | **Complete — do not modify or extend domain docs here.** |
| Task 2   | `task-2/` | Active   |
| Task 3   | `task-3/` | Active   |
| Task 4   | `task-4/` | Active   |

When working in `task-N/`, treat that folder as the current context.

## Before exploring, read these

For the current task context (`task-N/`):

- **`task-N/CONTEXT.md`** — the context's glossary and domain language
- **`task-N/docs/adr/`** — ADRs scoped to this context

For cross-cutting work, also read:

- **`CONTEXT-MAP.md`** at the repo root (if it exists) — the index of all contexts
- **`docs/adr/`** at the repo root — system-wide decisions affecting multiple tasks

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md                ← lazy; created when ≥2 contexts have CONTEXT.md
├── docs/adr/                     ← system-wide decisions (lazy)
├── task-1/                       ← COMPLETE — do not extend
├── task-2/
│   ├── CONTEXT.md                ← lazy
│   └── docs/adr/                 ← lazy
├── task-3/
│   ├── CONTEXT.md                ← lazy
│   └── docs/adr/                 ← lazy
└── task-4/
    ├── CONTEXT.md                ← lazy
    └── docs/adr/                 ← lazy
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the **current task's** `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids, and don't borrow vocabulary from a different task's context.

If the concept you need isn't in the current context's glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR (in either the current task's `docs/adr/` or the root `docs/adr/`), surface it explicitly rather than silently overriding:

> _Contradicts `task-2/docs/adr/0003-…` — but worth reopening because…_
