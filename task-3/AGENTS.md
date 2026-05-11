# AI Agent Guide

This file provides guidance to AI Agents when working on Task 3 - "Workflowing with n8n". Check the `README.md` for more details on the task.

- [Task 3 description](./task-3-description.md)
- use n8n MCP for all workflowing needs
- use the Bot API: https://core.telegram.org/bots/api
- Telegram bot token: `.env` → `TG_BOT_TOKEN`. Do not hardcode or echo to chat.
- Telegram bot username: `.env` → `TG_BOT_USERNAME` (handle: `t.me/<TG_BOT_USERNAME>`).
- n8n instance URL: `.env` → `N8N_INSTANCE_URL`. Resolve from env at runtime; never paste the hostname into a public artifact (issue comment, PR body, commit message).
- Currently-provisioned resource IDs (workflow, credential, Data Tables) live in `implementation-plan.md` under **Live n8n provisioning**. Read from there, do not duplicate here.

## Verifying a slice AFK

End-to-end live Telegram verification (a human driving the chat) is reserved for slice 7. For every other slice, an AFK agent should verify against the deployed workflow without round-tripping through a real Telegram user. The verification stack:

1. **Unit tests** — `cd task-3/lib && npm test`. All pure-JS modules (`htmlEscape`, parsers, renderers, codec, etc.) are testable offline. PRD's "Modules with unit tests" section enumerates the required cases.
2. **Workflow schema** — `mcp__n8n-mcp__validate_workflow` against the workflow JSON object. Catches missing connections, parameter types, expression errors. The parameter is `workflow` (a full JSON object), not an `id`.
3. **Execution inspection** — `mcp__n8n-mcp__n8n_executions` to assert routing path, node outputs, and Data Table mutations after a real run. Use `mode: "filtered"` with a `nodeNames` allowlist to keep the response small; `itemsLimit: 2` is enough for most assertions.
4. **Side effects of `sendMessage`** — when the workflow's Telegram `sendMessage` actually fires, it sends a real message to `TG_TEST_CHAT_ID`. This is expected dev noise; do not suppress.

> ⚠️ **No synthetic-update injection path.** Discovered during slice 1: (a) `mcp__n8n-mcp__n8n_test_workflow` rejects Telegram Trigger with *"Workflow does not have a webhook trigger"* — it only fires `webhook` / `form` / `chat` trigger types. (b) The Telegram Trigger's webhook URL (resolves from `$N8N_INSTANCE_URL/webhook/<webhookId>/webhook`) requires Telegram's signed secret header; direct `curl` POSTs return `403 "Provided secret is not valid"`. The MCP also has no "pin data on a node + manually execute" primitive.
>
> Practical consequence: the only AFK way to drive a real execution is to let the user fire one /command from Telegram (or have a queued update auto-deliver when the workflow is activated), then inspect via `n8n_executions`. Plan around this — design slices so the workflow JSON + unit tests carry most of the contract weight, and use a single human-typed `/cmd` as the trigger for inspection rather than per-branch synthetic injection.

### Capturing `TG_TEST_CHAT_ID`

One-time setup: the user sends `/start` to the bot (`t.me/<TG_BOT_USERNAME>`) once, then reads the `chat_id` from `https://api.telegram.org/bot<TG_BOT_TOKEN>/getUpdates` (look at `result[].message.chat.id`). Paste it into `.env` as `TG_TEST_CHAT_ID`. Agents must not call `getUpdates` themselves — it exposes PII in transcripts.

## Telegram pitfalls (slice 1 lessons)

- **`appendAttribution` defaults to `true`** on the Telegram `sendMessage` node — every reply gets `\n\nThis message was sent automatically with n8n` appended, breaking any exact-text contract. Set `additionalFields.appendAttribution: false` on every `sendMessage` node.
- **`<url>` in static text breaks HTML parse mode.** Even content that looks like literal markup ( `<url>`, `<your-key>`, etc.) must be HTML-escaped before being sent with `parse_mode: HTML`. Telegram rejects the whole message otherwise. Pre-render once with `htmlEscape` from `task-3/lib/htmlEscape.js`.
- **`n8n_update_partial_workflow.updateNode` requires `updates`, not `changes`.** The error message helps, but writing `changes:` is the first instinct and fails immediately.
- **The first execution after activation may not be your test.** Activating the workflow auto-delivers any queued Telegram updates that piled up while the bot's webhook was unset — they fire as soon as the webhook URL is registered. Always check `n8n_executions list` first and reconcile by `update_id` / timestamp before declaring a test "passed".
