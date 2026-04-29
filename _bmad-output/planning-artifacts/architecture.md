---
stepsCompleted: [1, 2, 4, 6, 7, 8]
skippedSteps: [3, 5]
inputDocuments:
  - docs/prompts/create-architecture.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/research/technical-task-1-leaderboard-technical-decisions-research-2026-04-28.md
  - task-1/extraction/sanitized/api-shapes.json
  - task-1/extraction/sanitized/behaviors.md
  - task-1/extraction/index.md
workflowType: 'architecture'
project_name: 'ai-challenge'
user_name: 'Pavel.Shakhlovich'
date: '2026-04-29'
lastStep: 8
status: 'complete'
completedAt: '2026-04-29'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Runtime Model

The runtime is a static, single-page React app: no backend, no router, no persistence, and no runtime data APIs. Browser state is temporary UI state only.

### Requirements Overview

**Functional Requirements:**
The PRD defines 20 functional requirements across leaderboard display, filtering/search, row expansion, synthetic data, and submission artifacts. Architecturally, this is a single static leaderboard SPA that must group synthetic activity records by `Employee GUID`, calculate total score from `ActivityPoints`, derive per-category stats, sort employees by descending score, and render the full filtered result set without pagination.

**Non-Functional Requirements:**
The 11 NFRs are dominated by privacy, static deployment, responsive usability, basic accessibility, and build correctness. The browser runtime must contain only synthetic data, make no SharePoint/private-system calls, keep mock-generation libraries out of the client bundle, work under the GitHub Pages base path, and remain readable/usable on desktop and mobile.

**Scale & Complexity:**
This is a low-complexity greenfield static web app with a moderate client-side data transformation pipeline.

- Primary domain: static React/Vite browser SPA
- Complexity level: low
- Estimated architectural components: app shell, filter/search controls, data derivation utilities, podium/list/row/detail rendering, mock-data generation boundary, build/deploy setup

### Technical Constraints & Dependencies

- Runtime is a single-page static app under `task-1/`.
- No backend, router, persistence, authentication, analytics, runtime APIs, or external data integrations are in scope.
- Source data shape follows the sanitized activity CSV fields from `api-shapes.json`.
- Target synthetic scale is about 450 activity records grouped into about 200 employees.
- Filtering, search, sorting, grouping, scoring, category stats, and row expansion all run client-side.
- UX requires custom dropdown behavior with `role="combobox"` and `role="listbox"`, not native `select`.
- Search is local, has no API debounce behavior, and must support empty results.
- Row expansion reveals an activity details table and switches chevron state without observed animation.
- GitHub Pages deployment requires Vite base-path handling.
- Technical research pins React, Vite, TypeScript, Faker, DiceBear, and GitHub Pages action versions.

### Cross-Cutting Concerns Identified

- Privacy and data safety: no copied corporate values, real people, real emails, real photos, or private network calls.
- Client-side derived state: filters/search/sort/grouping must stay consistent from the same bundled activity data.
- Bundle hygiene: Faker and DiceBear generation code must remain dev/build-time only.
- Accessibility semantics: search, dropdowns, and expand/collapse controls need clear keyboard/browser semantics.
- Responsive layout: leaderboard rows, podium, filters, and expanded table must not overlap or overflow incoherently.
- Deployment path correctness: asset URLs must work from the GitHub Pages repository base path.

## Core Architectural Decisions

### ADR 1: Import Generated JSON From App Source

**Decision:** Generate activity and avatar data before build and import the generated JSON files from app source instead of fetching them from `public/`.

**Invariant:** All leaderboard data is bundled with the app; runtime code performs no data fetch.

**Consequences:** Vite includes the data in the static build, implementation can type-check the imported shapes, and there is no runtime URL path for data loading.

### ADR 2: Keep Mock Generation Outside Runtime

**Decision:** Use Faker and DiceBear only in a generation script outside the React runtime entry tree. The script writes generated activity records and a generated avatar data-URI map keyed by `Employee GUID` into `src/data/`.

**Invariant:** Mock-generation packages are dev/build-time dependencies only.

**Consequences:** The browser bundle does not include Faker or DiceBear generation code, avatars do not require separate generated asset files, and implementation has a clear boundary between data generation and app rendering.

