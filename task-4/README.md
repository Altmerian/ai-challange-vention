# Air Traffic Control MCP Server

A Model Context Protocol (MCP) server for Air Traffic Control (ATC) that schedules flight arrivals and departures across a configurable set of runways, gates, and ground crew. The server is written in TypeScript, runs on Node.js (≥ 20) on macOS or Windows, holds all state in-memory, and speaks MCP over the stdio transport — so any MCP-compatible client (Claude Desktop, MCP Inspector, Claude Code, GH Copilot, and custom agents) can drive it.

This document is the **usage** guide. Design rationale lives in [`report.md`](./report.md), [`PRD.md`](./PRD.md), [`CONTEXT.md`](./CONTEXT.md), and [`docs/adr/`](./docs/adr/).

## Tools

All tools speak strict JSON Schema — unknown fields are rejected.

| Tool | Purpose | Input | Output |
| --- | --- | --- | --- |
| `reset_state` | Wipe the flight queue, drop the schedule, reset the submission-index counter to 0. Configuration is untouched. | `{}` | `{ cleared: true, flights_removed_count, schedule_cleared }` |
| `submit_flight` | Append a flight to the queue. | `{ flight_number, operation: "arrival" \| "departure", priority: "high" \| "medium" \| "low", dependencies?: string[], min_runway_length_m?: integer }` | `{ accepted: true, flight_number, submission_index }` — or an error envelope (duplicate flight number, self-dependency). |
| `generate_schedule` | Replace the current schedule with a freshly computed one based on the queue. | `{ timezone?: string }` — optional IANA timezone for `start_at` / `end_at` rendering. | `{ schedule: ScheduleSnapshot }` |
| `cancel_flight` | Mark a flight `cancelled` (terminal, idempotent) and immediately re-run the scheduler so dependents are re-evaluated in the same round-trip. | `{ flight_number, timezone?: string }` | `{ cancelled: true, flight_number, schedule: ScheduleSnapshot }` — or an error envelope for an unknown flight. |
| `get_airport_status` | Read-only snapshot: counts by state and operation, per-runway/gate usage, constraint indicators, blocked flights, schedule completion timing. Does not recompute. | `{ timezone?: string }` | `AirportStatus` |
| `analyze_bottleneck` | Read-only analysis: longest dependency chain through scheduled flights, measured in elapsed minutes. Returns `bottleneck_exists: false` when no scheduled dependency edges exist. Does not recompute. | `{ timezone?: string }` | `BottleneckReport` |

Validation errors (business-rule failures and bad timezones) return as MCP `isError: true` envelopes containing every problem found, not just the first.

## Resources

All resources are read-only; reading them never triggers a scheduling pass.

| URI | Purpose | Content |
| --- | --- | --- |
| `atc://queue` | Every flight ever submitted, in submission order — includes `submitted`, `scheduled`, `unscheduled`, and `cancelled` states. | `{ flights: QueueEntry[] }` — each entry carries `flight_number`, `operation`, `priority`, `dependencies`, optional `min_runway_length_m`, `state`, `submission_index`, plus either the placement (if scheduled) or `reason` + `detail` + optional `blocking_flight_number` (if unscheduled). |
| `atc://runways` | Per-runway view of scheduled operations and availability. | `{ runways: [{ runway_id, length_m, operations: ScheduleEntry[], busy_minutes, utilization_pct, available_windows, next_available_at_offset_min }] }` — `busy_minutes` includes the trailing separation buffer. |
| `atc://timeline` | Flat chronological list of every scheduled operation across the whole airport. | `{ operations: ScheduleEntry[] }` — sorted by `(start_offset_min, flight_number)`. |

## Environment variables

All variables prefixed `ATC_`. All required unless noted. Validation errors at startup are collected and printed together; the process then exits non-zero.

| Variable | Required | Type | Validation | Example |
| --- | --- | --- | --- | --- |
| `ATC_RUNWAY_LENGTHS_M` | yes | comma-separated integers | ≥1 entry, each integer ≥1. Defines both the runway count and each runway's length. | `2500,3500,4000` |
| `ATC_GATE_COUNT` | yes | integer | ≥1 | `4` |
| `ATC_GROUND_CREW_COUNT` | yes | integer | ≥1 | `2` |
| `ATC_LANDING_DURATION_MIN` | yes | integer (minutes) | ≥1 | `5` |
| `ATC_TAKEOFF_DURATION_MIN` | yes | integer (minutes) | ≥1 | `4` |
| `ATC_GATE_TURNAROUND_MIN` | yes | integer (minutes) | ≥1 | `30` |
| `ATC_SEPARATION_TAKEOFF_MIN` | yes | integer (minutes) | ≥0 | `2` |
| `ATC_SEPARATION_LANDING_MIN` | yes | integer (minutes) | ≥0 | `2` |
| `ATC_SEPARATION_MIXED_MIN` | yes | integer (minutes) | ≥0 | `3` |
| `ATC_DEPENDENCY_BUFFER_MIN` | yes | integer (minutes) | ≥0 | `15` |
| `ATC_MAX_HORIZON_MIN` | yes | integer (minutes) | ≥1 | `240` |
| `ATC_DEFAULT_TIMEZONE` | no | IANA timezone name | must resolve via the system tz database (no silent fallback). Defaults to `UTC`. | `Europe/Warsaw` |

