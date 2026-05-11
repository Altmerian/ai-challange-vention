# AI Agent Guide

This file provides guidance to AI Agents when working on Task 3 - "Workflowing with n8n". Check the `README.md` for more details on the task.

- [Task 3 description](./task-3-description.md)
- use n8n MCP for all workflowing needs
- use the Bot API: https://core.telegram.org/bots/api
- Telegram bot token is stored in `.env` file as `TG_BOT_TOKEN` environment variable. Do not hardcode it in the code or share it with anyone.
- Telegram bot username is stored in `.env` as `TG_BOT_USERNAME` (handle: `t.me/<TG_BOT_USERNAME>`)
- n8n instance: `https://altmer.app.n8n.cloud/` (also in `.env` as `N8N_INSTANCE_URL`)

## Verifying a slice AFK

End-to-end live Telegram verification (a human driving the chat) is reserved for slice 7. For every other slice, an AFK agent should verify against the deployed workflow without round-tripping through a real Telegram user. The verification stack:

1. **Unit tests** — `cd task-3/lib && npm test`. All pure-JS modules (`htmlEscape`, parsers, renderers, codec, etc.) are testable offline. PRD's "Modules with unit tests" section enumerates the required cases.
2. **Workflow schema** — `mcp__n8n-mcp__validate_workflow` against the live workflow ID. Catches missing connections, parameter types, expression errors.
3. **Node-level execution** — `mcp__n8n-mcp__n8n_test_workflow` with a synthetic Telegram Update payload pinned on the Telegram Trigger. Exercises the Switch routing and all downstream nodes (including Data Table reads/writes and AI calls) without needing a real user to type into a chat. Synthetic payloads should use `chat_id = TG_TEST_CHAT_ID` (from `.env`).
4. **Execution inspection** — `mcp__n8n-mcp__n8n_executions` to assert routing path, node outputs, and Data Table mutations after a test run.
5. **Side effects of `sendMessage`** — when the workflow's Telegram `sendMessage` actually fires during a test, it sends a real message to `TG_TEST_CHAT_ID`. This is expected dev noise; do not suppress.

### Capturing `TG_TEST_CHAT_ID`

One-time setup: the user sends `/start` to the bot (`t.me/<TG_BOT_USERNAME>`) once, then reads the `chat_id` from `https://api.telegram.org/bot<TG_BOT_TOKEN>/getUpdates` (look at `result[].message.chat.id`). Paste it into `.env` as `TG_TEST_CHAT_ID`. Agents must not call `getUpdates` themselves — it exposes PII in transcripts.

### Synthetic Telegram Update shape

A minimal `/start` update for the Telegram Trigger:

```json
{
  "update_id": 1,
  "message": {
    "message_id": 1,
    "from": { "id": 0, "is_bot": false, "first_name": "TestAgent" },
    "chat": { "id": 0, "type": "private", "first_name": "TestAgent" },
    "date": 1700000000,
    "text": "/start"
  }
}
```

Replace `chat.id` and `from.id` with the value of `TG_TEST_CHAT_ID` before pinning.

For callback queries (`qa:`, `rs:`, `tp:`, etc.), pin a `callback_query`-shaped update with `data` carrying the callback payload — Telegram Bot API docs at https://core.telegram.org/bots/api#update describe the shape.
