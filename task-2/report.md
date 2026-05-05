# Task 2 — Convene Submission Report

## Overview

**Convene** is a lightweight event hosting and attendance platform built end-to-end on Lovable. Hosts publish events, attendees RSVP and receive a QR ticket, and checkers redeem those tickets at the door. The brief's full scope — public/unlisted events, capacity-with-waitlist, online-URL gating, gallery moderation, post-event feedback, reports, CSV export — ships in this prototype.

- **Live URL:** https://altmer-events.lovable.app/
- **Source:** [`/task-2/lovable-app/`](./lovable-app/) (git submodule → [`Altmerian/events-platform`](https://github.com/Altmerian/events-platform))
- **Hosting:** Lovable Cloud (Postgres + auth + storage + Deno edge functions, all managed)
- **Stack:** React + Vite + TypeScript + Tailwind + shadcn/ui (frontend); Postgres + Supabase Auth + Storage + Deno edge functions (backend)

## Implementation approach

Planning before any code:

1. **Grilling the brief** — used the `grill-with-docs` skill to walk down the design tree, decision by decision, building up [`CONTEXT.md`](./CONTEXT.md) as the canonical glossary. This caught ambiguities the brief glossed over (Host as entity vs. role, time-zone display rule, ticket-code shape, online vs. in-person check-in symmetry, etc.).
2. **PRD synthesis** — used the `to-prd` skill to convert the resolved context into [`PRD.md`](./PRD.md) (72 user stories, schema sketch, edge-function list, 12-module decomposition).
3. **Adversarial review** — ran the `codex:adversarial-review` agent on the CONTEXT + PRD against the original brief. It surfaced five real issues (online-URL leak via row-level RLS, anonymous report dedup broken under Postgres NULL UNIQUE semantics, check-in undo race across concurrent scanners, missing Permission Resolver test coverage, dropped Free/Paid toggle), all of which were applied before any frontend work began.

The Lovable build itself was iterative: schema migration → auth → public read paths → host-only paths → edge functions for the authoritative writes (RSVP, capacity, check-in, online-link gating) → polish and seed data.

## AI / tooling usage

- **Planning** — Claude Code (Opus 4.7, 1M context) running locally in VS Code, with the `grill-with-docs`, `to-prd`, and `codex:adversarial-review` skills from the [`mattpocock/skills`](https://github.com/mattpocock/skills) collection.
- **Build** — Lovable's in-browser editor for the React app and Lovable Cloud for the backend (Postgres / auth / storage / edge functions).
- **Side-by-side IDE** — VS Code with GitHub Copilot, Codex CLI, and Claude Code CLI for ad-hoc fixes that were faster than round-tripping through the Lovable chat.
- **Domain docs** — kept [`CONTEXT.md`](./CONTEXT.md) updated as decisions resolved, so future agents get the same shared vocabulary.

## What worked

- **Splitting schema into one large migration + a follow-up for security-linter findings** kept the database setup quick and the linter's red squiggles confined to a small follow-up SQL block.
- **`event_online_links` as a separate table with no RLS policies** keeps the join URL un-gettable from the browser. A small `event-join-link` edge function is the only path in, and it owns the access decision (host members or confirmed RSVPs only).
- **`bootstrap-seed` edge function using the service role to create auth users and demo rows** in one call avoided the chicken-and-egg of seeding `auth.users` from a SQL migration. The seed is idempotent.
- **shadcn/ui + a single warm-neutral palette + terracotta accent** gave a coherent look with almost no custom CSS.
- **Pure modules for the easy-to-get-wrong parts** — time formatter, ticket-code generator, `.ics` builder, RFC-4180 CSV writer, image-resize-to-WebP pipeline. Each one is small, deterministic, and has unit tests; the rest of the app glues them together.
- **All authoritative writes live in edge functions, not client RLS policies.** The `rsvps` table has no client write policies at all — the client invokes `rsvp` / `cancel-rsvp`, which take a `SELECT FOR UPDATE` row lock, decide going-vs-waitlist, and run promotion atomically. Same for `update-capacity`, `cancel-event`, `check-in` (with the 60-second / same-checker undo guard), and `gallery-signed-url`.

## What didn't (and what we did about it)

- **Postgres `CHECK` constraints can't reference `now()`.** The 14-day feedback window and the 60-second undo window are both enforced in application code (edge function or React) rather than at the database level. Documented in CONTEXT.md and re-checked by the edge functions on every call.
- **Lovable's security linter still flags storage policies on public buckets and SECURITY DEFINER helper functions.** Both are intentional: the `has_org_role(user, org, role)` SECURITY DEFINER function is what avoids recursive RLS, and the public buckets host event covers / host logos that should be readable without signed URLs. Comments in the migration explain this so the next reader doesn't try to "fix" it.
- **An earlier attempt to seed via SQL `INSERT INTO auth.users` with a hashed password** worked in theory but was brittle (Supabase rotates internal columns). Switching to `auth.admin.createUser` from the `bootstrap-seed` edge function was simpler and the seed became idempotent.
- **Resend transactional emails are not wired up.** The brief calls out three transactional triggers (RSVP confirmed, RSVP cancelled, Event cancelled by Host), and the schema includes a `notification_log` table that records what *would* be sent — but the actual `send-email` wrapper is not implemented. The prototype is a one-shot demo and in-app promotion banners cover the user-visible flows.
- **Optional QR camera scanning is not surfaced.** Manual code entry is the supported path (the brief calls out manual entry as sufficient), so this was a deliberate scope cut.
- **The seeded gallery photo references a placeholder storage path,** so its signed URL won't resolve until a real upload comes in through the UI. Approving and rejecting still work on real uploads.

## Notable decisions

- **Roles in a separate table, never on `profiles`.** A `has_org_role(user, org, role)` SECURITY DEFINER helper backs RLS for events, RSVPs, gallery photos, etc. Policies stay one-line and don't recurse. Matches the [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- **Capacity & waitlist promotion live only in edge functions.** Same code path runs on cancellation and on capacity-raise. Capacity cannot be lowered below the current going count.
- **Free/Paid toggle as pure UI.** Per the brief, the toggle is rendered with **Paid** disabled and a "Coming soon" tooltip. There is no `is_paid` column and no payment code path; if/when paid events ship, the schema change is small and additive.
- **Aggregate rating exposed via a `security_invoker` view** that only returns rows once an event has ≥3 ratings. Comments stay restricted to host-org members through the underlying table's RLS.
- **Time stored as `timestamptz` + IANA zone string on the event.** UI always shows event-local time first and adds a viewer-local hint when the zones differ. `.ics` files use `TZID=` so the calendar app renders the correct local time wherever the attendee opens it.
- **Ticket codes are 8 chars from an unambiguous alphabet** (`23456789ABCDEFGHJKMNPQRSTUVWXYZ` — no `0/O`, no `1/I/L`), formatted `XXXX-XXXX`. Manual entry stays viable on a phone keyboard. Codes are random and unique-per-issue, not sequential.
- **CSV schema:** `Name,Email,RSVP Status,RSVP Created At,Check-in Time,Ticket Code` with UTF-8 BOM, RFC-4180 quoting, ISO-8601 UTC timestamps. Filename `rsvps-{event-slug}-{event-start-date}.csv`. Verified open-clean in Excel and Google Sheets.
- **Reports require sign-in (`reporter_user_id NOT NULL`).** Postgres UNIQUE treats NULLs as distinct, so allowing anonymous reports would have broken the dedup constraint. Event reports route to Platform Admin; gallery reports route to the host org's Hosts.
- **Out-of-scope items from the PRD** (paid tickets, magic links, reminder emails, gallery email notices, dark mode, edit-notify, capacity-below-going, individual RSVP cancellation by Host, re-reporting after hide+unhide) were intentionally not built. Listed in [PRD.md](./PRD.md) Out of Scope.

## Submission artifacts

| Artifact | Location |
|---|---|
| Public deployed URL | https://altmer-events.lovable.app/ |
| Seeded demo data (≥1 host, ≥1 upcoming, ≥1 past) | Seeded by `bootstrap-seed`; visible on the live site as `host@demo.app` |
| Sample CSV export | [`samples/rsvps-sample.csv`](./samples/rsvps-sample.csv) |
| Step-by-step usage guide | [`README.md`](./README.md) |
| This report | [`report.md`](./report.md) |
| GitHub repo (public, project under `task-2/`) | [`Altmerian/ai-challenge-vention`](https://github.com/Altmerian/ai-challenge-vention/tree/main/task-2) — Lovable code is the [`events-platform`](https://github.com/Altmerian/events-platform) submodule |

## References

- Lovable docs: <https://docs.lovable.dev/introduction/welcome>
- Supabase Auth (used by Lovable Cloud): <https://supabase.com/docs/guides/auth>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Matt Pocock skills used for planning/review: <https://github.com/mattpocock/skills>