Runways are auto-assigned IDs `RWY-1`, `RWY-2`, … in the order the lengths are listed. Gates are auto-assigned `GATE-1`, `GATE-2`, … by position.

---

## Quick start

The same commands work on macOS and Windows — the only platform-specific bit is how you set environment variables. Pick the block that matches your shell.

#### macOS (bash, zsh)

```bash
# 1. Clone the repository and switch into the server directory
git clone https://github.com/Altmerian/ai-challenge-vention.git
cd ai-challenge-vention/task-4/server

# 2. Install dependencies and build dist/index.js
npm install
npm run build

# 3. Export the airport configuration (see "Environment variables" below for accepted values)
export ATC_RUNWAY_LENGTHS_M="2500,3500"
export ATC_GATE_COUNT=4
export ATC_GROUND_CREW_COUNT=2
export ATC_LANDING_DURATION_MIN=5
export ATC_TAKEOFF_DURATION_MIN=4
export ATC_GATE_TURNAROUND_MIN=30
export ATC_SEPARATION_TAKEOFF_MIN=2
export ATC_SEPARATION_LANDING_MIN=2
export ATC_SEPARATION_MIXED_MIN=3
export ATC_DEPENDENCY_BUFFER_MIN=15
export ATC_MAX_HORIZON_MIN=240
```

#### Windows (PowerShell)

```powershell
# 1. Clone the repository and switch into the server directory
git clone https://github.com/Altmerian/ai-challenge-vention.git
cd ai-challenge-vention\task-4\server

# 2. Install dependencies and build dist\index.js
npm install
npm run build

# 3. Set the airport configuration (see "Environment variables" below for accepted values)
$env:ATC_RUNWAY_LENGTHS_M = "2500,3500"
$env:ATC_GATE_COUNT = "4"
$env:ATC_GROUND_CREW_COUNT = "2"
$env:ATC_LANDING_DURATION_MIN = "5"
$env:ATC_TAKEOFF_DURATION_MIN = "4"
$env:ATC_GATE_TURNAROUND_MIN = "30"
$env:ATC_SEPARATION_TAKEOFF_MIN = "2"
$env:ATC_SEPARATION_LANDING_MIN = "2"
$env:ATC_SEPARATION_MIXED_MIN = "3"
$env:ATC_DEPENDENCY_BUFFER_MIN = "15"
$env:ATC_MAX_HORIZON_MIN = "240"
```