### ADR 3: Use One Derived Leaderboard Pipeline

**Decision:** Implement one pure derivation pipeline that takes activity records plus UI state and returns ranked employee view models.

**Invariant:** The grouping key is `Employee GUID`, and totals are summed from `ActivityPoints`.

**Consequences:** Podium, list rows, totals, category stats, and expanded details use the same derived result instead of duplicating grouping/filtering logic across components.

### ADR 4: Filter Activities Before Scoring

**Decision:** Apply year, quarter, and category filters to activity records before computing employee totals and category stats. Then remove employees with no matching activities, apply search to employee display fields, and sort by filtered score descending. This is an implementation choice for internal score/detail consistency; the extraction confirms local filtering but does not prove whether the source widget recalculated totals from filtered activities.

**Invariant:** Scores, category stats, and expanded activity rows reflect the active filters.

**Consequences:** Filtered views remain internally consistent. Search changes visibility only; it does not change how matching employees' scores are calculated.

### ADR 5: Use Lifted Local React State Only

**Decision:** Store selected filters, search query, and expanded row id in the leaderboard widget with React state. Filter dropdowns and search are controlled by the widget; row expansion is dispatched up from each leaderboard row. Do not add context, Redux, Zustand, or React Query.

**Invariant:** UI state is browser-only and is not persisted.

**Consequences:** State ownership stays obvious for a one-page app, and implementation avoids unnecessary shared-state infrastructure.

### ADR 6: Allow One Expanded Row

**Decision:** Store a single expanded `Employee GUID` or `null`. This is an implementation choice for predictability; the extraction captures expanded-row structure but does not establish whether the source allowed multiple rows open.

**Invariant:** At most one employee activity table is expanded at a time.

**Consequences:** Expansion behavior is simple, predictable, and avoids managing multiple open activity tables in a long list.

### ADR 7: Set Vite Base To Repository Path

**Decision:** Configure Vite `base` to `/<repo-name>/` to match the GitHub Pages repository path. Current deploy target: `/ai-challenge-vention/` (repo: `Altmerian/ai-challenge-vention`).

**Invariant:** Built asset URLs must resolve correctly from the deployed GitHub Pages URL.

**Consequences:** The production build works from GitHub Pages without adding routing or runtime path logic.

## Project Structure & Boundaries

### Tech Stack Snapshot

Use the pinned React/Vite/TypeScript stack from the technical research. Faker and DiceBear are generation-time only; they do not enter the browser runtime.

| Area | Decision |
|---|---|
| Runtime | React `19.2.5`, React DOM `19.2.5` |
| Build | Vite `8.0.10`, `@vitejs/plugin-react` `6.0.1`, TypeScript `6.0.3` |
| Mock generation | `@faker-js/faker` `10.4.0`, `@dicebear/core` `9.4.2`, `@dicebear/collection` `9.4.2` |
| Deployment | GitHub Pages static deployment from Vite `dist` |

### Logical Source Boundaries

All Task-1 app work lives under `task-1/<app>/`.

- `src/components/`: leaderboard UI composition, including header, filters, search, podium, rows, expansion, empty-result placeholder, and activity details.
- `src/data/`: generated static JSON consumed by the app, including activity records and avatar data URIs.
- `src/utils/`: pure data derivation pipeline for grouping, filtering, scoring, sorting, and category stats.
- `src/types/`: activity record and derived leaderboard view-model types.
- `src/assets/`: hand-authored runtime-safe visual assets only if implementation needs them; generated avatars live in `src/data/`.
- `scripts/`: mock-data generation code that may import Faker/DiceBear and write generated output into `src/data/`.
- `dist/`: Vite build output; not source-owned architecture.

### Runtime And Generation Boundary

The React runtime imports generated data from `src/data/` and derives all visible leaderboard state in memory. The generation script is outside the runtime entry tree and is the only place where Faker or DiceBear may be imported.

### Data Flow

`activity records` -> `filter by year/quarter/category` -> `group by Employee GUID` -> `derive employee totals/category stats/activity rows` -> `remove employees with no matching activities` -> `search employee display fields` -> `sort by score descending` -> `render podium/list/details or empty state`.

