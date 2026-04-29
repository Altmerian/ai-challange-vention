---
stepsCompleted:
  - step-01-init
  - step-10-user-journey-flows
  - step-11-component-strategy
  - step-14-complete
skippedSteps:
  - step-02-project-understanding
  - step-03-core-experience-definition
  - step-04-emotional-response
  - step-05-inspiration-analysis
  - step-06-design-system-choice
  - step-07-defining-core-experience
  - step-08-visual-foundation
  - step-09-design-direction-mockups
  - step-12-ux-consistency-patterns
  - step-13-responsive-accessibility
inputDocuments:
  - docs/prompts/create-ux-design.md
  - _bmad-output/planning-artifacts/prd.md
  - task-1/task-1-vibe-coding.md
  - task-1/extraction/index.md
  - task-1/extraction/sanitized/behaviors.md
  - task-1/extraction/sanitized/api-shapes.json
  - task-1/extraction/sanitized/dom.html
  - task-1/extraction/sanitized/styles.json
  - task-1/extraction/sanitized/dropdown-years.html
  - task-1/extraction/sanitized/dropdown-quarters.html
  - task-1/extraction/sanitized/dropdown-categories.html
  - task-1/extraction/sanitized/row-expanded.html
workflowType: ux-design
lastStep: 14
date: 2026-04-29
---

# UX Design Specification - Task 1 Company Leaderboard Clone

**Author:** Pavel.Shakhlovich  
**Date:** 2026-04-29

## Purpose

This spec documents the observed UX contract for the static React/Vite Company Leaderboard clone. It does not introduce a new design direction, design system, feature set, or content model. Implement from the sanitized extraction artifacts and use only synthetic data.

## Source Inputs

- Primary UX references: `task-1/extraction/sanitized/behaviors.md`, `dom.html`, `styles.json`, `leaderboard-blurred.png`.
- Open-state references: `dropdown-years.html`, `dropdown-quarters.html`, `dropdown-categories.html`, `row-expanded.html`.
- Data shape reference: `api-shapes.json`.
- Product scope reference: `_bmad-output/planning-artifacts/prd.md`.

## Implementation Boundaries

- Build one static SPA page under `task-1/`.
- Replicate the observed leaderboard structure, filters, search, ranking, row expansion, and activity details.
- Do not add sorting controls, pagination, load-more, routing, auth, backend calls, analytics, or extra views.
- Do not copy real corporate names, photos, titles, units, emails, activity titles, or SharePoint values.
- Use `styles.json` and the blurred screenshot as visual implementation references; this document intentionally does not restate the full visual token set.
- Use the `playwright-cli` for verifying UX under development, for final review validate against the original SharePoint page.

## Page Structure

The page is one leaderboard widget rooted at `section[class^="leaderboard_"]`.

Render the major regions in this order:

1. Header with `h2` title and one subtitle paragraph.
2. Filter bar with three custom dropdown filters: year, quarter, category.
3. Search box with Search icon, placeholder `Search employee...`, and `role="searchbox"`.
4. Podium showing the top three employees; the DOM orders the columns visually as rank 2, rank 1, rank 3.
5. Ranked employee list rendering the full filtered result set.

Rows are card-like containers with rank, circular avatar, employee name, employee title/unit line, category stat icons, total score, and a circular expand button.

## User Journey Flows

### Reviewer Checks The Leaderboard Clone

The reviewer opens the deployed page and sees a leaderboard populated from synthetic activity records shaped like the sanitized CSV. The app groups activity records by employee identity, keeps representative display fields, sums `ActivityPoints` into total score, derives category stats from `ActivityCategory`, and sorts employees by descending total score. The implementation target scale is about 450 activity records grouped into about 200 rendered employees.

The reviewer changes filters from the three custom dropdowns. Each dropdown behaves like a Fluent-style custom control with a `role="combobox"` trigger and `role="listbox"` popup, not a native `select`. The years dropdown has 2 options, quarters has 5 options, and categories has 4 options. Filtering is client-side and fires no network request.

The reviewer types into the search box. Search filters the already-loaded employee list locally and does not debounce or call an API. When search/filter criteria match no employees, render an empty-result state for the current filters without fetching data.

The reviewer scans ranks and scores. The list is already sorted by score descending. No sort headers, sort controls, pagination controls, load-more controls, or infinite-scroll triggers were observed.

The reviewer expands a row with the circular expand button. The collapsed state uses `ChevronDown`; the expanded state uses `ChevronUp`, applies the expanded row marker, and reveals the details section without an observed height animation.

