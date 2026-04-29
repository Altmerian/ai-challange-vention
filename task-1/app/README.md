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

Story 1.1 establishes the build foundation: a TypeScript React/Vite app with a single leaderboard root section rendered. Subsequent stories layer privacy-safe synthetic data, the derivation pipeline, the full leaderboard UI, filters/search, row expansion, and GitHub Pages deployment.
