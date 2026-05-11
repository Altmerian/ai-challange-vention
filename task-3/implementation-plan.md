# Task 3 — Implementation Plan

Tracer-bullet vertical slices for the n8n + Telegram learning-assistant bot. Status checkboxes mirror GitHub issue state — sync by checking the linked issue.

Repo: [Altmerian/ai-challenge-vention](https://github.com/Altmerian/ai-challenge-vention)

## Status overview

| # | Slice | Type | Blocked by | GH Issue | Status |
|---|---|---|---|---|---|
| 1 | Workflow skeleton + `/start` + lib scaffolding | AFK | — | [#1](https://github.com/Altmerian/ai-challenge-vention/issues/1) | - [ ] |
| 2 | `/learn` happy path with Teacher summarization | AFK | #1 | [#2](https://github.com/Altmerian/ai-challenge-vention/issues/2) | - [ ] |
| 3 | `/learn` user-visible error handling | AFK | #2 | [#3](https://github.com/Altmerian/ai-challenge-vention/issues/3) | - [ ] |
| 4 | `/quiz` topic picker with pagination | AFK | #2 | [#4](https://github.com/Altmerian/ai-challenge-vention/issues/4) | - [ ] |
| 5 | Examiner Quiz + Q1→Q5 run-through + results card | AFK | #4 | [#5](https://github.com/Altmerian/ai-challenge-vention/issues/5) | - [ ] |
| 6 | Resume-or-restart for in-progress Quiz | AFK | #5 | [#6](https://github.com/Altmerian/ai-challenge-vention/issues/6) | - [ ] |
| 7 | Submission artifacts + live-bot demo | HITL | #6 | [#7](https://github.com/Altmerian/ai-challenge-vention/issues/7) | - [ ] |

## Dependency graph

```
#1 ──► #2 ──► #3
        │
        └───► #4 ──► #5 ──► #6 ──► #7
```

- `#3` and `#4` are independent once `#2` lands — they can run in parallel.
- Everything else is strictly linear.

## Delivery map

Each cell marks what materialises in that slice. `M` = module + tests under `task-3/lib/`. `E` = end-to-end user-visible behaviour. `D` = Data Table mutation. `J` = workflow JSON branch wired.

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
| Final exported JSON + README + demo | — | — | — | — | — | — | E |
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

- [ ] `task-3/workflow.json` imports cleanly into n8n
- [ ] Switch router has branches for `/start`, `/learn`, `/quiz`, `qa:`, `rs:`, `tp:`, `tpp:`, `qstart:`
- [ ] `/start` reply matches PRD help-text exactly
- [ ] Both Data Tables created with PRD-spec columns
- [ ] `task-3/lib/` scaffolded with Vitest + `htmlEscape` module + tests
- [ ] No bot token in workflow JSON

### Slice 2 — `/learn` happy path · [#2](https://github.com/Altmerian/ai-challenge-vention/issues/2)

- [ ] Jina Reader fetch + Teacher AI call works on a real URL
- [ ] `materials` row inserted with normalized URL
- [ ] URL dedup returns cached Summary, no new row, no AI call
- [ ] Summary renders with difficulty badge + "Quiz me now" inline button
- [ ] Dynamic fields HTML-escaped (`List<T>`, `a < b && c > d` test cases)
- [ ] `urlNormalizer`, `teacherOutputParser`, `summaryRenderer` tests pass

### Slice 3 — `/learn` error handling · [#3](https://github.com/Altmerian/ai-challenge-vention/issues/3)

- [ ] `/learn` with no arg → exact #1 message
- [ ] `/learn not-a-url` → exact #1/#2 message
- [ ] Jina 4xx → exact #3 message
- [ ] Jina 5xx/timeout → exact #4 message
- [ ] Page < 500 chars → exact #5 message
- [ ] Page > 30k tokens → silent head-truncate, Summary still renders
- [ ] Teacher bad-JSON retries once, then errors with #7 message
- [ ] No orphan `materials` row on any failure path

### Slice 4 — `/quiz` topic picker · [#4](https://github.com/Altmerian/ai-challenge-vention/issues/4)

- [ ] Empty state when no materials
- [ ] One inline button per row, `{emoji} {title}`
- [ ] Sort by `added_date DESC`
- [ ] Pagination footer only when >8 materials
- [ ] Prev/Next edits picker in place (no duplicate messages)
- [ ] `tp:` callback acknowledged via toast
- [ ] `callbackCodec`, `topicPickerBuilder` tests pass

### Slice 5 — Quiz generation + Q1→Q5 + results · [#5](https://github.com/Altmerian/ai-challenge-vention/issues/5)

- [ ] Material pick → Q1 with A/B/C/D inline keyboard
- [ ] "Quiz me now" button works
- [ ] Tap → previous keyboard removed, targeted feedback, next question
- [ ] After Q5 → final results card with score % + per-Q breakdown
- [ ] Duplicate-tap suppressed via CAS-on-update (stale toast only)
- [ ] Examiner bad-JSON retries once, no orphan `quizzes` row on failure
- [ ] `examinerOutputParser`, `quizQuestionRenderer`, `quizFeedbackRenderer`, `quizResultRenderer` tests pass

### Slice 6 — Resume-or-restart · [#6](https://github.com/Altmerian/ai-challenge-vention/issues/6)

- [ ] Pick of Material with in-progress Quiz → prompt with Resume / Start fresh
- [ ] Resume → continues from saved `current_index`
- [ ] Start fresh → deletes old row, generates new Quiz
- [ ] Stale `qa:` from deleted Quiz → stale-tap toast (no corruption)
- [ ] Cross-Material independence verified (Material B unaffected by Material A's in-progress row)

### Slice 7 — Submission artifacts + demo · [#7](https://github.com/Altmerian/ai-challenge-vention/issues/7)

- [ ] `workflow.json` validates clean via n8n MCP `validate_workflow`
- [ ] `README.md` has step-by-step usage guide
- [ ] `report.md` polished against actual build
- [ ] Live-bot demo on `t.me/<TG_BOT_USERNAME>` runs all 6 scenarios cleanly
- [ ] All `task-3/lib/` tests pass on final commit
- [ ] Repo public; `task-3/` folder contains all submission artifacts

## Sync convention

When a GitHub issue closes, tick its row in the **Status overview** table and check off every box in its **per-slice checklist** section. The sync is one-directional (GitHub is source of truth); this file is the local glanceable view.