The reviewer inspects the expanded activity table. The details section includes a title and a table with activity name, category badge, activity date, and activity points. Table values come from the selected employee's grouped activity records.

## Component Strategy

### `LeaderboardWidget`

Purpose: Own the overall leaderboard page composition.

Renders: header, filter bar, search box, podium, and employee list.

State/props: activity records, selected year, selected quarter, selected category, search query, and row expansion state.

Source: `dom.html`, `styles.json`, `behaviors.md`.

### `LeaderboardHeader`

Purpose: Render the observed title area.

Renders: `h2` and subtitle paragraph.

State/props: title text and subtitle text.

Source: `dom.html`, `styles.json` keys `heading` and `subtitle`.

### `FilterBar`

Purpose: Group the observed local filtering controls.

Renders: year dropdown, quarter dropdown, category dropdown, and search box.

State/props: selected filter values and search query callbacks.

Source: `dom.html`, `behaviors.md`, `filter-probe.json`.

### `FilterDropdown`

Purpose: Reusable custom dropdown matching the observed open and closed states.

Renders: focusable `role="combobox"` trigger, current label, `ChevronDown`, and a `role="listbox"` popup with option buttons.

State/props: label, option list, selected option, open/closed state, and selection callback.

Source: `dropdown-years.html`, `dropdown-quarters.html`, `dropdown-categories.html`.

### `SearchBox`

Purpose: Client-side filtering by employee text.

Renders: Search icon and `role="searchbox"` input with placeholder `Search employee...`.

State/props: search query and change callback.

Source: `dom.html`, `search-probe.json`, `behaviors.md`.

### `Podium` And `PodiumCard`

Purpose: Highlight the top three ranked employees before the list.

Renders: three podium columns ordered as rank 2, rank 1, rank 3. Each card contains circular avatar, rank badge, name, role/title line, star score pill, and podium block/rank number.

State/props: top three grouped employees with rank, avatar, display fields, and total score.

Source: `dom.html`, `styles.json` key `podium`.

### `LeaderboardList`

Purpose: Render all employees matching the active filters/search.

Renders: repeated employee rows; target baseline count is about 200 rows before filtering.

State/props: filtered grouped employees and row expansion state.

Source: `dom.html`, `styles.json` key `counts`, `behaviors.md`.

### `LeaderboardRow`

Purpose: Render one compact employee summary.

Renders: rank, circular avatar, name, title/unit line, category stats, total score section, and expand button.

State/props: employee summary, rank, category counts, total score, expanded/collapsed state.

Source: `dom.html`, `row-expanded.html`, `styles.json` key `listRow`.

### `CategoryStats`

Purpose: Show per-category activity counts for an employee.

Renders: one or more icon/count pairs. Observed icons include `Presentation`, `Education`, and `Emoji2`.

State/props: per-category count map derived from grouped activity records.

Source: `dom.html`, `row-expanded-structure.json`, `behaviors.md`.

### `ScoreDisplay`

Purpose: Render total points consistently.

Renders: `FavoriteStarFill` icon and numeric score, with podium and row variants matching their source placement.

State/props: total score and display variant.

Source: `dom.html`, `styles.json` keys `podium` and `listRow.totalScore`.

### `ExpandButton`

Purpose: Toggle the row details section.

Renders: circular button with `ChevronDown` when collapsed and `ChevronUp` when expanded.

State/props: expanded boolean and toggle callback.

Source: `dom.html`, `row-expanded.html`, `behaviors.md`.

### `ExpandedActivityTable`

Purpose: Show the selected employee's activity details.

Renders: details title, table wrapper, and activity table. Table columns are activity name, category, date, and points. Activity rows use `activityName`, `categoryBadge`, `activityDate`, and `activityPoints` classes.

State/props: activity records for the expanded employee.

Source: `row-expanded.html`, `row-expanded-structure.json`, `api-shapes.json`.

## Shared Data Utilities

- Parse or import generated synthetic records with the sanitized CSV fields: `ActivityExternalId`, `EmployeeName`, `EmployeeTitle`, `EmployeeUnit`, `ActivityEndDate`, `Email`, `ActivityCategory`, `Employee GUID`, `ActivityPoints`, `ActivityTitle`.
- Group records by employee identity.
- Preserve representative employee display fields from grouped records.
- Sum `ActivityPoints` into the employee total score.
- Derive category counts and activity rows from `ActivityCategory`.
- Derive year and quarter filters from `ActivityEndDate`.
- Apply year, quarter, category, and search filters locally.
- Sort visible employees by descending total score after filtering.
