# Task 1 — Leaderboard

A static, single-page React/Vite app that renders a privacy-safe clone of an internal company leaderboard. All work in this app must run from this directory; the repo root has no app-level `package.json`.

## Working directory

All commands must be run from `task-1/app/`.

## Tooling baseline

- Node `22.22.0`
- npm `11.13.0`

Vite 8 requires Node `>=22.12 <23`. Use `nvm use` (or your manager of choice) to match.

## Commands

```bash
npm install        # install pinned dependencies
npm run dev        # start the dev server (Vite)
npm run build      # type-check then produce a static build in dist/
npm run preview    # serve the production build locally
```

## GitHub Pages base path

The Vite `base` is set to `/ai-challenge-vention/` to match the deploy target repo (`Altmerian/ai-challenge-vention`). All built asset URLs resolve under that prefix; the dev and preview servers serve the app at `/ai-challenge-vention/`.

## Overview

A complete static React 19 + Vite 8 + TypeScript SPA that clones the internal company leaderboard with synthetic data only. Features a header, year/quarter/category filter dropdowns, local employee search, a top-three podium, a ranked list of ~200 employees grouped from ~450 synthetic activity records, and per-row expansion into an activity details table.

All data is generated at build time (Faker for records, DiceBear for deterministic SVG avatars) and bundled as static JSON under `src/data/`. The runtime makes no network calls — no backend, no router, no persistence, no analytics, no external data APIs. Filtering, search, scoring, grouping, sorting, and row expansion all run client-side from a single pure derivation pipeline.

Deploys to GitHub Pages via the `.github/workflows/deploy-task-1-pages.yml` workflow on pushes to `main` that touch `task-1/app/**`.
