# Task 3 — Implementation Plan

Tracer-bullet vertical slices for the n8n + Telegram learning-assistant bot. Implementation is complete; this file is the glanceable history of how the slices stacked up.

Repo: [Altmerian/ai-challenge-vention](https://github.com/Altmerian/ai-challenge-vention)

## Status overview

| # | Slice | Type | Blocked by | GH Issue | Status |
|---|---|---|---|---|---|
| 1 | Workflow skeleton + `/start` + lib scaffolding | AFK | — | [#1](https://github.com/Altmerian/ai-challenge-vention/issues/1) | - [x] |
| 2 | `/learn` happy path with Teacher summarization | AFK | #1 | [#2](https://github.com/Altmerian/ai-challenge-vention/issues/2) | - [x] |
| 3 | `/learn` user-visible error handling | AFK | #2 | [#3](https://github.com/Altmerian/ai-challenge-vention/issues/3) | - [x] |
| 4 | `/quiz` topic picker with pagination | AFK | #2 | [#4](https://github.com/Altmerian/ai-challenge-vention/issues/4) | - [x] |
| 5 | Examiner Quiz + Q1→Q5 run-through + results card | AFK | #4 | [#5](https://github.com/Altmerian/ai-challenge-vention/issues/5) | - [x] |
| 6 | Resume-or-restart for in-progress Quiz | AFK | #5 | [#6](https://github.com/Altmerian/ai-challenge-vention/issues/6) | - [x] |
| 7 | Submission artifacts + agent-driven demo | AFK | #6 | [#7](https://github.com/Altmerian/ai-challenge-vention/issues/7) | - [x] |

## Dependency graph

```
#1 ──► #2 ──► #3
        │
        └───► #4 ──► #5 ──► #6 ──► #7
```

`#3` and `#4` are independent once `#2` lands. Everything else is linear.

## Delivery map

`M` = module + tests under `task-3/lib/`. `E` = end-to-end user-visible behaviour. `D` = Data Table mutation. `J` = workflow JSON branch wired.

| Capability | #1 | #2 | #3 | #4 | #5 | #6 | #7 |
|---|---|---|---|---|---|---|---|
| n8n workflow file + Switch router | J | J | J | J | J | J | J |
| Data Tables (`materials`, `quizzes`) | D | D | — | — | D | D | — |
| `/start` reply | E | — | — | — | — | — | — |
| `/learn` happy path | — | E | — | — | — | — | — |
| `/learn` error messages | — | — | E | — | — | — | — |
| `/quiz` picker + pagination | — | — | — | E | — | — | — |
| Quiz generation + answer loop + results | — | — | — | — | E | — | — |
| Resume-or-restart prompt | — | — | — | — | — | E | — |
| Post-quiz "What's next?" menu + final artifacts + demo | — | — | — | — | — | — | E |
| `htmlEscape` | M | — | — | — | — | — | — |
| `urlNormalizer` | — | M | — | — | — | — | — |
| `teacherOutputParser` | — | M | — | — | — | — | — |
| `summaryRenderer` | — | M | — | — | — | — | — |
| `shortIdMinter` | — | M | — | — | — | — | — |
| `callbackCodec` | — | — | — | M | — | — | — |
| `topicPickerBuilder` | — | — | — | M | — | — | — |
| `examinerOutputParser` | — | — | — | — | M | — | — |
| `quizQuestionRenderer` | — | — | — | — | M | — | — |
| `quizFeedbackRenderer` | — | — | — | — | M | — | — |
| `quizResultRenderer` | — | — | — | — | M | — | — |

## Per-slice checklist

### Slice 1 — Workflow skeleton + `/start` + lib scaffolding · [#1](https://github.com/Altmerian/ai-challenge-vention/issues/1)

- [x] `task-3/workflow.json` imports cleanly into n8n
- [x] Switch router has branches for `/start`, `/learn`, `/quiz`, `qa:`, `rs:`, `tp:`, `tpp:`, `qstart:`
- [x] `/start` reply matches PRD help-text exactly (`appendAttribution: false` keeps the n8n footer off)
- [x] Both Data Tables created with PRD-spec columns
- [x] `task-3/lib/` scaffolded with Vitest + `htmlEscape` module + tests
- [x] No bot token in workflow JSON (token lives in an n8n credential)

### Slice 2 — `/learn` happy path · [#2](https://github.com/Altmerian/ai-challenge-vention/issues/2)

- [x] Jina Reader fetch + Teacher AI call works on a real URL
- [x] `materials` row inserted with normalized URL
- [x] URL dedup returns cached Summary, no new row, no AI call
- [x] Summary renders with difficulty badge + "Quiz me now" inline button
- [x] Dynamic fields HTML-escaped (`List<T>`, `a < b && c > d` test cases)
- [x] `urlNormalizer`, `teacherOutputParser`, `summaryRenderer` tests pass

### Slice 3 — `/learn` error handling · [#3](https://github.com/Altmerian/ai-challenge-vention/issues/3)

- [x] `/learn` with no arg → exact PRD #1 message
- [x] `/learn not-a-url` → exact PRD #1/#2 message
- [x] Jina 4xx → exact PRD #3 message
- [x] Jina 5xx/timeout → exact PRD #4 message
- [x] Page < 500 chars → exact PRD #5 message
- [x] Page > 30k tokens → silent head-truncate, Summary still renders
- [x] Teacher bad-JSON retries once, then errors with PRD #7 message
- [x] No orphan `materials` row on any failure path

### Slice 4 — `/quiz` topic picker · [#4](https://github.com/Altmerian/ai-challenge-vention/issues/4)

- [x] Empty state when no materials (separate sendMessage, no keyboard)
- [⚠] One inline button per row, `{emoji} {title}` — **diverged**: numbered 2×4 grid + body labels. Platform-induced (n8n Telegram node v1.2 cannot accept dynamic-length inline keyboards).
- [x] Sort by `added_date DESC`
- [⚠] Pagination footer only when >8 materials — **diverged**: pagination row always present (static 3-row keyboard with invisible-blank placeholders + "Page 1/1").
- [x] Prev/Next edits picker in place via `editMessageText`
- [x] `tp:` callback acknowledged via toast
- [x] `callbackCodec` + `topicPickerBuilder` tests pass

### Slice 5 — Quiz generation + Q1→Q5 + results · [#5](https://github.com/Altmerian/ai-challenge-vention/issues/5)

- [x] Material pick → Q1 with A/B/C/D inline keyboard
- [x] "Quiz me now" button works (`qstart:` → same `qgen:` converge point as `tp:`)
- [x] Tap → previous keyboard removed via `editMessageText`, targeted feedback, next question
- [x] After Q5 → final results card with score % + per-Q breakdown
- [x] Duplicate-tap suppressed via pre-check on `(currentIndex, status)`
- [x] Examiner bad-JSON retries once, no orphan `quizzes` row on failure
- [x] All renderer + parser tests pass
- [x] CAS-on-create pre-insert zero-row guard closes the H-1 race

### Slice 6 — Resume-or-restart · [#6](https://github.com/Altmerian/ai-challenge-vention/issues/6)

- [x] Pick of Material with in-progress Quiz → prompt with Resume / Start fresh
- [x] Resume → continues from saved `current_index`
- [x] Start fresh → deletes old row, generates new Quiz
- [x] Stale `qa:` from deleted Quiz → stale-tap toast (no corruption)
- [x] Cross-Material independence — structurally guaranteed by per-`(chat_id, material_short_id)` active-session key
- [x] Adversarial review caught a stale-prompt destructive-tap bug; fixed by widening `rs:` callback to 4-segment (`rs:{materialShortId}:{quizId}:{r|n}`) so a mismatched `quiz_id` returns 0 rows and toasts silently
- [x] Three-layer race defense for Quiz creation: pre-Examiner check + pre-insert check + post-insert CAS read-back

### Slice 7 — Submission artifacts + agent-driven demo · [#7](https://github.com/Altmerian/ai-challenge-vention/issues/7)

- [x] Post-quiz "What's next?" menu fires after the results card (`qa: send next menu`)
- [x] `task-3/workflow.json` synced byte-level from the deployed workflow
- [x] `workflow.json` validates clean via n8n MCP `validate_workflow` (0 errors)
- [x] `task-3/README.md` has the usage walkthrough + fresh-import setup steps
- [x] `task-3/report.md` polished to a brief milestones-and-tools summary
- [x] Computer-use demo on Telegram desktop ran all 6 scenarios cleanly; screenshots in `task-3/docs/demo/`; cross-checked via `n8n_executions`
- [x] All `task-3/lib/` tests pass (139/139)
- [x] Repo public; `task-3/` contains `workflow.json`, `README.md`, `report.md`, `PRD.md`, `CONTEXT.md`, `docs/adr/`, `docs/demo/`, `lib/`

## Cross-slice lessons worth keeping

These are the patterns that survived from slice to slice and are likely useful to anyone extending this workflow:

- **Telegram parse mode is HTML throughout, with mandatory `htmlEscape` on every dynamic field.** Static markup (`<b>`, `<i>`) is interpolated raw. Truncation happens after escape, never before.
- **n8n Cloud Code-node sandbox has no `URL` constructor** — `lib/urlNormalizer.js` and inline parsers use regex.
- **n8n Telegram node v1.2 cannot accept dynamic-length inline keyboards.** Pre-declare a fixed grid and drive each cell's `text` / `callback_data` via expressions; use `⠀` (U+2800 Braille blank) for visually-invisible placeholders. A literal space renders as a visible empty button.
- **`$credentials.<field>` is NOT accessible from HTTP Request URL expressions** outside `ICredentialTestRequest`. Bot-API calls outside the native Telegram node need the token via `$vars`/`$env`, which n8n Cloud Starter doesn't expose. This is why keyboard removal uses `editMessageText` (not `editMessageReplyMarkup` via HTTP) and rebuilds the message body with a footer to give Telegram a text-delta.
- **Context does NOT survive Telegram sendMessage / DataTable update nodes.** Both output something different from their input (Bot API response, updated row). Downstream Code/Switch nodes must read context via `$('<canonical-source>').first().json._<key>` — never via `$json._<key>`.
- **DataTable `get` returns 0 items on no match → downstream is skipped.** When using a DataTable read as a precondition guard, set `alwaysOutputData: true` so the zero-match case still emits an item for the classifier.
- **Switch node `fallbackOutput` config must be `"extra"` + `renameFallbackOutput: "<label>"`** — never `fallbackOutput: "<label>"` directly. The wrong shape crashes the node on every fallback path.
- **Switches that route ok-vs-error via `main[1]` trigger a false-positive validator warning** ("missing `onError: 'continueErrorOutput'`"). Switches use multi-output for routing, not error catch. Ignore consistently.
- **Workflow-JSON portability.** The exported `task-3/workflow.json` is the byte-level deployed snapshot. A fresh n8n instance needs the Telegram credential, OpenAI credential, and two Data Tables created first, then re-selected on the affected nodes. See README §"Importing into your own n8n instance".

## Sync convention

This file used to mirror live GitHub issue state during the build. With all seven issues closed, it's frozen. Updates from here on should be code/docs changes, not status edits.
