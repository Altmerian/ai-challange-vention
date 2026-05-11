# PRD: Task 3 — AI learning assistant Telegram bot via n8n

> Draft — not yet published to the issue tracker.
> Intended labels on publish: `ready-for-agent`.

## Problem Statement

I want to use my Telegram chat as a lightweight, AI-driven study tool: paste a URL of an article and get back a structured summary, then later run a five-question multiple-choice quiz on it to check my retention. Today there is no single place that does both — readers (Pocket, Instapaper) summarize but don't quiz; LLM chat apps quiz but lose state between sessions and require copy-pasting URLs every time. I also need the experience to survive me closing Telegram mid-quiz so I can resume on the next day's commute without losing progress.

## Solution

An n8n-hosted Telegram bot — `t.me/AltmerLearningBot` — exposing three commands:

- `/start` — greeting + command help
- `/learn <url>` — fetches the page, extracts clean Markdown, runs the **Teacher** AI role to produce a **Summary** (`title`, 3–5 `mainConcepts`, 5–7 `keyPoints`, `difficulty`), stores it as a **LearningMaterial** scoped to the **User**'s `chat_id`, and replies with the formatted Summary plus a "Quiz me now" inline button
- `/quiz` — shows a paginated picker of the User's saved Materials; selecting one runs the **Examiner** AI role to generate a fresh five-question **Quiz**, then walks the User through it one question at a time with inline A/B/C/D buttons, per-question feedback, and a final score card

The bot is fully multi-user and partitioned by `chat_id` so graders can interact with their own data. State persists across sessions in n8n Data Tables: Materials survive forever, in-progress Quizzes can be **resumed** on next `/quiz` of the same Material.

## User Stories