### Build And Deploy

Configure Vite `base` to `/<repo-name>/`; current deploy target is `/ai-challenge-vention/`. `npm run build` produces `dist`, and GitHub Pages deploys that static output through GitHub Actions.

### Testing Approach

Keep tests minimal. Unit-test the pure data pipeline: grouping by `Employee GUID`, score summing, category stats, filter behavior, search behavior, and score sorting. Use browser verification with `playwright-cli` for desktop/mobile rendering, filters/search, row expansion, production preview, and console-error checks.

### Accessibility And Responsive Boundary

Use semantic browser controls where possible, and preserve the observed custom dropdown contract with `role="combobox"` and `role="listbox"`. Search and expand/collapse controls must have clear labels or semantics. Layout implementation must prevent overlapping or incoherent overflow across desktop and mobile viewports.

## Open Questions / Assumptions

### Open Questions

None at this time.

### Assumptions

- Activity filters recalculate employee totals and category stats from matching activities; this is a deliberate consistency choice, not directly proven by the extraction.
- Row expansion is single-open; this is a deliberate predictability choice, not directly proven by the extraction.
- Generated avatars are stored as data URI strings in JSON under `src/data/`, keyed by `Employee GUID`.
- `LeaderboardList` owns the empty-result placeholder when the derived employee list is empty.

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**
The decisions are compatible: static bundled JSON, dev/build-time mock generation, pure in-memory derivation, lifted React state, single-open expansion, and GitHub Pages static deployment all support the same static SPA model. The pinned React/Vite/TypeScript stack is coherent with generated JSON imports and Vite `base` configuration.

**Structure Alignment:**
The logical structure supports the decisions without over-specifying files. Runtime code has clear homes for components, generated data, avatar data URIs, types, and pure derivation logic. The `scripts/` boundary keeps Faker and DiceBear outside the runtime entry tree.

**Data Flow Consistency:**
The document consistently commits to activity-level filtering before scoring as an implementation choice. This keeps filtered totals, category stats, and expanded activity rows aligned.

### Requirements Coverage Validation

**Functional Requirements Coverage:**
All FR groups have an architectural home: leaderboard display lives in `src/components/` plus derived employee view models; filtering/search/sorting live in the pure derivation pipeline; row expansion uses lifted single-open `Employee GUID | null` state; synthetic data comes from the generation script plus bundled JSON; and submission/deployment is covered by Vite build plus GitHub Pages static deploy.

**Non-Functional Requirements Coverage:**
NFR1-NFR3 are covered by synthetic bundled data and no runtime private calls. NFR4 is covered by local in-memory derivation at the target scale. NFR5 is covered by the generation/runtime boundary. NFR6-NFR9 are covered by responsive and semantic UI boundaries. NFR10-NFR11 are covered by Vite build and GitHub Pages base-path decisions.

### Implementation Readiness Validation

**Decision Completeness:**
The document contains the implementation-affecting decisions needed before coding: data delivery, avatar persistence, generation boundary, derivation pipeline, filter order, local state model, expansion model, and deployment base path.

**Structure Completeness:**
The structure is intentionally logical, not file-by-file, matching the Task-1 prompt. It gives implementation agents enough boundary guidance without turning into a detailed scaffold.

**Pattern Completeness:**
The main conflict points are resolved: no runtime fetch, no external store, no mock-generation packages in the browser, one derived pipeline, one expansion state, generated avatars in data JSON, empty-result ownership, and deploy-path handling.

### Gap Analysis Results

No critical gaps found.

### Validation Issues Addressed

- Added the required Open Questions / Assumptions section.
- Made avatar persistence concrete: generated data URI map in `src/data/`.
- Labeled activity-level score recalculation and single-open expansion as implementation choices where extraction did not prove source behavior.
- Clarified state ownership for filters, search, and row expansion.
- Removed repository rename history from ADR 7 while keeping the current deploy target.
- Split DiceBear package names in the tech stack table.
- Assigned empty-result rendering to `LeaderboardList`.

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Implementation Handoff:**
Implementation agents should follow the ADRs as the source of truth for architecture decisions, use the PRD and UX spec for behavior and visual requirements, and keep generated data/runtime app code separated.
