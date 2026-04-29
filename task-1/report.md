# Task 1 — "The Clone Wars" Submission Report

## Overview

A public-safe static React/Vite clone of an internal Vention leaderboard widget,
built end-to-end with AI-driven planning, extraction, generation, and development.
Single-page app, no backend, no runtime data fetching.

- **Live URL:** https://altmerian.github.io/ai-challenge-vention/
- **Source:** [`task-1/app/`](./app/)
- **Hosting:** GitHub Pages

## Implementation Approach

- **Stack:** React 19.2.5 + Vite 8.0.10 + TypeScript 6.0.3, Vitest 4.1.5 for unit tests.
- **Architecture:** static SPA — no router, no auth, no analytics, no persistence,
  no service worker, no runtime data API. State is lifted React state inside
  `LeaderboardWidget`; all data is bundled JSON imported directly by components.
- **Single derived pipeline:** raw `employees.json` + `activities.json` → filter
  by year/quarter/category → score → sort → rank → render. The same selector
  drives the podium, the ranked list, and the empty state.
- **Vite `base`:** pinned to `/ai-challenge-vention/` to match the GitHub Pages
  project URL; never parameterized per environment.

## AI / Tooling Usage

- **IDE:** VS Code with Copilot, Codex CLI, Claude Code CLI agents.
- **BMad Method skills**:
  - Planning: technical research → PRD → architecture → epics + stories →
    sprint planning.
  - Per-story: `create-story` → `dev-story` (red-green TDD) → `code-review`
- **Models used:** GPT-5.5 Codex (extraction, generation script, scaffold) and
  Claude Opus / Sonnet (planning, story authoring, dev + review on later stories).
  Per-story usage is recorded in each story file's *Agent Model Used* section.
- **Browser verification:** the `playwright-cli` skill drove DOM snapshots,
  dropdown probes, and console/network inspection on every UI-impacting story.

## Data Extraction and Sanitization

- The internal leaderboard widget was inspected via Playwright against the
  authenticated SharePoint host: DOM, computed styles, dropdown open states,
  expanded-row structure, and network responses were captured.
- All captures were **sanitized in place** before being committed to
  `task-1/extraction/sanitized/`:
  - Real corporate text replaced with placeholder tokens
    (`__TEXT_SHORT_*__`, `__TEXT_MED_*__`, `__GUID_*__`, etc.).
  - Real avatar imagery dropped or replaced with a blurred reference image.
  - SharePoint hostnames and tenant identifiers removed.
- Extraction index: [`task-1/extraction/index.md`](./extraction/index.md).
  Behavior contract for filters, search, expansion, sorting, pagination, and
  scoring lives in [`extraction/sanitized/behaviors.md`](./extraction/sanitized/behaviors.md).

## Mock Data Generation

- Generation script: `task-1/app/scripts/generate-leaderboard-data.mjs`
  (run via `npm run generate:data`).
- **Faker** (`@faker-js/faker`) produces synthetic employee records, activity
  titles, categories, dates, and points; **DiceBear** (`@dicebear/core` +
  `@dicebear/collection`) produces deterministic SVG avatars keyed by employee
  GUID, baked into the generated JSON as data-URIs.
- Both Faker and DiceBear are **devDependencies only**; no runtime React code
  imports them. The runtime tree consumes the pre-generated `src/data/*.json`
  files directly, so the published bundle contains zero generation libraries.
- Output: 200 employees, 6,400 activities across 2 years × 4 quarters
  × 4 categories (Learning / Mentorship / Speaking / Community).

## Build and Deployment

- **Local build:** `npm run build` (= `tsc -b && vite build`) from `task-1/app/`.
  Outputs `dist/` ready for static hosting.
- **GitHub Pages workflow:** [`.github/workflows/deploy-task-1-pages.yml`](../.github/workflows/deploy-task-1-pages.yml).

## Verification

Run from `task-1/app/`:

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm run test` | 14/14 pass (Vitest) |
| Type check | `npm run typecheck` | clean |
| Production build | `npm run build` | clean (single 1.16 MB JS chunk = bundled data, expected per ADR 1) |
| Local preview | `npm run preview` | served at `http://localhost:4173/ai-challenge-vention/` |

Browser verification via `playwright-cli` (desktop 1280×800 + mobile 390×844):

- Header, filter bar, search box, 3 podium cards, 200 ranked rows render.
- Year dropdown shows `All Years`, `2026`, `2025`. Quarter dropdown shows
  `All Quarters`, `Q1`–`Q4`. Category dropdown shows `All Categories` plus
  `Learning`, `Mentorship`, `Speaking`, `Community`.
- Row expansion is single-open: opening a second row collapses the previous
  one. Expand button toggles `aria-expanded` and the chevron flips
  (down → up). The activity details table is a native `<table>` with columns
  `Activity / Category / Date / Points`.
- Empty state renders "No employees match the current filters" when the
  search/filter combination yields no rows.
- Console: zero errors, zero warnings.
- Network: only same-origin assets (`/ai-challenge-vention/assets/index-*.js`,
  `…/index-*.css`). No requests to `*.sharepoint.com`, `*.vention.io`, or
  any other external host.
- Mobile (390 wide): no horizontal page overflow; activity table keeps its
  own internal horizontal scroll wrapper.

The same checks are repeated against the live GitHub Pages URL after deploy.

## Privacy Posture

- No real Vention employee names, photos, titles, units, departments, emails,
  or activity entries appear in any committed artifact under `task-1/`.
- Zero runtime calls to SharePoint, Vention corporate domains, or any
  third-party data API. Only same-origin static assets bundled by Vite are
  loaded by the deployed app.
- `dist/` and bundled JSON were scanned for residual placeholder tokens
  (`__TEXT_*__`, `__GUID_*__`) and corporate domain strings prior to deploy —
  none found.
- Generated synthetic data is the only data the app ever reads.

## References

- [`README.md`](./README.md) — Task 1 entry point.
- [`task-1-vibe-coding.md`](./task-1-vibe-coding.md) — original challenge brief.
- [`extraction/index.md`](./extraction/index.md) — sanitized extraction artifacts.
