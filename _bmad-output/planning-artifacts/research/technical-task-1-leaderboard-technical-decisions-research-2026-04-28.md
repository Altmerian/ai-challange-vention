---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - task-1/task-1-vibe-coding.md
  - task-1/extraction/index.md
  - task-1/extraction/sanitized/behaviors.md
  - task-1/extraction/sanitized/api-shapes.json
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Task 1 leaderboard technical decisions'
research_goals: 'Choose pinned React/Vite, GitHub Pages deployment, static mock data, DiceBear/Faker data generation, and testing approach before Task 1 planning.'
user_name: 'Pavel.Shakhlovich'
date: '2026-04-28'
web_research_enabled: true
source_verification: true
---

# Task 1 Leaderboard Technical Decision Research

**Date:** 2026-04-28  
**Author:** Pavel.Shakhlovich  
**Research Type:** Technical decision note

## Executive Summary

Use a React + Vite + TypeScript single-page app, deployed as static files to GitHub Pages through GitHub Actions. Use static generated mock data, not runtime APIs, so the published app is deterministic, fast, and free from external service dependencies.

Generate synthetic leaderboard records with Faker and deterministic DiceBear SVG avatars, then ship the generated JSON/assets with the app. Keep verification lean: build the app and use the existing project `playwright-cli` skill for browser checks against the production-style output. Do not add a checked-in E2E test suite by default.

## Version Verification Policy

All version decisions below were checked on 2026-04-28 against official sources only: official product docs, official npm registry output through `npm view`, Node.js official release pages, and official GitHub action repositories.

Local runtime baseline is the installed Node.js version requested by Pavel:

| Tool | Pinned Version | Reason |
|---|---:|---|
| Node.js | `22.22.0` | Local baseline; Node 22 is LTS and satisfies Vite 8's `22.12+` requirement. |
| npm | `11.13.0` | Local npm baseline; use in `packageManager` for reproducible lockfile behavior. |

## Package Pins

Use exact versions in `package.json`. No Playwright package dependency is required for the application because browser verification can be done through the existing `playwright-cli` skill.

| Area | Package | Version |
|---|---|---:|
| App runtime | `react` | `19.2.5` |
| App runtime | `react-dom` | `19.2.5` |
| Build | `vite` | `8.0.10` |
| Build | `@vitejs/plugin-react` | `6.0.1` |
| Build | `typescript` | `6.0.3` |
| Mock data generation | `@faker-js/faker` | `10.4.0` |
| Mock avatars | `@dicebear/core` | `9.4.2` |
| Mock avatars | `@dicebear/collection` | `9.4.2` |
| Types | `@types/react` | `19.2.14` |
| Types | `@types/react-dom` | `19.2.3` |

## GitHub Pages Deployment Pins

Use the Vite static deployment flow with GitHub Pages source set to GitHub Actions. Set Vite `base` to `'/<repo-name>/'` unless deploying to a user/organization root site.

Use exact action tags verified from official GitHub action repositories:

| Action | Exact Tag | Current Tag SHA Verified |
|---|---:|---|
| `actions/checkout` | `v6.0.2` | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| `actions/setup-node` | `v6.4.0` | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| `actions/configure-pages` | `v6.0.0` | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` |
| `actions/upload-pages-artifact` | `v5.0.0` | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages` | `v5.0.0` | `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128` |

For a training challenge, exact tags are acceptable. If stricter supply-chain pinning is required, pin the workflow to the verified SHAs instead of tags.

## Decisions

### 1. React, Vite, TypeScript

Use React for component composition and Vite for dev server/build. Vite 8 is current and officially requires Node `20.19+` or `22.12+`, so Node `22.22.0` is compatible. React 19.2 is current on the official React release channel and is available on npm.

Keep the app a single page. Do not add a router unless implementation uncovers a real need. If routing is added later, use GitHub Pages-compatible routing: either hash routing or a basename matching Vite `base`.

### 2. Static Mock Data

Do not call a data API from the browser. Generate static data before shipping the app and import it from the React code.

Target data shape should mirror the extracted activity CSV:

```ts
type ActivityRecord = {
  ActivityExternalId: string;
  EmployeeName: string;
  EmployeeTitle: string;
  EmployeeUnit: string;
  ActivityEndDate: string;
  Email: string;
  ActivityCategory: string;
  "Employee GUID": string;
  ActivityPoints: number;
  ActivityTitle: string;
};
```

Implementation can derive the UI model from activity records:

```ts
type LeaderboardPerson = {
  employeeGuid: string;
  name: string;
  title: string;
  unit: string;
  email: string;
  avatarUrl: string;
  score: number;
  activities: ActivityRecord[];
  categoryCounts: Record<string, number>;
};
```

Use approximately the extracted scale for realism: about 450 activity records grouped into about 200 employees. Sort by descending total score after grouping.

### 3. Faker + DiceBear

Use Faker only during data generation, not in the browser bundle. Faker's own docs warn that the browser package is large, so generation should produce static JSON/assets.

Use DiceBear locally to create deterministic SVG avatars from synthetic employee IDs or names. Prefer CC0 DiceBear styles such as `lorelei`, `loreleiNeutral`, `initials`, `pixelArt`, or `notionists`. Avoid real photos and avoid services that return human photo-like images, because the task explicitly forbids corporate personal data and the goal does not require real portraits.

### 4. GitHub Pages

Deploy the Vite `dist` output with GitHub Actions. Required flow:

1. `npm ci`
2. `npm run build`
3. upload `./dist`
4. deploy to GitHub Pages

GitHub Pages sites are publicly available, so the build must include only synthetic data and safe visual assets.

### 5. Verification

Keep verification focused on challenge risk, not exhaustive coverage. Do not include a default unit/component testing stack or checked-in E2E test suite unless implementation complexity later proves it is needed.

Required checks for implementation:

| Layer | Tooling | Scope |
|---|---|---|
| Browser verification | Existing `playwright-cli` skill | desktop/mobile load, filter/search interaction, row expand, no console errors, production preview works under GitHub Pages base path |
| Build | Vite | `npm run build` succeeds with static assets and no external data calls |

Expected verification flow:

1. Build the app with `npm run build`.
2. Serve the production build locally with Vite preview or an equivalent static server.
3. Use `playwright-cli` to open the preview URL, resize desktop/mobile viewports, interact with filters/search/row expansion, inspect console output, and capture screenshots when useful.

## Planning Inputs

Feed these decisions into Task 1 planning:

- Use sanitized extraction artifacts only.
- Build a static React/Vite SPA.
- Generate static synthetic leaderboard data with the same activity-record shape as the sanitized extraction.
- Generate deterministic DiceBear avatars and ship them with the app.
- Do not include corporate names, photos, job titles, emails, department names, or copied SharePoint values.
- Include `report.md` explaining extraction, sanitization, mock data generation, and deployment.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| GitHub Pages path breaks assets | Set Vite `base` to the repository path before deployment. |
| Faker/DiceBear bloats client bundle | Generate JSON/SVG assets before build; do not import Faker into app runtime. |
| Synthetic data accidentally resembles real corporate data | Use generated names, emails, titles, units, and activity titles only; scan final app content before publishing. |
| Runtime API dependency fails on GitHub Pages | Use static JSON/assets only. |
| UI clone drifts from extraction | Use `task-1/extraction/index.md` and required sanitized artifacts as implementation inputs. |

## Official Sources Checked

- React 19.2 release: https://react.dev/blog/2025/10/01/react-19-2
- Vite 8 announcement and Node support: https://vite.dev/blog/announcing-vite8
- Vite GitHub Pages deployment guide: https://vite.dev/guide/static-deploy
- Node.js v22.22.0 archive: https://nodejs.org/en/download/archive/v22.22.0
- Node.js release status: https://nodejs.org/en/about/previous-releases
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Pages publishing source: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Faker v10 guide: https://v10.fakerjs.dev/guide/
- Faker usage guide: https://v10.fakerjs.dev/guide/usage
- DiceBear JS library guide: https://www.dicebear.com/how-to-use/js-library/
- DiceBear styles overview: https://www.dicebear.com/styles/
- DiceBear licenses: https://www.dicebear.com/licenses/

## Local Project Capability Checked

- Existing browser automation skill: `.agents/skills/playwright-cli/SKILL.md`
