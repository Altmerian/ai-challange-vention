---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - task-1/README.md
  - task-1/task-1-vibe-coding.md
  - task-1/extraction/index.md
  - task-1/extraction/sanitized/behaviors.md
  - task-1/extraction/sanitized/api-shapes.json
  - _bmad-output/planning-artifacts/research/technical-task-1-leaderboard-technical-decisions-research-2026-04-28.md
documentCounts:
  productBriefs: 0
  research: 1
  taskDocs: 5
  projectDocs: 0
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: greenfield
releaseMode: single-release
workflowType: 'prd'
---

# Product Requirements Document - ai-challenge Task 1

**Author:** Pavel.Shakhlovich
**Date:** 2026-04-28

## Executive Summary

Build a static React/Vite clone of the internal Company Leaderboard for Task 1. The app must reproduce the observed leaderboard UI and interactions closely enough for challenge review while using only synthetic, privacy-safe data.

The submission must include a public GitHub Pages deployment, application source code under `task-1/`, and a short `report.md` explaining implementation approach, AI/tooling usage, data replacement, and deployment.

### Project Classification

- **Project Type:** Static browser web app / SPA
- **Domain:** General internal challenge app
- **Complexity:** Low
- **Project Context:** Greenfield implementation inside `task-1/`
- **Release Mode:** Single release

## Source Inputs

- Use `task-1/task-1-vibe-coding.md` as the task authority.
- Use `task-1/extraction/index.md` to locate sanitized implementation references.
- Use `task-1/extraction/sanitized/behaviors.md` and `api-shapes.json` for interaction behavior and data shape.
- Use optional sanitized visual references only when implementation needs concrete layout, styling, or open-state detail.
- Use the existing technical decision research for package/deployment/testing direction.

## Success Criteria

### Challenge Success

- Reviewers can open the GitHub Pages URL and recognize the app as a close clone of the original leaderboard.
- The clone supports the observed leaderboard structure, filters, search, ranked rows, row expansion, and activity details.
- The app contains no real corporate or personal data.
- The repository includes source code and `report.md`.

### Technical Success

- App builds as a static React/Vite/TypeScript SPA.
- GitHub Pages serves the production build correctly.
- Runtime makes no calls to SharePoint, corporate systems, or external data APIs.
- Browser verification passes on desktop and mobile with no console errors.

### Measurable Outcomes

- ~200 synthetic employees render before filters/search.
- Approximately 450 synthetic activity records exist before grouping.
- Filters, search, score ordering, and row expansion work client-side.
- `report.md` documents extraction, sanitization, mock data generation, tooling, and deployment.

## Scope

### In Scope

- Leaderboard page matching the observed visual structure.
- Year, quarter, and category filters.
- Client-side search.
- Ranked employee rows sorted by descending total score.
- Synthetic avatars, names, titles, units, emails, activity titles, and scores.
- Expanded row details with activity table.
- Static GitHub Pages deployment.
- `report.md`.

### Out Of Scope

- Real corporate data, Vention photos, real department names, real emails, or copied SharePoint values.
- Runtime calls to the original SharePoint data source.
- Authentication, backend services, admin tooling, analytics, routing, persistence, or unrelated pages.
- Product improvements or extra features not present in the observed leaderboard.

## User Journeys

### Challenge Reviewer Opens the Clone

The reviewer opens the GitHub Pages link, sees a leaderboard matching the source widget’s structure, scans ranked employees, changes filters, searches for a name or title, expands a row, and verifies that the details table behaves like the original. The journey succeeds when these checks work without missing UI states, broken layout, console errors, or real corporate data.

### Implementer Builds and Verifies the Submission

The implementer works inside `task-1/`, uses sanitized extraction notes as reference, generates synthetic data with the observed schema and scale, builds the React/Vite app, verifies desktop and mobile browser behavior, deploys to GitHub Pages, and writes `task-1/report.md`. The journey succeeds when the deployed app behaves like the local production build and the repo contains all required artifacts.

## Web App Requirements

- The deliverable is a single-page static web app.
- The app must deploy as static files under the GitHub Pages base path.
- The app must work without authentication, server-side rendering, backend endpoints, persistence, or runtime API integrations.
- Current desktop Chromium-based browsers must be supported for review.
- Mobile viewport behavior must keep the leaderboard readable and usable.
- Search input, filter controls, expand/collapse controls, and expanded row content must preserve basic keyboard and semantic behavior.

## Data Requirements

Synthetic activity records must match the sanitized CSV shape:

- `ActivityExternalId`
- `EmployeeName`
- `EmployeeTitle`
- `EmployeeUnit`
- `ActivityEndDate`
- `Email`
- `ActivityCategory`
- `Employee GUID`
- `ActivityPoints`
- `ActivityTitle`

The app must group activity records by employee identity, preserve representative employee display fields from grouped records, sum `ActivityPoints` into total score, and derive per-category stats from `ActivityCategory`.

## Functional Requirements

### Leaderboard Display

- FR1: Reviewers can view a leaderboard page that mirrors the observed Company Leaderboard structure.
- FR2: Reviewers can see ranked employee rows with rank, avatar, name, title, unit, category stats, and total score.
- FR3: The system displays leaderboard rows in descending total score order.
- FR4: The system displays the full filtered employee list without pagination or load-more controls.

### Filtering And Search

- FR5: Reviewers can filter leaderboard results by year.
- FR6: Reviewers can filter leaderboard results by quarter.
- FR7: Reviewers can filter leaderboard results by activity category.
- FR8: Reviewers can search the leaderboard client-side.
- FR9: The system updates visible rows when filters or search terms change.
- FR10: The system supports an empty-result state when search/filter criteria match no employees.

### Row Expansion

- FR11: Reviewers can expand an employee row to view activity details.
- FR12: Reviewers can collapse an expanded employee row.
- FR13: The system displays expanded activity details with activity title, category, date, and points.

### Synthetic Data

- FR14: The system uses synthetic employee, activity, email, title, unit, and avatar data only.
- FR15: The system groups activity records by employee identity and calculates total score from activity points.
- FR16: The system derives per-category counts or stats from each employee’s grouped activity records.
- FR17: The system uses data shaped like the sanitized activity CSV schema.

### Submission Artifacts

- FR18: The repository contains the application source code under `task-1/`.
- FR19: The repository contains a `report.md` for Task 1.
- FR20: The deployed app is available through GitHub Pages.

## Non-Functional Requirements

### Privacy And Data Safety

- NFR1: The app must contain no real corporate names, photos, job titles, department names, emails, activity titles, or copied SharePoint values.
- NFR2: The app must not make runtime requests to SharePoint or private corporate systems.
- NFR3: The final submission must be safe to publish publicly on GitHub Pages.

### Performance

- NFR4: Filter, search, and row expansion must complete client-side for the generated dataset without visible loading states.
- NFR5: Mock-data generation libraries must not be included in the browser runtime bundle.

### Responsive Usability

- NFR6: The leaderboard must remain readable and usable on desktop and mobile viewports.
- NFR7: Text and controls must not overlap or overflow incoherently at supported viewport sizes.

### Accessibility

- NFR8: Search input, filter controls, and row expand/collapse controls must be operable with standard browser input methods.
- NFR9: Interactive controls must expose clear labels or recognizable semantics.

### Build And Deployment

- NFR10: `npm run build` must complete successfully.
- NFR11: The production build must work under the GitHub Pages base path.
