# AI Agent Guide

This file provides guidance to AI Agents how to implement MCP server and verify the implementation end-to-end when working on Task 4 - "MCPing". Check the `README.md` for more details on the task.

- [Task 4 description](./task-4-description.md)
- [PRD](./PRD.md)
- [Implementation Plan](./implementation-plan.md)
- [Domain Glossary](./CONTEXT.md)

## Reference materials and docs for MCP server implementation:
- [MCP Architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP Server Concepts](https://modelcontextprotocol.io/docs/learn/server-concepts)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)


## Documentation audience separation

- **`README.md`** is the **only** human-facing document. It is read by the evaluators of this submission and must cover, with nothing extra: install/build, env vars and accepted values, run + MCP-client connection instructions, and the tool/resource reference. Keep it tight — no design rationale, no decision logs, no internal terminology.
- **Everything else in `task-4/`** — `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`, `docs/adr/`, `PRD.md`, `implementation-plan.md`, test files, and any future agent-only artefacts — is **for AI agents implementing or modifying the server**. Domain glossary, design decisions, edge cases, scheduling internals, and test scenarios live here, not in `README.md`.
- The `report.md` is the human-facing post-mortem of what was built and how — separate from `README.md`'s "how to use it".

## Verifying MCP Server using MCP Inspector

The MCP Inspector is the canonical tool for end-to-end verification of this server through its actual stdio transport. Implementing agents **must** run the Inspector-driven verification described below before marking the implementation complete — this is a required step, not an optional smoke test. Manual UI exploration is not required for evaluation; agents drive the Inspector programmatically via its CLI mode (`mcp-inspector --cli`).

- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [Debugging Guide](https://modelcontextprotocol.io/docs/tools/debugging)

### What to verify via Inspector

Agents must verify all of the following through Inspector against a freshly built server (`node dist/index.js`) with a known env-var configuration:

**Protocol-level checks**
- The server starts cleanly and Inspector establishes a session.
- The tool catalogue lists exactly: `submit_flight`, `cancel_flight`, `generate_schedule`, `get_airport_status`, `analyze_bottleneck`, `reset_state`.
- The resource catalogue lists exactly: `atc://queue`, `atc://runways`, `atc://timeline`.
- Each tool's input schema validates expected inputs and rejects malformed ones.

**Scenario walkthroughs (the three brief scenarios, executed via Inspector tool calls)**
1. **Morning Rush** — `reset_state` → submit 4 mixed flights (high-arrival, medium-departure, low-arrival, low-departure) → `generate_schedule` → fetch `atc://queue` and `atc://timeline`. Assert: all four scheduled, no overlapping runway/gate usage on the timeline, higher-priority flights appear earlier when contested.
2. **Heavy Hauler** — `reset_state` → submit one high-priority departure with `min_runway_length_m` greater than any configured runway, plus one or more valid flights → `generate_schedule` → fetch `atc://queue` and call `get_airport_status`. Assert: heavy is `unscheduled` with reason `no_compatible_runway`, valid flights are scheduled, `constraints.runway_blocking` is `true`.
3. **Connecting Flight** — `reset_state` → submit inbound arrival A → submit outbound departure B with `dependencies: ["A"]` → `generate_schedule` → fetch `atc://timeline`. Assert: both scheduled, B's `start_offset_min ≥ A.end_offset_min + ATC_DEPENDENCY_BUFFER_MIN`, timeline ordering reflects dependency.

**Additional verifications (beyond the brief)**
- `analyze_bottleneck` on the Connecting Flight schedule returns `bottleneck_exists: true` with the expected 2-flight chain.
- `cancel_flight` on flight A in the Connecting Flight scenario marks A `cancelled` and re-evaluates B to `unscheduled` with reason `dependency_cancelled` — without an explicit `generate_schedule` follow-up.
- `reset_state` empties the queue and resets `submission_index` to 0.
- Determinism: run the same scenario twice (with `reset_state` between) and confirm scheduled-flight offsets are byte-identical.

If any check fails, fix the underlying issue and re-run all of the above — do not partially verify.
