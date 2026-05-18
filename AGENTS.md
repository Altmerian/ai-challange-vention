# AI Agent Guide

This file provides guidance to AI Agents when working with code in this workspace.
Check the `README.md` for task-specific files for more details on the task you are working on.

- [Task 1 - "Vibe coding"](./task-1/README.md)
- [Task 2 - "Prototyping with Lovable"](./task-2/README.md)
- [Task 3 - "Workflowing with n8n"](./task-3/README.md)
- [Task 4 - "MCPing"](./task-4/README.md)

---

## General Guidelines

When working on any task, use only task-specific folders. Store all your work, including code, notes, and any other files, within the respective task folder (e.g., `task-1/`, `task-2/`, etc.). The root directory serves as a common workspace and should not contain task-specific files.

- use agent files from the specific task folder (e.g., `task-4/AGENTS.md` and @task-4/CLAUDE.md for Task 4) for task-specific guidance. The root `AGENTS.md` provides general guidelines applicable to all tasks but may not contain task-specific instructions.

## Extraction and Sanitization

When working with corporate and private data extraction tasks, follow the principles of data minimization and privacy. Only extract the necessary information required for the task, and ensure that any personally identifiable information (PII) is properly sanitized before storage, sending to AI tools, or sharing.

## Available Tools

Check the list of available tools and skills before starting your task.

### Playwright CLI skill

You have access to `Playwright` browser automation tools via the `playwright-cli` skill.
**ALWAYS** invoke `playwright-cli` skill for frontend changes development, debugging, and verification, and for any task that requires browser interaction.

## Agent skills

### Issue tracker

GitHub Issues at `Altmerian/ai-challenge-vention` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical role names used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: per-task `CONTEXT.md` + `docs/adr/` under the active task folder (`task-4/`). `task-1/`–`task-3/` are complete and excluded. Root `CONTEXT-MAP.md` is created lazily by `/grill-with-docs`. See `docs/agents/domain.md`.