Now connect an MCP client (see [Connect an MCP client](#connect-an-mcp-client)) and step through the brief's scenarios in [Validate the three scenarios](#validate-the-three-scenarios). If any required environment variable is missing or invalid when the client launches the server, the server exits non-zero and prints **every** error to stderr in one block.

## Connect an MCP client

Pick **one** of the three options below — they are mutually exclusive entry points, not steps in a sequence.

- **Option A — MCP Inspector** (easiest way, but the tested MCP Inspector v0.21.2 contains bugs with resource handling required workaround, see below). Browser-based, no install beyond `npx`, one terminal.
- **Option B — Claude Desktop** (or any other MCP host, for actually using the server). Config-file based, persistent across restarts.
- **Option C — Claude Code or VS Code GitHub Copilot, zero-config in this repo**. Both hosts auto-discover the project-scoped [`.mcp.json`](../.mcp.json) at the workspace root — no host config to edit.

All three options have the host spawn the server itself — you never run `node dist/index.js` manually.

### Option A — MCP Inspector

From the same shell session where you exported the env vars in [Quick start](#quick-start), run:

```bash
# macOS / Windows (all shells)
npx @modelcontextprotocol/inspector node dist/index.js
```

A browser tab opens. Press the `Connect` button then jump to [Validate the three scenarios](#validate-the-three-scenarios) and step through them in the Inspector's **Tools** and **Resources** panes.

> **Heads-up for Option A users — two MCP Inspector v0.21.2 UI bugs.** Both are Inspector display issues, not server issues; the server responds correctly in every case. Options B and C are unaffected.
>
> 1. **Resources pane shows only the first opened resource.** Clicking a different resource (or pressing **Refresh**) does fire `resources/read` against the server — a new entry appears in the **History** pane and the response is visible there — but the right-hand display body only ever renders the resource you opened first. Switching to another resource updates the header label but not the body. **Workaround:** expand the latest `resources/read` entry in **History** to see the actual server response; or use Inspector CLI mode (`npx @modelcontextprotocol/inspector --cli node dist/index.js --method resources/read --uri atc://timeline`).
>
> 2. **Tools pane — optional `string[]` arrays default to `{}` instead of `[]`.** For `submit_flight`, the optional `dependencies` field is rendered in form mode but serialized as `{}` on submit, which fails our strict schema with `expected: "array", received: "object"`. **Workaround:** in the `dependencies` row, click **Add Item** (the field flips to a `[""]` array), then click **Remove** on the new empty row. The field is now an empty array and the call succeeds. (If you want a non-empty array, click **Add Item** and type the predecessor flight number instead.) Same procedure applies to `cancel_flight` if you need it.

---

### Option B — Claude Desktop (or another MCP host)

Edit the Claude Desktop config file at:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json` (typically `C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`)

Add the `atc` entry below. Replace the path inside `args` with the **absolute path** to `dist/index.js` on your machine — keep forward slashes even on Windows (or escape backslashes as `\\`). The `env` block is required because Claude Desktop only forwards a small safe-list of OS variables (`PATH`, `HOME`, etc.) to spawned MCP servers; `ATC_*` exports from your shell are **not** inherited.

```json
{
  "mcpServers": {
    "atc": {
      "command": "node",
      "args": ["/absolute/path/to/task-4/server/dist/index.js"],
      "env": {
        "ATC_RUNWAY_LENGTHS_M": "2500,3500",
        "ATC_GATE_COUNT": "4",
        "ATC_GROUND_CREW_COUNT": "2",
        "ATC_LANDING_DURATION_MIN": "5",
        "ATC_TAKEOFF_DURATION_MIN": "4",
        "ATC_GATE_TURNAROUND_MIN": "30",
        "ATC_SEPARATION_TAKEOFF_MIN": "2",
        "ATC_SEPARATION_LANDING_MIN": "2",
        "ATC_SEPARATION_MIXED_MIN": "3",
        "ATC_DEPENDENCY_BUFFER_MIN": "15",
        "ATC_MAX_HORIZON_MIN": "240"
      }
    }
  }
}
```

Restart Claude Desktop. The six ATC tools and three `atc://` resources will appear under the server. To validate the three scenarios from this client, ask Claude to walk through them as described in [Validate the three scenarios](#validate-the-three-scenarios) — same tool calls, same expected responses; the chat UI replaces the Inspector's panes.

For other MCP hosts (custom agents, third-party tools), reuse the same `command` + `args` + `env` shape in whatever config format they accept.

---

### Option C — Claude Code or VS Code GitHub Copilot (zero-config in this repo)

This repository ships a project-scoped [`.mcp.json`](../.mcp.json) at the workspace root that pre-registers `atc` with the same env block as Option B. Both Claude Code and VS Code GitHub Copilot auto-discover it. **No host config to edit; no shell exports needed.**

**Common prerequisites — read these first; skipping any of them is the most common reason `atc` fails to appear:**

1. The server is built. Run steps 1–2 of [Quick start](#quick-start) (`npm install && npm run build` inside `task-4/server/`). Step 3 (the shell `export`s) is **not** needed — `.mcp.json` supplies the env block when the host spawns the server.
2. Open / launch the host from the **repository root** — the folder that contains `.mcp.json`. The `args` path in `.mcp.json` is relative (`task-4/server/dist/index.js`), so starting from anywhere else makes `node` fail to find the script. If you need to launch from elsewhere, change `args` in `.mcp.json` to an absolute path.

#### C.1 — Claude Code

Also requires the [Claude Code CLI](https://docs.claude.com/en/docs/agents/claude-code) installed and on your `PATH` (`claude --version` resolves).

```bash
cd /path/to/ai-challenge   # the workspace root, where .mcp.json lives
claude
```

On first launch in this workspace, Claude Code prompts you to approve the project-scoped MCP server (`atc`). Accept the prompt. The six `atc` tools and three `atc://` resources become callable from chat — ask Claude to walk through the scenarios in [Validate the three scenarios](#validate-the-three-scenarios) and it will invoke them through the server. Tool calls and resource reads appear inline in the chat transcript with their JSON responses.

#### C.2 — VS Code GitHub Copilot

Requires VS Code with the GitHub Copilot Chat extension and MCP support enabled (VS Code 1.102+). Open the repository root as the workspace folder, then open Copilot Chat in **Agent** mode. VS Code discovers `.mcp.json` automatically and will prompt to trust / start the `atc` server on first use. Once trusted, the six `atc` tools appear in the chat tool picker — ask Copilot to walk through the scenarios in [Validate the three scenarios](#validate-the-three-scenarios) and it will invoke them. Tool calls and their JSON responses appear inline in the chat transcript.

> **Note — reading MCP resources in Copilot Chat.** The Copilot agent can autonomously invoke MCP **tools**, but in current builds it does not always invoke MCP **resources** on its own. If the agent ignores requests like "read `atc://timeline`", attach the resource manually: in the Copilot Chat input, click **Add Context…** → **MCP Resources…**, pick the `atc` server, and select `atc://queue`, `atc://timeline`, or `atc://runways`. The resource payload is attached to your next message so the agent can reason over it.
>
> [Attaching an MCP resource via Add Context… → MCP Resources… in VS Code GitHub Copilot Chat](./gh-copilot-resources.png)

---

## Validate the three scenarios

The three scenarios below are the validation walkthroughs from the task brief. Run each one by hand: open the **Tools** tab (Option A) or the chat (Options B and C), call the listed tool with the listed arguments, then check the response and the listed resources against the **Expected result** column. Each scenario starts with `reset_state` so they can be performed in any order on a single session.

#### Scenario 1 — Morning Rush

Verifies basic scheduling of mixed arrivals and departures with priority contention.

| Step | Tool / Resource | Arguments | Expected result |
| --- | --- | --- | --- |
| 1 | `reset_state` | `{}` | `cleared: true` |
| 2 | `submit_flight` | `{ "flight_number": "HA1", "operation": "arrival",   "priority": "high"   }` | `accepted: true`, `submission_index: 0` |
| 3 | `submit_flight` | `{ "flight_number": "MD1", "operation": "departure", "priority": "medium" }` | `accepted: true`, `submission_index: 1` |
| 4 | `submit_flight` | `{ "flight_number": "LA1", "operation": "arrival",   "priority": "low"    }` | `accepted: true`, `submission_index: 2` |
| 5 | `submit_flight` | `{ "flight_number": "LD1", "operation": "departure", "priority": "low"    }` | `accepted: true`, `submission_index: 3` |
| 6 | `generate_schedule` | `{}` | `schedule.scheduled.length === 4`, `schedule.unscheduled.length === 0` |
| 7 | read `atc://timeline` | — | No two `runway_window`s overlap on the same `runway_id`; no two `gate_window`s overlap on the same `gate_id`; `HA1.start_offset_min ≤ LA1.start_offset_min` and `MD1.start_offset_min ≤ LD1.start_offset_min`. |
| 8 | read `atc://queue` | — | All four flights show `state: "scheduled"`. |

#### Scenario 2 — Heavy Hauler

Verifies that a flight whose `min_runway_length_m` exceeds every configured runway remains unscheduled with the right reason, while other flights still schedule.

| Step | Tool / Resource | Arguments | Expected result |
| --- | --- | --- | --- |
| 1 | `reset_state` | `{}` | `cleared: true` |
| 2 | `submit_flight` | `{ "flight_number": "HVY1", "operation": "departure", "priority": "high", "min_runway_length_m": 9999 }` | `accepted: true` |
| 3 | `submit_flight` | `{ "flight_number": "OK1",  "operation": "arrival",   "priority": "medium" }` | `accepted: true` |
| 4 | `submit_flight` | `{ "flight_number": "OK2",  "operation": "departure", "priority": "low"    }` | `accepted: true` |
| 5 | `generate_schedule` | `{}` | `unscheduled` contains `HVY1` with `reason: "no_compatible_runway"`; `scheduled` contains `OK1` and `OK2`. |
| 6 | `get_airport_status` | `{}` | `constraints.runway_blocking === true`; `blocked_flights` lists `HVY1`. |

#### Scenario 3 — Connecting Flight

Verifies dependency handling (predecessor → dependent with the configured dependency buffer) and the auto-regeneration that follows a cancellation.

| Step | Tool / Resource | Arguments | Expected result |
| --- | --- | --- | --- |
| 1 | `reset_state` | `{}` | `cleared: true` |
| 2 | `submit_flight` | `{ "flight_number": "A", "operation": "arrival",   "priority": "high"   }` | `accepted: true` |
| 3 | `submit_flight` | `{ "flight_number": "B", "operation": "departure", "priority": "medium", "dependencies": ["A"] }` | `accepted: true` |
| 4 | `generate_schedule` | `{}` | Both `A` and `B` appear in `scheduled`; `B.start_offset_min ≥ A.end_offset_min + ATC_DEPENDENCY_BUFFER_MIN`. |
| 5 | read `atc://timeline` | — | `A` precedes `B`. |
| 6 | `analyze_bottleneck` | `{}` | `bottleneck_exists: true`, `chain_length: 2`, `chain[0].flight_number === "A"`, `chain[1].flight_number === "B"`. |
| 7 | `cancel_flight` | `{ "flight_number": "A" }` | Response carries a fresh `schedule` in which `B` appears under `unscheduled` with `reason: "dependency_cancelled"` and `blocking_flight_number: "A"` — no follow-up `generate_schedule` is required. |

### Drop-in evaluator prompt (Options B and C)

Paste the block below verbatim into Claude Desktop (Option B), Claude Code (Option C.1), or VS Code GitHub Copilot Chat in Agent mode (Option C.2) as a single message. The host will invoke the `atc` MCP server step by step and report PASS/FAIL for each assertion. Each scenario starts with `reset_state` so order does not matter.

```text
Use the `atc` MCP server tools and resources to walk through the three validation scenarios below. For each numbered step, call the tool / read the resource exactly as listed, then verify the assertion. Print one line per step in the form "Step N — PASS|FAIL: <observed>".

Scenario 1 — Morning Rush
1. Call reset_state. Assert: cleared === true.
2. Call submit_flight { flight_number: "HA1", operation: "arrival",   priority: "high"   }. Assert: accepted === true, submission_index === 0.
3. Call submit_flight { flight_number: "MD1", operation: "departure", priority: "medium" }. Assert: submission_index === 1.
4. Call submit_flight { flight_number: "LA1", operation: "arrival",   priority: "low"    }. Assert: submission_index === 2.
5. Call submit_flight { flight_number: "LD1", operation: "departure", priority: "low"    }. Assert: submission_index === 3.
6. Call generate_schedule. Assert: schedule.scheduled.length === 4 AND schedule.unscheduled.length === 0.
7. Read resource atc://timeline. Assert: for every pair of operations on the same runway_id, their runway_window intervals do not overlap; same for gate_id / gate_window. AND HA1.start_offset_min <= LA1.start_offset_min AND MD1.start_offset_min <= LD1.start_offset_min.
8. Read resource atc://queue. Assert: every flight has state === "scheduled".

Scenario 2 — Heavy Hauler
1. Call reset_state. Assert: cleared === true.
2. Call submit_flight { flight_number: "HVY1", operation: "departure", priority: "high", min_runway_length_m: 9999 }. Assert: accepted === true.
3. Call submit_flight { flight_number: "OK1",  operation: "arrival",   priority: "medium" }. Assert: accepted === true.
4. Call submit_flight { flight_number: "OK2",  operation: "departure", priority: "low"    }. Assert: accepted === true.
5. Call generate_schedule. Assert: HVY1 appears in unscheduled with reason === "no_compatible_runway" AND OK1, OK2 appear in scheduled.
6. Call get_airport_status. Assert: constraints.runway_blocking === true AND blocked_flights contains HVY1.

Scenario 3 — Connecting Flight
1. Call reset_state. Assert: cleared === true.
2. Call submit_flight { flight_number: "A", operation: "arrival",   priority: "high" }. Assert: accepted === true.
3. Call submit_flight { flight_number: "B", operation: "departure", priority: "medium", dependencies: ["A"] }. Assert: accepted === true.
4. Call generate_schedule. Assert: both A and B appear in scheduled AND B.start_offset_min >= A.end_offset_min + 15 (the ATC_DEPENDENCY_BUFFER_MIN configured in .mcp.json / env).
5. Read resource atc://timeline. Assert: A appears before B in operations order.
6. Call analyze_bottleneck. Assert: bottleneck_exists === true AND chain_length === 2 AND chain[0].flight_number === "A" AND chain[1].flight_number === "B".
7. Call cancel_flight { flight_number: "A" }. Assert: the response carries a schedule where B is under unscheduled with reason === "dependency_cancelled" and blocking_flight_number === "A" — without a follow-up generate_schedule.

Finish with a summary line: "Total: <passed>/<total> scenarios PASS".
```
