# Task 3 — "Workflowing with n8n" Submission Report

## Tools and techniques

- **n8n Cloud** (Starter Annual) hosting the workflow and persisting state in n8n **Data Tables**.
- **Telegram Bot API** via the n8n Telegram Trigger + sendMessage / answerCallbackQuery nodes. Bot `t.me/AltmerLearningBot` registered through BotFather; token kept in `.env`, never in the workflow JSON.
- **Jina Reader** (`r.jina.ai`) as the URL → clean Markdown extractor, called from the standard HTTP Request node.
- **OpenAI** via the n8n built-in LLM credential (`gpt-5-mini`, JSON response mode) for both the Teacher (summary + difficulty) and Examiner (5-question MCQ + per-option explanations) roles. Personal `OPENAI_API_KEY` / `GEMINI_API_KEY` staged as fallbacks.
- **Agent skills** used during design: `/grill-with-docs` to interview through the design tree, `/to-prd` to synthesise the PRD, `/codex:adversarial-review` to challenge the design.
- **MCPs**: n8n MCP for node-schema introspection, Ref MCP for live docs lookups.

## What worked

- A clean grilling pass (14 design branches) before touching n8n caught a real ambiguity in the brief — *"intelligent validation"* with A/B/C/D buttons — and resolved it deliberately rather than hand-waving during build.
- Jina Reader removed an entire class of problems (HTML chrome stripping, SPA rendering, per-site selectors) with one URL substitution.
- A single workflow + Switch router keeps the export to one file the grader can import in one click, and costs exactly one execution per Telegram update.
- Encoding full state into `callback_data` (`qa:{quizId}:{qIdx}:{choice}`) made stale-tap protection a one-line check.
- Running an adversarial review pass before writing code surfaced two contracts (quiz state mutation, HTML escaping) that would have been painful bugs.

## What didn't

- The brief's claim that *"n8n includes free GPT tokens out of the box"* didn't match what current n8n docs describe — every official AI-node page assumes BYO-API-key. Mitigation: keep both the bundled credential and a personal key wired up, swap if the free path stalls.
- GitHub `/to-prd` publish step was intentionally skipped; the PRD lives at `task-3/PRD.md` instead of as an issue.

## Notable decisions

- **Multi-user, partitioned by Telegram `chat_id`.** Lets graders try the bot in isolation; cost is one extra column per row.
- **n8n Data Tables over external Postgres/Supabase.** Zero credentials, fully MCP-manageable; JSON fields serialized as strings. See ADR-0002.
- **"Intelligent validation" relocated from match-time to generation-time.** Examiner pre-generates a targeted explanation for every option of every question; runtime is a deterministic lookup. See ADR-0001.
- **Quiz lifecycle**: regenerate fresh on every attempt, but if an `in_progress` Quiz exists, prompt resume-or-restart. Backed by a CAS-on-create / CAS-on-update contract since Data Tables don't enforce uniqueness natively.
- **HTML parse mode (not MarkdownV2)** for all bot replies, with a mandatory `htmlEscape` of every dynamic field — avoids both MarkdownV2's escape rules and the `List<T>` / `a < b` rendering pitfalls.

Domain glossary lives in `task-3/CONTEXT.md`; full design rationale in `task-3/PRD.md` and `task-3/docs/adr/`.
