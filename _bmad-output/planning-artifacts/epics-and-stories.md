---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - docs/prompts/create-epics-and-stories.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/research/technical-task-1-leaderboard-technical-decisions-research-2026-04-28.md
  - task-1/extraction/sanitized/api-shapes.json
  - task-1/extraction/sanitized/behaviors.md
workflowType: epics-and-stories
project_name: ai-challenge
task: Task 1
status: final
date: 2026-04-29
---

# Task 1 Epics And Stories

## Execution Order

1. Story 1.1: Scaffold the static app and build path
2. Story 1.2: Generate privacy-safe leaderboard data
3. Story 1.3: Derive ranked employee leaderboard models
4. Story 1.4: Render the leaderboard shell and ranked list
5. Story 1.5: Add local filters, search, and empty results
6. Story 1.6: Add row expansion and activity details
7. Story 1.7: Publish and document the final submission

## Cross-Cutting NFR Notes

- NFR1-NFR3: all stories must preserve public-safety constraints: synthetic data only, no copied corporate/private values, and no private system calls.
- NFR4: filter, search, row expansion, and data derivation must run client-side for the target dataset without visible loading states.
- NFR5: Faker and DiceBear belong only to generation-time code, not the browser runtime bundle.
- NFR6-NFR7: visible UI stories must be verified on desktop and mobile so text and controls remain readable without incoherent overflow.
- NFR8-NFR9: search, filters, and expand/collapse controls need standard browser operability plus clear labels or recognizable semantics.
- NFR10-NFR11: the app must build successfully and serve correctly from the GitHub Pages base path.

## Epic 1: Task 1 Leaderboard Clone

Goal: Build, verify, deploy, and document the static React/Vite Company Leaderboard clone as one linear solo-agent implementation.

### Story 1.1: Scaffold the static app and build path

**Goal:** Give the implementation agent a TypeScript React/Vite app that builds as static GitHub Pages output.

**Scope:**

- Create the Task 1 app source area with the pinned React, Vite, TypeScript, and npm baseline from the technical research.
- Configure package scripts for local development and production build.
- Configure the Vite GitHub Pages base path for the current repository target.
- Render a minimal leaderboard root section so the static build has a visible app entry.
- Keep the app single-page: no router, backend, auth, persistence, analytics, or runtime API setup.

**PRD coverage:** FR18; NFR10, NFR11

**Touch points:** Task 1 app package, build configuration, app entry, root leaderboard shell.

**Acceptance criteria:**

- `npm run build` completes from the Task 1 app source area.
- The production build emits static assets with URLs compatible with the configured GitHub Pages base path.
- The app renders a single leaderboard root section in a browser.
- No backend, router, persistence, auth, analytics, or runtime API dependency is introduced.

**Dependencies:** None

### Story 1.2: Generate privacy-safe leaderboard data

**Goal:** Provide public-safe synthetic activity records and avatars shaped like the sanitized source data.

**Scope:**

- Generate about 450 synthetic activity records grouped into about 200 synthetic employees.
- Include the sanitized activity fields: activity id, employee display fields, activity date, email, category, employee id, points, and activity title.
- Generate deterministic synthetic avatars keyed by employee identity.
- Write generated records and avatar data into bundled app data.
- Keep Faker and DiceBear generation code outside the React runtime entry tree.

**PRD coverage:** FR14, FR17; NFR1, NFR3, NFR5

**Touch points:** Mock-data generation boundary, generated app data, source data types.

**Acceptance criteria:**

- Generated activity records include every sanitized CSV field with plausible synthetic values.
- The generated dataset is close to the target scale and contains no real corporate names, emails, titles, units, photos, activity titles, or copied SharePoint values.
- Avatars are deterministic, synthetic, and available to the app without runtime external calls.
- Browser runtime code imports generated data only and does not import Faker or DiceBear packages.

**Dependencies:** Story 1.1

### Story 1.3: Derive ranked employee leaderboard models

**Goal:** Transform activity records into ranked employee view models consistently for podium, rows, filters, and details.

**Scope:**

- Define source activity and derived employee leaderboard models.
- Group activity records by employee identity.
- Preserve representative employee display fields from grouped records.
- Sum activity points into total score.
- Derive category counts and activity detail rows from grouped activities.
- Sort employees by descending score after applicable activity filters.
- Add minimal checks for grouping, score totals, category stats, filtering, search, and sorting behavior.

**PRD coverage:** FR3, FR15, FR16; NFR4

**Touch points:** Leaderboard data utilities, source and derived data types, minimal data-pipeline checks.

**Acceptance criteria:**

- Multiple records for the same employee produce one employee model keyed by employee identity.
- Employee total score equals the sum of grouped activity points.
- Category stats reflect grouped activity categories.
- Derived employee output is sorted by descending score.
- Data-pipeline checks cover the main transformation and filtering rules without adding an excessive test suite.

