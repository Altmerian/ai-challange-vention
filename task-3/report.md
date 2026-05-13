# Task 3 — "Workflowing with n8n" Submission Report

Live bot: [`t.me/AltmerLearningBot`](https://t.me/AltmerLearningBot)

## Tools and techniques

- **AI Agents and Tools**: The implementation fully via the `Claude Code CLI` (Opus 4.7 xhigh) with the `Codex CLI` (gpt-5-5 xhigh) as a reviewer and planner.
- **n8n Cloud** hosts the workflow and persists state in **Data Tables** — no external DB.
- **Telegram Bot API** through n8n's native Telegram Trigger and `sendMessage` / `editMessageText` / `answerCallbackQuery` operations. Bot registered via BotFather; handle and token live in `.env`, never in the workflow JSON.
- **Jina Reader** (`r.jina.ai`) as the URL → clean Markdown extractor (HTTP Request node).
- **OpenAI** `gpt-5-mini` free tier via the n8n `lmChatOpenAi` sub-node with `responseFormat: "json_object"`, used for both Teacher and Examiner AI roles.
- **Vitest** for 139 pure-JS unit tests on parsers, renderers, callback codec, URL normaliser, and `htmlEscape`.
- **Agent skills** from the [`mattpocock/skills`](https://github.com/mattpocock/skills) collection: `/grill-with-docs` for a design decisions interview; `/to-prd` to crystallise it; `/to-issues` to break it into tracer-bullet slices; `/codex:adversarial-review` from Codex plugin to challenge the design.
- **MCPs**: 
  - `n8n MCP` for node-schema introspection, deployment, and execution inspection; 
  - `Ref MCP` for official live docs fetching; 
  - `Claude Code computer-use` for the agent-driven end-to-end demo against Telegram desktop.

## What worked

- Grilling the design before touching n8n caught a lot of real important decisions — and resolved it deliberately into pre-generated per-option explanations.
- Jina Reader removed an entire class of problems (HTML chrome stripping, SPA rendering, per-site selectors) with one URL substitution.
- A single workflow + Switch router on a `_route` token keeps the export to one file and costs exactly one execution per Telegram update — well within the Starter plan's monthly budget.
- Encoding full state into `callback_data` made stale-tap protection a single-line CAS-on-update check.
- Adversarial review passes surfaced two HIGH-severity issues — the Quiz state mutation contract, and an `rs:` callback that could destructively act on a stale prompt — that would have been painful production bugs.

## What didn't

- Two PRD UX details diverged from the platform reality: the picker shipped as a numbered 2×4 grid (instead of one button per row) because the n8n Telegram node v1.2 cannot accept dynamic-length inline keyboards; keyboard removal between questions uses `editMessageText` (instead of `editMessageReplyMarkup`) because direct HTTP calls can't read `$credentials.accessToken` from expressions.
- The exported `workflow.json` is the byte-level deployed snapshot — it does **not** import one-click into a fresh n8n instance. The grader has to create the Telegram credential, OpenAI credential, and the two Data Tables, then re-select them on the affected nodes. README documents the four steps.

## Notable decisions

- **Multi-user, partitioned by Telegram `chat_id`.** Lets graders try the bot in isolation; cost is one extra column per row.
- **n8n Data Tables over external Postgres / Supabase.** Zero credentials, fully MCP-manageable, schema mirrors PRD §Storage exactly. JSON-shaped fields are serialised as strings. ADR-0002.
- **Intelligent validation relocated from match-time to generation-time.** The Examiner pre-generates a targeted explanation for every option of every question; runtime answer handling is a deterministic lookup. ADR-0001.
- **Quiz lifecycle**: regenerate fresh on every attempt, but if an `in_progress` Quiz exists, prompt resume-or-restart. Backed by a CAS-on-create / CAS-on-update contract (Data Tables don't enforce unique indexes natively).
- **Three-layer race defense for quiz creation** — pre-Examiner check (saves an LLM call when a resume-prompt will fire), pre-insert check (shrinks the inter-execution race window from seconds to milliseconds), and post-insert CAS read-back (slice-5 race floor).
- **HTML parse mode throughout, with mandatory `htmlEscape` on every dynamic field.** Avoids MarkdownV2's escape rules and the `List<T>` / `a < b` rendering pitfalls. Static markup (`<b>`, `<i>`) is interpolated raw.
- **Post-quiz "What's next?" menu.** PRD's terminal state was the results card alone; we added a static menu node beneath it so the user has next-step hints (`/learn` / `/quiz` / `/start`) instead of being left hanging.

Domain glossary lives in [`CONTEXT.md`](./CONTEXT.md); full design rationale in [`PRD.md`](./PRD.md) and [`docs/adr/`](./docs/adr/); usage walkthrough in [`README.md`](./README.md).