1. As a learner, I want to send `/start` to the bot, so that I can see what it can do and which commands are available.
2. As a learner, I want to send `/learn https://example.com/article` to the bot, so that I can save an article I want to study later.
3. As a learner, I want the bot to receive my URL and reply within seconds with the article's title, main concepts, and 5–7 key points, so that I can absorb the gist before reading the whole thing.
4. As a learner, I want the bot to tag each saved Material with a difficulty level (beginner / intermediate / advanced), so that I can decide if I'm ready to engage with it.
5. As a learner, I want the difficulty rendered as a coloured emoji badge (🟢🟡🔴), so that I can scan my library visually.
6. As a learner, I want each saved Material to persist across sessions and bot restarts, so that I can build a personal library over weeks of usage.
7. As a learner, I want `/learn`-ing a URL I've already saved to return the existing Summary instead of creating a duplicate, so that my library stays clean and tokens aren't wasted.
8. As a learner, I want the bot to send me an error message when `/learn` is missing a URL or is given junk, so that I know what went wrong.
9. As a learner, I want the bot to tell me when a page can't be fetched (Jina returns 4xx/5xx) or is too short to summarize, so that I don't sit and wait wondering.
10. As a learner, I want very long pages to be summarized successfully (head-truncated to a safe token budget), so that the Teacher doesn't choke on long-form content.
11. As a learner, I want a "Quiz me now" button right under the freshly produced Summary, so that I can dive straight into testing my comprehension without typing `/quiz`.
12. As a learner, I want to send `/quiz` and see a list of all my saved Materials, so that I can pick one to be tested on.
13. As a learner, I want the topic picker to show one row per Material with the difficulty emoji and the title, so that I can recognise each entry at a glance.
14. As a learner, I want the picker sorted with the most recently learned Material at the top, so that I can quickly find what I just added.
15. As a learner, I want the picker paginated when I have more than eight Materials, with Prev/Next buttons, so that the keyboard stays usable on mobile.
16. As a learner, I want to see "you have no saved Materials yet" if I run `/quiz` before any `/learn`, so that I know what to do next.
17. As a learner, I want the Examiner to generate a fresh five-question Quiz from the Material's full extracted content on every new attempt, so that I'm not memorising the same questions across re-runs.
18. As a learner, I want each Quiz question to have exactly four multiple-choice options (A/B/C/D) presented as inline buttons stacked one per row, so that I can tap quickly on mobile without misclicks.
19. As a learner, I want to receive per-question feedback immediately after my tap (✅ correct or ❌ with a targeted explanation of why my pick was wrong), so that I learn in the moment rather than at the end.
20. As a learner, I want the explanation for a wrong answer to specifically address why **my chosen option** was wrong (not a generic blurb about the correct answer), so that I close the comprehension gap.
21. As a learner, I want answer buttons on previously asked questions to be disabled (or removed) after I tap, so that I can't accidentally re-answer.
22. As a learner, I want a final results card after the fifth question showing my score as a percentage plus a breakdown of which questions I got right and wrong, so that I can review my performance.
23. As a learner, I want to be able to close Telegram mid-quiz, come back hours or days later, send `/quiz` on the same Material, and be asked whether to **resume** or **start fresh**, so that I never lose progress when life interrupts me.
24. As a learner, I want choosing "Start fresh" to discard the in-progress Quiz and generate new questions, so that I can practice on the same Material multiple ways.
25. As a learner, I want choosing "Resume" to continue from the exact question I left off on, with my prior answers preserved, so that resuming is seamless.
26. As a learner, I want to be able to have a different in-progress Quiz per Material simultaneously, so that I can flip between study topics without losing state on any one of them.
27. As a learner, I want stale taps (e.g. on a question I already answered, or on an old quiz's buttons after I scrolled back) to be silently ignored with a toast notification, so that I don't accidentally corrupt my Quiz state.
28. As a grader trying out the bot, I want my activity to be isolated from other users' activity (partitioned by `chat_id`), so that I see only the Materials I added and don't pollute other testers' data.
29. As the bot operator, I want all the state (Material library, Quiz definitions, in-progress sessions, completed history) to live in n8n Data Tables, so that I don't have to set up any external database and the workflow JSON I submit is fully self-contained.
30. As the bot operator, I want to swap from the n8n bundled OpenAI integration to my own OpenAI or Gemini API key without touching workflow logic, so that I can recover gracefully if free credits run out.
31. As the bot operator, I want all AI failures (malformed JSON, missing fields) to be retried once before surfacing an error to the user, so that transient flakes don't ruin the experience.
32. As the bot operator, I want the workflow to fit in a single exportable JSON file with a Switch-based router, so that the grader can import and run it in one step.
33. As the bot operator, I want each Telegram update to cost exactly one n8n execution, so that I stay within my Starter plan's 2,500/month budget while supporting realistic usage.

## Implementation Decisions

### Shape & domain
- **Audience.** Multi-user bot; every persisted row is partitioned by the Telegram `chat_id` of the sender. Private chats only.
- **Domain glossary.** Authoritative terms live in `task-3/CONTEXT.md`: **User**, **LearningMaterial**, **Extracted content**, **Teacher**, **Summary**, **Examiner**, **Quiz**, **Quiz lifecycle** (`in_progress` | `completed`), **Resume-or-restart**, **Intelligent validation**.
- **Architectural decisions captured.** See `task-3/docs/adr/0001-intelligent-validation-via-per-option-explanations.md` and `task-3/docs/adr/0002-n8n-data-tables-for-persistence.md`.

### Storage
- **n8n Data Tables**, two tables: one for **LearningMaterial** rows, one for **Quiz** rows. JSON-shaped fields (`mainConcepts`, `keyPoints`, `questions`, `answers`) are serialized to string columns. ADR-0002.
- **LearningMaterial columns**: `chat_id`, `short_id` (8-char base36, used in callback_data), `url` (normalized), `title`, `extracted_content` (Markdown), `main_concepts` (JSON), `key_points` (JSON), `difficulty` (`beginner` | `intermediate` | `advanced`), `added_date` (ISO 8601 UTC).
- **Quiz columns**: `chat_id`, `material_short_id`, `quiz_id` (8-char base36), `status` (`in_progress` | `completed`), `questions` (JSON), `current_index` (int 0..5), `answers` (JSON array of `{q_id, picked, is_correct}`), `score` (int %, null while in progress), `created_at`, `completed_at`.
- At most one `in_progress` Quiz per (`chat_id`, `material_short_id`). Completed rows accumulate as history (so a "last score" line can be added to the Summary view later).
- **URL deduplication.** On `/learn`, normalize URL (strip trailing `/`, drop `#fragment`, lowercase host) and look up by (`chat_id`, normalized url). On hit: reply with the cached Summary, no AI call.

### Quiz state mutation contract

n8n Data Tables do not enforce unique indexes, and a single Telegram bot can receive multiple updates (duplicate taps, retried webhook deliveries, concurrent quizzes started from different chats or from the same chat across different Materials) before earlier executions have finished writing. Without a contract, two executions could each observe "no in-progress Quiz" and both insert one, or could both read the same `current_index` and both write the next answer. The following rules are normative for every node that touches the Quiz table:

- **Active-session key.** The logical key for "this user's active attempt on this Material" is the tuple (`chat_id`, `material_short_id`, `status = 'in_progress'`). Lookups for resume-or-restart and for answer routing must filter on all three.
- **Quiz creation (CAS-on-create).** A new Quiz row is inserted only after a read confirms zero `in_progress` rows for the active-session key. Immediately after insert, re-read by the new `quiz_id`; if more than one `in_progress` row exists for the key, the executing branch **must** delete its own row (identified by `quiz_id`) and abort with a "couldn't start your quiz, please try /quiz again" message. The user-initiated retry is the safety net; we do not implement true cross-execution locking.
- **Resume-or-restart prompt idempotency.** The `rs:{materialShortId}:n` ("start fresh") handler must (a) delete the existing `in_progress` row by `quiz_id` (read first to capture id), (b) then run the CAS-on-create flow above. The `rs:{materialShortId}:r` ("resume") handler is a pure read of the existing `in_progress` row plus a question render; it is naturally idempotent.
- **Answer advancement (CAS-on-update).** Every answer handler executes an atomic compare-and-set against the Quiz row: `UPDATE quizzes SET current_index = expected_idx + 1, answers = appended, status = (expected_idx == 4 ? 'completed' : 'in_progress'), score = (computed_or_null), completed_at = (now_or_null) WHERE quiz_id = X AND current_index = expected_idx AND status = 'in_progress'`. If the update affects zero rows, the tap is stale or duplicate; the handler responds via `answerCallbackQuery` with a toast (per the error table) and **does not** advance state, render feedback, or send the next question.
- **Duplicate-tap detection.** Because `callback_data` carries `qIdx`, a duplicate tap of the same button arrives with the same `(quiz_id, qIdx, choice)` triple. The CAS-on-update from the previous bullet already rejects it (the second update sees `current_index == qIdx + 1`, not `qIdx`); the handler must additionally suppress sending feedback or next-question messages on the duplicate to keep the chat clean.
- **Completed row immutability.** Once `status = 'completed'`, the row is never updated again. Re-quizzing the same Material always creates a new Quiz row via CAS-on-create.
- **No cross-Material serialization.** A `chat_id` may legitimately hold multiple `in_progress` Quiz rows simultaneously (one per Material). The active-session key is per-Material, not per-chat.

Verifying the CAS guarantees: Data Tables' update operation with multiple-column WHERE filters is the primitive relied on; the n8n MCP-managed Data Tables runtime executes each update as a single statement, so the read-modify-write race window inside a single update call is closed by the storage. The remaining race window is between separate executions' reads-then-writes, which the CAS WHERE filter on `current_index` and `status` handles correctly.

### Content extraction
- **Jina Reader** (`https://r.jina.ai/<original_url>`) via the standard n8n HTTP Request node. Returns clean Markdown stripped of nav/sidebar/footer/scripts. No automatic fallback to raw HTTP on Jina failure — the bot replies with an error and asks for a different URL.
- Extracted content under 500 chars → bot rejects with "not enough content"; over ~30k tokens → head-truncated.

### AI integration
- **OpenAI Chat Model** sub-node (`@n8n/n8n-nodes-langchain.lmChatOpenAi`) with `responseFormat = "json_object"`. Default model `gpt-5-mini`; switch to `gpt-5` only if mini quality disappoints.
- **Primary credential**: n8n's built-in OpenAI integration (free pool on Starter plan). **Fallback**: user-supplied `OPENAI_API_KEY` or `GEMINI_API_KEY` from `.env`. Swap is a credential-only change, no workflow edits.
- **Single Examiner call per Quiz attempt** — all 5 questions and all 20 per-option explanations in one response.

### Output schemas

The Teacher returns:
```
{
  "title": string,
  "mainConcepts": string[3..5],
  "keyPoints": string[5..7],
  "difficulty": "beginner" | "intermediate" | "advanced"
}
```

The Examiner returns:
```
{
  "questions": [
    {
      "id": "Q1".."Q5",
      "question": string,
      "options": [
        { "key": "A", "text": string },
        { "key": "B", "text": string },
        { "key": "C", "text": string },
        { "key": "D", "text": string }
      ],
      "correctAnswer": "A" | "B" | "C" | "D",
      "perOptionExplanation": {
        "A": string, "B": string, "C": string, "D": string
      }
    }
  ]
}
```
ADR-0001 explains the `perOptionExplanation` design.

### Workflow topology
- **One workflow, one Telegram Trigger, one Switch router.** Switch branches on `(command | callback_data prefix)`: `/start`, `/learn`, `/quiz`, `qa:` (answer), `rs:` (resume/new), `tp:` (topic pick), `tpp:` (topic page), `qstart:` ("Quiz me now").
- One n8n execution per Telegram update.

### Callback data conventions
- `qa:{quizId}:{qIdx}:{choice}` — answer button. The handler rejects taps where `qIdx ≠ current_index` (stale) with a toast.
- `rs:{materialShortId}:r` / `rs:{materialShortId}:n` — resume / start-fresh after the resume-or-restart prompt.
- `tp:{materialShortId}` — topic pick from the `/quiz` list.
- `tpp:{pageIdx}` — topic-picker pagination (edits the existing picker message in place).
- `qstart:{materialShortId}` — "Quiz me now" button under a fresh Summary.

### UX
- **Per-question feedback**: short ✅/❌ message with the targeted `perOptionExplanation` for the picked option, then the next question as a **new** message. Previous question's keyboard is removed in place.
- **Final results card** after Q5: percentage score + per-question breakdown with each question's correct answer + the explanation the User saw (or would have seen).
- **Topic picker**: 8 entries/page, one button per row (`{difficulty emoji} {title}`), sort `addedDate DESC`, pagination footer only when more than 8 Materials.
- **/start text**:
  ```
  👋 Hi! I'm your learning assistant.
  • Send /learn <url> to save and summarize an article.
  • Send /quiz to test yourself on a saved material.
  • Send /start to see this again.
  ```
- **Telegram parse_mode**: HTML throughout (avoids MarkdownV2 escaping pain).

### HTML rendering contract

Telegram's `parse_mode: HTML` still requires the sender to escape the literal characters `<`, `>`, and `&` in dynamic content; failing to do so makes Telegram reject the entire message with `Bad Request: can't parse entities` and the bot looks broken. Quiz options and explanations contain plenty of legitimate angle brackets — `List<T>`, `a < b`, `&&`, code snippets — and Jina-extracted Markdown can also surface them. Renderer attribute values (e.g. URLs inside `href="…"`) additionally require `"` to be escaped as `&quot;`.

**Contract for every renderer:**

- **Pure-text dynamic fields** (title, key points, main concepts, question text, option text, every `perOptionExplanation` string, score breakdown lines) **must** be passed through `htmlEscape` before string interpolation. `htmlEscape` maps `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`. The order matters — `&` is escaped first — to avoid double-encoding.
- **Attribute-value dynamic fields** (URLs in `<a href="…">…</a>`) must additionally escape `"` → `&quot;` (and the link text itself escapes via the pure-text rule). Since the current renderers do not actually use anchor tags, this rule reduces to "do not emit `<a>` with dynamic href unless you also extend `htmlEscape` accordingly."
- **Static markup** (literal `<b>`, `<i>`, `\n`, emoji) is interpolated as-is; never round-tripped through `htmlEscape`.
- **Truncation happens after escape**, never before — slicing a string mid-`&amp;` produces garbage. If a button label needs truncation to fit Telegram's text limit, truncate the raw input, *then* escape, *then* render.
- **Inline keyboard `text` fields are not HTML** — they're plain UTF-8 strings rendered by Telegram's button widget. Do not pass them through `htmlEscape`; do truncate them to a sensible length (≤80 chars) for mobile readability.

A future free-text answer feature must also escape user input before echoing it back; this contract extends to that handler when added.

### Modules (deep-first, pure JS)
The following are extracted as plain JS in `task-3/lib/` and pasted into n8n Code nodes by reference. *Deep* means: small interface, encapsulated edge-case logic, testable in isolation.

1. **callbackCodec** — `encode(type, params) → string`, `decode(string) → {type, params}`. Enforces the 64-byte Telegram limit, validates prefix vocabulary.
2. **urlNormalizer** — `normalize(raw) → string | null`. Strips trailing `/`, drops `#fragment`, lowercases host. Returns null on invalid input.
3. **teacherOutputParser** — `parse(rawText) → Summary | ParseError`. JSON parse + schema validation (key-points count, difficulty enum, etc.).
4. **examinerOutputParser** — `parse(rawText) → QuizQuestions | ParseError`. Stricter (4 options per Q, `correctAnswer` in {A,B,C,D}, all four `perOptionExplanation` keys present, exactly 5 questions).
5. **topicPickerBuilder** — `build({materials, page, pageSize}) → {html, inlineKeyboard}`. Pagination math, empty-state handling.
6. **htmlEscape** — `escape(rawText) → string`. Maps `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`. Shared by every renderer; never bypassed for dynamic content.
7. **quizQuestionRenderer** — renders one question's HTML + inline keyboard.
8. **quizFeedbackRenderer** — renders the per-question ✅/❌ + explanation message.
9. **quizResultRenderer** — renders the final score card with per-Q breakdown.
10. **summaryRenderer** — renders the Teacher's Summary into Telegram HTML with the difficulty badge and "Quiz me now" inline button.
11. **shortIdMinter** — `mint(rowId) → string` (8-char base36). Deterministic from row id.

### Error handling

The table below is **normative** — every failure mode below must be detected and routed exactly as specified. The columns are:

- **Trigger**: the condition the workflow checks (or the upstream error it catches).
- **Detection point**: which node / module is responsible for noticing.
- **Retry policy**: whether and how often to retry before surfacing.
- **State mutation**: whether the failure occurs before, during, or after a write — and what cleanup the handler owes.
- **User-visible response**: the message the bot sends to the User.
- **Logging**: what the workflow should record (n8n execution log) for post-mortem.

| # | Trigger | Detection | Retry | State mutation | User-visible response | Logging |
|---|---|---|---|---|---|---|
| 1 | `/learn` with no argument | command parser | none | no writes | *"Send a URL after /learn, e.g. `/learn https://example.com/article`"* | none |
| 2 | `/learn` argument fails URL regex / `URL` constructor | `urlNormalizer` returns null | none | no writes | same as #1 | none |
| 3 | Jina Reader returns 4xx | HTTP Request node `responseCode` | none (no auto-fallback) | no writes | *"I couldn't fetch that page (status N). Try a different URL?"* | response status + URL |
| 4 | Jina Reader returns 5xx or times out | HTTP Request node error / timeout | **1 retry** with 2s back-off | no writes | same as #3 if both attempts fail | both attempts' status |
| 5 | Extracted content < 500 chars | post-Jina length check | none | no writes | *"That page doesn't have enough content for me to summarize. Try a different URL?"* | character count + URL |
| 6 | Extracted content > ~30k tokens | post-Jina length check | none — **head-truncate** to 30k, continue | no writes (truncation is in-memory) | none (silent truncation; the Summary still renders) | original length + truncated length |
| 7 | Teacher AI returns malformed JSON | `teacherOutputParser` | **1 retry** with stricter prompt ("you must return only valid JSON matching the schema") | no writes | *"Sorry, I had trouble processing this one. Try /learn again, or pick a different URL?"* | both raw responses |
| 8 | Teacher AI JSON valid but schema invalid (missing fields, wrong enum, key-points out of range) | `teacherOutputParser` | same as #7 | no writes | same as #7 | both raw responses + parse error details |
| 9 | Examiner AI returns malformed or schema-invalid JSON | `examinerOutputParser` | **1 retry** with stricter prompt | **before** Quiz row insert — no cleanup needed | *"Sorry, I had trouble generating the quiz. Try /quiz again?"* | both raw responses + parse error |
| 10 | AI provider returns 429 (free credits exhausted) or 401 (key invalid) | OpenAI Chat Model node error | none — surface immediately | no writes | *"My AI quota is empty for now. The bot operator has been notified."* | response status + provider |
| 11 | Telegram `sendMessage` 429 (rate-limited) | Telegram node error | node-level **retry up to 3** with exponential back-off | depends on caller — see #14 | none (transparent to User) | retry attempts |
| 12 | Telegram message exceeds 4096 chars | pre-send length check | none — **chunk** at 4000 chars on newline boundary | none | the full content arrives as 2+ messages, oldest first | chunk count |
| 13 | Data Table read/write fails (network, schema mismatch) | n8n Data Table node error | node-level **retry once** | depends on operation: read failures are safe; write failures may have partially landed — caller must read back to verify | *"Something went wrong on my side. Try again?"* | operation + key + error |
| 14 | Quiz answer CAS-on-update affects zero rows (stale or duplicate tap) | answer handler post-update row-count check | none | none | `answerCallbackQuery` toast: *"This question has already been answered or the quiz has ended."* — no chat message, no feedback render, no next-Q send | `(quiz_id, qIdx, choice)` triple |
| 15 | Quiz CAS-on-create races and produces 2+ `in_progress` rows | post-insert duplicate-check | none — **delete own row** and abort | self-delete the just-inserted row (identified by `quiz_id`) | *"Couldn't start your quiz, please try /quiz again."* | observed row count + own `quiz_id` |
| 16 | `qa:` callback references a `quiz_id` that no longer exists (deleted via "start fresh") | Quiz row lookup | none | none | same toast as #14 | the missing `quiz_id` |
| 17 | User runs `/quiz` with zero saved Materials | post-lookup count | none | none | *"You haven't saved any materials yet. Send /learn <URL> to add one."* | none |
| 18 | User runs `/learn` while a Quiz is `in_progress` on any Material | n/a | none — **no interference**; learn proceeds, in-progress Quiz untouched | new Material row; existing Quiz row untouched | normal `/learn` response | none |
| 19 | `/quiz` topic pick on a Material with an `in_progress` Quiz on a *different* Material | n/a | none — both Quizzes coexist | new Quiz row inserted via CAS-on-create | resume-or-restart prompt if the **picked** Material has its own `in_progress` row, otherwise fresh quiz | none |
| 20 | Any unhandled exception in a Code node | n8n error workflow / catch | none — surface | depends; the downstream branch must assume worst-case partial write | *"Something went wrong on my side. Try again?"* | full stack trace |

The table is exhaustive for MVP. Anything not listed is a defect to be added here before shipping. Concurrent `/learn` and Quizzes are independent (#18); concurrent Quizzes across Materials are independent (#19); concurrent operations on the **same** Quiz are serialized by the CAS rules in the Quiz state mutation contract.

## Testing Decisions

### What makes a good test for this codebase
- **External-behavior only.** Tests assert on the module's stated input → output contract. No assertions on internal helper invocation, intermediate variable values, or HTML byte-for-byte (use snapshots only when the visible output is the entire contract).
- **Pure-function focus.** All tested modules are pure — no n8n runtime, no Telegram API, no AI calls in tests. Mocking is unnecessary.
- **Fast and parallel.** Vitest (or plain Node `--test`) running in milliseconds, no fixtures bigger than a few KB.
- **Real failure modes.** Inputs are crafted from observed AI failure modes (missing fields, wrong enums, extra fields, near-valid JSON), real-world Telegram constraints (64-byte callback_data, 4096-char message length, HTML parse-mode escape requirements), and content that has historically broken HTML rendering (`List<T>`, `a < b && b > c`, `"`, multi-line code blocks).

### Modules with unit tests

The five deep modules with real edge-case surface plus the `htmlEscape` utility (which every renderer depends on) plus focused HTML-escape regression tests on the four renderers. Renderer tests are not full snapshot tests — they assert specifically that dangerous characters in dynamic fields appear escaped in the output.

1. **callbackCodec** — round-trip encode/decode, 64-byte limit guard, malformed-input handling, every prefix vocabulary entry.
2. **urlNormalizer** — trailing slash, fragment, host-case, non-URL inputs, percent-encoding, query-string preservation.
3. **teacherOutputParser** — missing fields, wrong `difficulty` enum, `keyPoints` length outside 5–7, `mainConcepts` length outside 3–5, plain non-JSON.
4. **examinerOutputParser** — missing options, `correctAnswer` not in {A,B,C,D}, missing `perOptionExplanation` entries, fewer/more than 5 questions, fewer/more than 4 options per question.
5. **topicPickerBuilder** — empty list, single page, exact page-size boundary, last-page partial fill, page-out-of-range.
6. **htmlEscape** — `&` → `&amp;` first, `<` → `&lt;`, `>` → `&gt;`; empty string; already-escaped input (no double-encoding); strings containing all three special chars; non-string input handling.
7. **Renderer HTML-escape regression tests** — for each of `summaryRenderer`, `quizQuestionRenderer`, `quizFeedbackRenderer`, `quizResultRenderer`: feed dynamic fields containing `<`, `>`, `&`, `"`, and a near-Telegram-limit-length payload; assert that the output contains the escaped sequences and does not contain raw `<` / `>` / `&` outside of the renderer's own static markup. These are *not* full snapshot tests — they target the single failure mode (unescaped dynamic content reaching Telegram).

**Not tested**: full visual snapshots of renderers (validated by eye during the demo run); `shortIdMinter` (trivial enough that a regression would surface immediately in any quiz attempt).

### Prior art
- The repo has no JS unit tests yet. Test stack to introduce: **Vitest** (zero-config, fast, good DX). One `package.json` and one `vitest.config.ts` under `task-3/lib/` keep the test surface scoped to this task.
- Pattern reference for what "good" looks like: parser tests should resemble the public examples in widely-used schema-validation libraries (one `describe` per failure mode, table-driven inputs).

## Out of Scope

- **Free-text answer parsing.** Only inline A/B/C/D button taps are accepted. ADR-0001 leaves this open as a future additive change.
- **Group chats.** Bot supports private 1:1 chats only.
- **Payments / paid tiers.** Bot is free to use within n8n quota.
- **Multi-language support / i18n.** English only.
- **Spaced repetition / scheduling.** No reminders or scheduled re-quizzes.
- **Cross-user analytics.** No "popular materials", no aggregated stats.
- **`/cancel` command.** A fourth command was considered for explicitly clearing an in-progress Quiz; rejected to stay within the spec's stated three commands.
- **Profile / settings.** No `/settings`; no ability to change difficulty rendering or default page size.
- **Image, PDF, or YouTube ingestion.** Only HTTP URLs that Jina Reader can process; PDFs/audio/video out of scope.
- **Push notifications.** All bot output is reactive to a User message.
- **Webhook security hardening beyond Telegram's built-in.** No HMAC verification of incoming updates; relying on n8n Telegram Trigger's built-in verification.
- **Cost optimisation beyond retry-once.** No prompt-cache layer, no embeddings, no semantic dedup of similar URLs.
- **Materials export / import.** No way to download or share saved Materials.

## Further Notes

- **Bot identity**: `t.me/AltmerLearningBot`. Token in `task-3/.env` as `TG_BOT_TOKEN`. Never hardcoded in workflow JSON; lives in an n8n credential.
- **Submission artifacts** (per task brief): exported workflow JSON, link to the live bot, `task-3/report.md`, `task-3/README.md` with a short usage guide.
- **Quota awareness**: Starter Annual plan = 2,500 executions / month and 100 MCP requests / month. One execution per Telegram update means ~2,500 user interactions/month before the workflow disables — plenty for demo and personal use.
- **Domain & ADR cross-references**:
  - Domain glossary: `task-3/CONTEXT.md`
  - ADR-0001 (intelligent validation): `task-3/docs/adr/0001-intelligent-validation-via-per-option-explanations.md`
  - ADR-0002 (n8n Data Tables): `task-3/docs/adr/0002-n8n-data-tables-for-persistence.md`