**Dependencies:** Story 1.2

### Story 1.4: Render the leaderboard shell and ranked list

**Goal:** Display the core leaderboard page with header, podium, and the full ranked employee list.

**Scope:**

- Render the major regions in observed order: header, filter bar area, search area, podium, ranked employee list.
- Show a header with title and one subtitle paragraph.
- Render the podium for the top three employees, visually ordered as rank 2, rank 1, rank 3.
- Render employee rows with rank, circular avatar, name, title/unit line, category stats, total score, and expand button placeholder.
- Render the full filtered employee list with no pagination, load-more, sort controls, or infinite scroll.
- Keep desktop and mobile layouts readable without overlapping controls or text.

**PRD coverage:** FR1, FR2, FR4; NFR6, NFR7, NFR9

**Touch points:** Leaderboard widget, header, podium, ranked list, row summary, category stats, score display, responsive styling.

**Acceptance criteria:**

- The page structure matches the observed leaderboard order.
- The top three employees appear in podium cards with avatar, rank, name, title line, and score.
- Every visible employee row includes rank, avatar, name, title/unit, category stats, total score, and an expand control.
- The full current employee set renders without pagination or load-more controls.
- Desktop and mobile browser checks show no incoherent text/control overlap.

**Dependencies:** Story 1.3

### Story 1.5: Add local filters, search, and empty results

**Goal:** Allow reviewers to filter and search the leaderboard without network calls or page reloads.

**Scope:**

- Implement three custom dropdown filters for year, quarter, and category.
- Preserve the observed custom control contract: combobox trigger and listbox popup.
- Provide the observed option counts: 2 years, 5 quarters, and 4 categories.
- Apply year, quarter, and category filters to activity records before scoring and category stats.
- Add a local search box with search icon, placeholder `Search employee...`, and searchbox semantics.
- Apply search to already-loaded employee display fields.
- Render an empty-result state when active filters/search match no employees.

**PRD coverage:** FR5, FR6, FR7, FR8, FR9, FR10; NFR2, NFR4, NFR8, NFR9

**Touch points:** Filter bar, custom dropdowns, search box, leaderboard state owner, derived data pipeline, empty state.

**Acceptance criteria:**

- Selecting year, quarter, or category updates visible employees and recalculated scores/category stats client-side.
- Search updates visible employees locally without debounce-backed API behavior or network calls.
- Dropdown triggers expose combobox semantics and open listbox option popups.
- The search input exposes searchbox semantics and the expected placeholder.
- A clear empty state appears when filters/search match no employees.

**Dependencies:** Story 1.4

### Story 1.6: Add row expansion and activity details

**Goal:** Let reviewers expand one employee row at a time and inspect the activity records behind the score.

**Scope:**

- Toggle row expansion with a circular expand button.
- Use a down chevron for collapsed rows and an up chevron for expanded rows.
- Keep at most one employee row expanded at a time.
- Show expanded details immediately, without visible height animation.
- Render an activity details section with title and table columns for activity title, category, date, and points.
- Ensure detail rows reflect the selected employee's currently filtered activities.

**PRD coverage:** FR11, FR12, FR13; NFR4, NFR6, NFR7, NFR8, NFR9

**Touch points:** Row summary, expand button, expanded activity table, leaderboard expansion state, responsive detail layout.

**Acceptance criteria:**

- Clicking an employee expand control reveals that employee's activity details.
- Clicking the expanded row control collapses the details.
- Expanding a different row closes the previously expanded row.
- Activity details show title, category, date, and points from grouped activity records.
- Keyboard/browser interaction and mobile layout remain usable for expansion and details.

**Dependencies:** Story 1.5

### Story 1.7: Publish and document the final submission

**Goal:** Make the clone reviewable through GitHub Pages and document the required Task 1 implementation approach.

**Scope:**

- Add the GitHub Pages deployment flow for the Vite static build.
- Produce the required Task 1 report covering implementation approach, AI/tooling usage, data extraction/sanitization, mock data generation, and deployment.
- Verify the production-style build on desktop and mobile.
- Verify filters, search, row expansion, and empty state in the production-style build.
- Check for console errors and accidental runtime calls to private/corporate systems.
- Confirm public-safe synthetic content before publishing.

**PRD coverage:** FR19, FR20; NFR1, NFR2, NFR3, NFR10, NFR11

**Touch points:** Deployment workflow, production build configuration, public GitHub Pages settings, Task 1 report, final browser verification.

**Acceptance criteria:**

- GitHub Pages serves the built app at the expected public URL.
- The production-style build works under the configured base path.
- The Task 1 report exists and covers implementation, AI/tooling usage, data replacement/sanitization, and deployment.
- Browser verification passes for desktop/mobile load, filters/search, row expansion, empty state, and no console errors.
- Final content contains no real corporate or private data and makes no runtime private-system calls.

**Dependencies:** Story 1.6
