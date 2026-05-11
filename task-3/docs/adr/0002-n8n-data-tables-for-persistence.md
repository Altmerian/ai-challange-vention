# n8n Data Tables for LearningMaterial and Quiz persistence

We persist all bot state — material library, quiz definitions, quiz session progress, quiz history — in n8n's native **Data Tables** rather than an external Postgres/Supabase. This is the surprising-but-deliberate call: most n8n tutorials reach for an external DB. We picked Data Tables because (a) `task-3/CLAUDE.md` mandates "use n8n MCP for all workflowing needs" and the Data Tables API is fully addressable via that MCP, (b) zero external credentials means one fewer thing for the grader to set up, and (c) the data shape is shallow and per-user-partitioned, so the relational power of Postgres buys us little.

## Considered alternatives

- **Supabase Postgres (free tier).** Full SQL, proper relations, easy joins. Rejected — adds a credential, another moving part the grader has to trust, and the data volume here (a handful of materials per user, a handful of quiz rows each) is well under Data Tables limits.
- **Workflow Static Data.** Cheapest (zero extra calls), but wiped on workflow re-import and fragile under concurrent multi-user executions. Rejected for state that must survive a re-import of the submitted JSON.
- **Google Sheets / Airtable.** Easy visual inspection but slow under concurrent writes and clunky for JSON-shaped quiz data. Rejected.

## Consequences

- Quiz `questions` and `answers` fields are stored as JSON-serialized strings (Data Tables are flat-row). Parse on read, stringify on write.
- Cross-user analytics queries (e.g. "average score across users") would require iterating rows in n8n logic, not a SQL `GROUP BY`. Acceptable — out of scope for the submission.
- Migration to Postgres later means rewriting every read/write node, not a schema dump-and-restore. Reversal cost is real but bounded by the small node count.
