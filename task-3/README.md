# Task 3: Workflowing with n8n

A multi-user Telegram learning assistant: paste a URL → get an AI-generated summary; later run a 5-question quiz on it with intelligent per-option feedback.

- **Live bot:** [t.me/AltmerLearningBot](https://t.me/AltmerLearningBot)
- **Submission report:** [`report.md`](./report.md)
- **Product requirements:** [`PRD.md`](./PRD.md)
- **Domain glossary:** [`CONTEXT.md`](./CONTEXT.md)
- **Architecture decisions:** [`docs/adr/`](./docs/adr/)
- **Workflow JSON (exported):** [`workflow.json`](./workflow.json)
- **Reusable pure-JS modules + tests:** [`lib/`](./lib/)

## Try the live bot

1. Open [`t.me/AltmerLearningBot`](https://t.me/AltmerLearningBot) in Telegram.
2. Send `/start` — the bot replies with the command list.
3. Send `/learn <url>` — try one of the URLs below. The bot returns a structured Summary (title, difficulty badge, main concepts, key points) plus a **Quiz me now** inline button.
4. Tap **Quiz me now** (or send `/quiz` and pick the material from the picker). The bot generates 5 multiple-choice questions and walks you through them one at a time with per-option explanations.
5. After Q5 you get a results card with score % + per-question breakdown, followed by a **"What's next?"** menu pointing to the next commands.
6. Close Telegram mid-quiz and come back later → `/quiz` → pick the same material → choose **Resume** (continues from your last answered question) or **Start fresh** (regenerates a new quiz).

### Test URLs

- https://modelcontextprotocol.io/docs/learn/architecture — MCP protocol architecture
- https://a2a-protocol.org/latest/topics/key-concepts/ — A2A protocol key concepts

Any HTTP/HTTPS URL that Jina Reader can fetch will work; PDFs / video / image URLs are out of scope.

## Importing into your own n8n instance

`workflow.json` is the **byte-level snapshot of the deployed workflow** — useful to inspect node parameters and Code-node source. It is **not a one-click import**: the referenced credential, Data Tables, and webhook IDs are instance-scoped and will not exist in a fresh n8n workspace. To run this workflow yourself:

1. **Import** `task-3/workflow.json` into n8n (`Workflows → Import from File`).
2. **Telegram credential.** In n8n's Credentials, create a new `Telegram API` credential, name it exactly `Task 3 Telegram Bot`, paste your bot token from [@BotFather](https://t.me/BotFather). Re-select this credential on every `n8n-nodes-base.telegram` and `n8n-nodes-base.telegramTrigger` node — the imported references point at a credential ID that does not exist in your workspace.
3. **OpenAI credential.** Each `lmChatOpenAi` sub-node references an OpenAI credential. Either configure n8n's bundled OpenAI integration (Starter plan free pool) or create an `OpenAI` credential with your own `OPENAI_API_KEY` and re-select it on the four `lmChatOpenAi` nodes.
4. **Data Tables.** Create two Data Tables matching the schemas in [`PRD.md` §Storage](./PRD.md). Quick reference:
   - `materials` columns: `chat_id` (string), `short_id` (string), `url` (string), `title` (string), `extracted_content` (string), `main_concepts` (string, JSON), `key_points` (string, JSON), `difficulty` (string), `added_date` (date).
   - `quizzes` columns: `chat_id` (string), `material_short_id` (string), `quiz_id` (string), `status` (string), `questions` (string, JSON), `current_index` (number), `answers` (string, JSON), `score` (number), `created_at` (date), `completed_at` (date).
   Re-select these tables on every `n8n-nodes-base.dataTable` node (about a dozen).
5. **Activate** the workflow. n8n auto-registers the Telegram Trigger webhook; messages to your bot start flowing through.

After step 5, `validate_workflow` against the imported workflow should report 0 errors (132 warnings are documented false positives — see [`docs/adr/`](./docs/adr/) and `implementation-plan.md`).

## Running the unit tests

```sh
cd task-3/lib
npm install
npm test
```

Expected: 139 tests across 10 files, all passing. See [`lib/tests/`](./lib/tests/) for the suite — coverage is enumerated in [`PRD.md` §Testing decisions](./PRD.md).

## Repository layout

```
task-3/
├── README.md            ← this file
├── workflow.json        ← exported n8n workflow (110 nodes, 87 connection groups)
├── report.md            ← submission report (design + lived experience)
├── PRD.md               ← product requirements
├── CONTEXT.md           ← domain glossary
├── docs/
│   ├── adr/             ← architectural decisions
│   └── demo/            ← screenshots from the slice-7 agent-driven end-to-end demo
├── lib/                 ← pure-JS modules (parsers, renderers, codecs) + Vitest tests
├── implementation-plan.md
├── task-3-description.md
├── AGENTS.md
└── CLAUDE.md
```
