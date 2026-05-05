# PRD — Lovable Event Hosting Prototype

> Source brief: `task-2-description.md`. Domain language: `CONTEXT.md`. The CONTEXT glossary is the **canonical** vocabulary for this PRD; where this document and the brief differ, this document wins.

---

## Problem Statement

Community organizers who run free events end-to-end have no single lightweight tool that connects publishing, RSVP, ticketing, and on-the-day check-in. They cobble together a flyer site, a form, a spreadsheet, and a printed name list. Attendees lose track of which events they signed up for and what time they start in their own zone. At the door, organizers struggle to track who has actually arrived, with the only real-time signal being a volunteer ticking names off a sheet. After the event, there is no easy way to capture feedback or photos in one place.

## Solution

A web application — built and hosted on Lovable — for **publishing**, **promoting**, **RSVP-ing to**, and **running** free community-style events:

- A `User` can browse events anonymously, sign up to RSVP, register their own `HostOrg`, and operate it solo or with co-organizers split into `Host` and `Checker` roles.
- Each event has a public page with a cover image, time (always shown in the **event's** local zone with the viewer's local zone as a hint), venue or join link, capacity, and an RSVP button.
- A confirmed RSVP issues a `Ticket` carrying a unique 8-character `code` rendered as a QR. At the door, a `Checker` redeems the ticket via QR scan or by typing the code, with a live counter, duplicate-redemption guard, and an "undo last scan" affordance.
- When capacity is reached, RSVPs go onto a FIFO `Waitlist`. When a seat opens (cancellation or capacity raise), the next person is **automatically promoted** with a fresh `Ticket`, surfaced in-app on their next visit.
- A `Host` can run multiple events from one dashboard with per-event stats and CSV export of RSVPs and attendance, suitable for Excel and Google Sheets.
- After the event, attendees who were `going` can submit a 1–5 star rating + optional comment within a 14-day window; aggregate ratings appear publicly on event and Host pages once an event reaches three ratings.
- Attendees can upload photos to the event gallery, gated by Host approval. Anyone can `Report` an event or photo; reports route to a `HostOrg`'s Hosts (gallery photos) or to a global Platform Admin (events themselves), who can hide the offending item.

The application is shipped as one deployable: React + Vite + TypeScript + Tailwind + shadcn/ui on the front end, Lovable Cloud (Postgres + auth + storage + edge functions) on the back, transactional email via Lovable's built-in Resend integration, no external paid APIs.

---

## User Stories

Stories are grouped by actor. They are exhaustive — every requirement from the brief and every decision in `CONTEXT.md` should map to one or more stories below.

### Visitor (anonymous, not signed in)

1. As a Visitor, I want to browse the Explore page without signing in, so that I can see what events are happening before committing an account.
2. As a Visitor, I want to filter the Explore page by date range using a `From` / `To` picker that defaults to "from today onward", so that I see upcoming events first.
3. As a Visitor, I want to toggle "Include past events" on Explore, so that I can find events that already happened (e.g., to look at the gallery).
4. As a Visitor, I want to filter Explore by free-text location matched against the event address, so that I can narrow to events in my city.
5. As a Visitor, I want to filter Explore by Mode (`Any` / `In-person` / `Online`), so that I can see only events I can actually attend.
6. As a Visitor, I want full-text search over event title, description, and Host name, debounced 300ms, ranked by relevance, so that I can find events by topic or organizer.
7. As a Visitor, I want past events in Explore to display an "Ended" pill with no RSVP CTA, so that I'm not misled into trying to sign up.
8. As a Visitor, I want event detail pages to show event-local time prominently, with my local time shown underneath when our zones differ, so that I never misread a time zone.
9. As a Visitor, I want to view a `HostOrg`'s public Host page with its name, logo, bio, contact email, and list of upcoming public events, so that I can decide whether to follow them.
10. As a Visitor, I want every event and Host page to expose Open Graph / Twitter Card metadata, so that links pasted to chat apps render with the cover image and title.
11. As a Visitor, I want to be redirected to sign-in when I click RSVP, then returned to the same event page after authentication, so that I don't lose my place.
12. As a Visitor, I want online events to show the venue as "Online — RSVP to receive the join link" without revealing the URL, so that uninvited people can't crash the call.
13. As a Visitor, I want a "Report" link on event and gallery items that redirects me to sign-in (then back to the event), so that the report flow is gated to signed-in accounts and the moderation queue can't be flooded anonymously.

### Attendee (signed-in, no Membership)

14. As an Attendee, I want to sign up with email + password, or one-click with Google, so that I can choose my preferred method.
15. As an Attendee, I want my email verified before I can RSVP, so that ticket confirmations reach a real inbox.
16. As an Attendee, I want to RSVP to a published event with one click, so that I get on the list without filling forms.
17. As an Attendee, I want my RSVP to immediately produce a Ticket page showing my unique code as both text and QR, so that I can save it on my phone right away.
18. As an Attendee, I want an "Add to Calendar" button on the Ticket that downloads an `.ics` file with the event's IANA time zone, so that the time renders correctly in any calendar app I use.
19. As an Attendee, I want to view all my upcoming Tickets on a single `My Tickets` page, ordered by start time, so that I have one place to find them.
20. As an Attendee, I want to cancel my RSVP at any time before the event ends, so that I can free my seat for someone on the waitlist.
21. As an Attendee, I want to receive an email confirming my RSVP, with the ticket code and event details, so that I have a paper trail outside the app.
22. As an Attendee, I want to receive an email confirming my cancellation, so that I'm sure the action took effect.
23. As an Attendee, I want to receive an email if a Host cancels an event I'm RSVP'd to, so that I don't show up to a dark venue.
24. As an Attendee, I want to be put on the Waitlist when capacity is full, see my queue position, and have the RSVP UI clearly say "You're on the waitlist", so that I know my status.
25. As an Attendee, I want to be auto-promoted from waitlist to going (with a new Ticket) when a seat opens, and see an in-app banner on my next visit telling me, so that I never miss the opportunity to attend.
26. As an Attendee at an online event, I want the join URL revealed on my Ticket and `.ics` only after I'm `going` (fetched via the dedicated `event-join-link` edge function — never exposed via the public event row), so that uninvited people cannot scrape the URL from the page or API response.
27. As an Attendee, I want to register as a Host via a self-serve flow (creating a new `HostOrg` with me as the first `Host` member), so that I can start publishing my own events.
28. As an Attendee, I want to join an existing `HostOrg` by clicking an invite link, so that I become a member with the role embedded in the link.
29. As an Attendee with a `going` RSVP for an ended event, I want to submit a 1–5 star rating with an optional comment within 14 days of `event.end`, so that I can give the Host useful feedback.
30. As an Attendee, I want to edit my Feedback while the 14-day window is open and view it read-only after, so that I can revise first impressions but not retro-edit indefinitely.
31. As an Attendee at any event, I want to upload photos to the event gallery, see them with a "Pending review" badge until approved, and have them appear publicly only after Host approval, so that I can contribute without uploads disappearing silently.
32. As an Attendee, I want to report an event or gallery photo I find inappropriate (with an optional reason text, ≤500 chars), so that I have a way to flag bad content. Reports are deduplicated per `(reporter, target)`; re-reporting after dismissal is blocked.

### Host (Membership.role = Host)

33. As a Host, I want to edit my `HostOrg` profile (name, logo, bio, contact email, default time zone), so that the public Host page is accurate.
34. As a Host, I want to upload a logo (JPEG/PNG/WebP, ≤8MB input, client-resized to 1600px WebP), so that uploads are fast and storage stays cheap.
35. As a Host, I want to create an event by filling: title, description, start/end with time zone, mode (`in_person` or `online`), address or online URL, capacity, cover image, visibility (`public` or `unlisted`), and a Free/Paid toggle (Paid disabled with a "Coming soon" tooltip per brief), so that the event captures everything attendees need without exposing a payment path that doesn't exist.
36. As a Host, I want the time zone selector to default to my `HostOrg`'s saved zone (and to my browser zone for my first event), so that I don't pick the wrong zone by accident.
37. As a Host, I want the address field to appear when mode is `in_person` and the URL field when mode is `online`, with the alternate field hidden, so that I can't accidentally fill both.
38. As a Host, I want to save an event as a Draft visible only to my `HostOrg` members, so that I can prepare quietly.
39. As a Host, I want the Publish button disabled with inline reasons until all required fields are filled, so that I can't ship a half-finished page.
40. As a Host, I want to Unpublish a published event without deleting tickets, so that I can pause discoverability without breaking the trust of attendees who already RSVP'd.
41. As a Host, I want existing tickets to remain valid and visible on `/my-tickets` when an event is `unpublished`, so that attendees who already have tickets aren't confused.
42. As a Host, I want to Cancel an event, which sends an email to all `going` and `waitlisted` attendees and voids tickets, so that everyone is notified at once.
43. As a Host, I want a Cancel action to be irreversible from the UI, so that the demo doesn't accidentally "uncancel" mid-stream.
44. As a Host, I want to Duplicate an event to a new Draft (copying title with " (copy)", description, mode, address/URL, capacity, visibility, cover image, but **not** dates, RSVPs, tickets, feedback, gallery, reports), so that I can clone a successful template.
45. As a Host, I want to edit any field of a published event without triggering an email, with an "Edited at {timestamp}" line shown on the public page, so that small fixes are quiet but visible.
46. As a Host, I want capacity changes to flow through the promotion logic — increasing capacity auto-promotes the front of the waitlist in FIFO order in one transaction — so that I don't have to manually message anyone.
47. As a Host, I want the editor to block lowering capacity below the current `going` count with an inline error, so that I never have to manually evict someone who already has a ticket.
48. As a Host, I want my dashboard to list Upcoming and Past events, each row showing Going, Waitlist, and Checked-in counts, so that I can see attendance at a glance.
49. As a Host, I want a one-click CSV export per event with columns `Name,Email,RSVP Status,RSVP Created At,Check-in Time,Ticket Code`, UTF-8 BOM, ISO 8601 UTC dates, all RSVP states included, so that the file opens correctly in Excel and Google Sheets.
50. As a Host, I want the CSV file named `rsvps-{event-slug}-{event-start-date}.csv`, so that downloaded files don't collide.
51. As a Host, I want to access "My Events" — a page aggregating events across every `HostOrg` I'm a member of, with filters by `HostOrg`, date range, and text — with role-appropriate quick actions per row, so that I can see everything I'm involved in.
52. As a Host, I want to invite members via two reusable links per `HostOrg` — one for `Host`, one for `Checker` — that I can copy and revoke, so that I can grow the team or rotate access.
53. As a Host, I want to revoke an invite link with one click ("Reset link"), so that leaked URLs go dead immediately.
54. As a Host, I want existing-member role wins (clicking an invite link as an existing member is a no-op), so that nobody can self-promote via a leaked Host link.
55. As a Host, I want a Members page where I can change a member's role explicitly, so that role promotion is intentional and audited (server-side).
56. As a Host, I want a Reports tab on the dashboard listing pending reports against my `HostOrg`'s gallery photos, with `Hide` and `Dismiss` actions, so that I can clean up bad uploads.
57. As a Host, I want a per-event view showing the gallery approval queue with Approve / Reject actions, so that I gate what shows publicly.
58. As a Host, I want a per-event view showing individual feedback ratings and comments (private to my `HostOrg`), so that I can read what attendees said.

### Checker (Membership.role = Checker)

59. As a Checker, I want to access the check-in page only for events under `HostOrg`s I'm a member of, with all other parts of the app gated, so that I can't accidentally see or do things I'm not supposed to.
60. As a Checker, I want the check-in page to accept a code via manual text entry (uppercase, with the dash auto-inserted), so that I can redeem tickets even if scanning fails.
61. As a Checker, I want optional QR scan via the device camera using a browser library, so that scanning is faster when conditions allow.
62. As a Checker, I want a live counter showing `Checked-in / Going` updated as I scan, so that I know our progress at a glance.
63. As a Checker, I want re-scanning a ticket already redeemed to display "Already checked in at HH:MM" without double-counting, so that I don't accidentally inflate stats.
64. As a Checker, I want an Undo button that reverts a check-in I performed within the last 60 seconds, so that I can fix a mis-scan immediately without being able to revert another scanner's later corrections.
65. As a Checker, I want unauthorized codes (wrong event, unknown code) to surface a clear error, so that I don't redeem the wrong ticket.

### Platform Admin (User.is_platform_admin = true)

66. As a Platform Admin, I want a `/admin/reports` page listing pending reports against events, with Hide / Dismiss actions, so that I can resolve complaints about the events themselves (not the gallery photos, which Hosts handle).
67. As a Platform Admin, I want to view hidden events even though the public sees a 404, so that I can review my own moderation actions.
68. As a Platform Admin, I want to Unhide a previously hidden target, so that mistaken hides are reversible.
69. As a Platform Admin, I want the role to be granted by SQL only — no UI to escalate — so that the demo can't be accidentally turned into chaos.

### Cross-cutting

70. As any user, I want every page to render correctly on mobile widths, so that I can use the app from my phone.
71. As any user, I want the UI to follow a single warm-neutral palette with a terracotta accent and shadcn/ui defaults, so that the app feels coherent.
72. As any user, I want copy that uses the canonical vocabulary (e.g. "Host", "Going", "Waitlist", "Ticket"), so that the language never confuses me.

---

## Implementation Decisions

### Stack

- **Frontend:** React + Vite + TypeScript + Tailwind + shadcn/ui (Lovable scaffold).
- **Backend:** Lovable Cloud — Postgres database, email + Google auth, Storage buckets, edge functions.
- **Email:** Lovable Cloud's built-in Resend integration. Sender `notifications@{app-domain}`.
- **AI:** Lovable AI Gateway is **not used**.

### Module decomposition

Twelve modules. The first six are pure deep modules with no I/O — testable in isolation behind a stable interface.

**Pure / deep:**

1. **Capacity & Waitlist Decider** — Given `(currentGoingCount, capacity, action: rsvp | cancel | capacity-change(newCap))`, returns the resulting state for the actor (`going` | `waitlisted`) and a list of `(rsvp_id, new_state)` promotions to apply. Owns the FIFO promotion math and oversell guard. Called from the RSVP/promotion edge function which wraps it in a `SELECT … FOR UPDATE` transaction on the event row.
2. **Ticket Code Generator** — Generates 8-char codes from the alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no `0/O/1/I/L`), formatted `XXXX-XXXX`. Retries on collision against a `(code,)` UNIQUE index.
3. **.ics Generator** — Pure function `(event, ticket, viewerZone) → ics string`. Uses `TZID=` matching `event.time_zone`, `SUMMARY = event.title`, `DESCRIPTION = event.description` (truncated, plus event URL), `URL = absolute event page URL`, `UID = "{ticket.code}@{app-domain}"`. `LOCATION` follows online-URL gating (only filled when the requester is a ticketed attendee or `HostOrg` member).
4. **CSV Export Formatter** — Pure function `(rsvpRows) → Uint8Array`. UTF-8 with BOM, RFC 4180 quoting, ISO 8601 UTC dates. Schema fixed: `Name,Email,RSVP Status,RSVP Created At,Check-in Time,Ticket Code`. Empty cells truly empty.
5. **Time Display Formatter** — Pure function `(eventStartUtc, eventEndUtc, eventZone, viewerZone) → { primary, secondary?, endedNow }`. `primary` is event-local with zone label (e.g. `"Sat 9 May, 19:00 CET"`). `secondary` is filled only when zones differ. `endedNow` is `eventEndUtc < now()`.
6. **Permission Resolver** — Pure function `(user, action, target) → boolean`. Single source of truth for: who can RSVP, edit an event, change `HostOrg` settings, check in, approve gallery, view dashboard, export CSV, hide a target. Called from both the UI (to disable buttons) and edge functions (to authorize writes).

**Boundary / I/O-heavy:**

7. **Auth** — Lovable's email-password and Google OAuth. Not custom code; configuration only.
8. **HostOrg & Membership** — `HostOrg` table (name, logo path, bio, contact email, default time zone, slug). `Membership(user_id, host_org_id, role)`. Two `Invite` rows per `HostOrg` (one per role) with `token`, `revoked_at`. Join flow: validate token, insert `Membership` if absent, no-op if present.
9. **Event Lifecycle** — `Event` table (state, visibility, mode, all event fields, `cover_image_path`, `hidden_at`, timestamps). State machine: `draft` → `published` ⇄ `unpublished` → `cancelled`. Publish gate validates required fields. Duplicate copies the documented subset.
10. **Image Upload Pipeline** — Three Storage buckets (`host-logos`, `event-covers`, `gallery`). Client-side canvas resize (longest edge 1600px) → WebP 0.85 → upload. Gallery is a private bucket; signed URLs minted by an edge function gated by approval status + requester identity.
11. **Notification Dispatcher** — Three triggers (RSVP confirmed, RSVP cancelled, Event cancelled). Templates inline; thin wrapper around Resend SDK. Idempotent — guarded by a `notification_log(rsvp_id, kind)` row to avoid double-sends on retry.
12. **Discovery** — Postgres `tsvector` column on `Event` derived from `title` (A) + `description` (B) + joined `HostOrg.name` (C). Filter composition for date range + location ILIKE + mode + `visibility = 'public'` + `state = 'published'` + `hidden_at IS NULL`.

The Permission Resolver (module 6) is the **single authorization decision point** invoked from both the UI (to disable affordances) and every edge function (to authorize the write). It is the highest-risk module after the Capacity Decider, so it gets the most-detailed unit tests (see Testing section).

### Schema (entity sketch)

- `User(id, email, password_hash, display_name, avatar_path, is_platform_admin, created_at)`
- `HostOrg(id, slug UNIQUE, name, logo_path, bio, contact_email, default_time_zone, created_at)`
- `Membership(id, user_id, host_org_id, role, created_at)` — UNIQUE `(user_id, host_org_id)`
- `Invite(id, host_org_id, role, token UNIQUE, revoked_at, created_at)` — exactly two non-revoked rows per `HostOrg`
- `Event(id, host_org_id, slug, title, description, mode, address, start_at, end_at, time_zone, capacity, cover_image_path, state, visibility, hidden_at, edited_at, created_at)` — note: `online_url` is **not** a column here (see `EventOnlineLink`)
- `EventOnlineLink(id, event_id UNIQUE, online_url, created_at)` — separate table so the URL cannot leak via row-level reads of `Event`. RLS denies all client reads; access goes through the `event-join-link` edge function.
- `Rsvp(id, event_id, user_id, state, created_at, promoted_at, cancelled_at)` — UNIQUE `(event_id, user_id)`; index `(event_id, state, created_at)` for FIFO promotion
- `Ticket(id, rsvp_id UNIQUE, code TEXT UNIQUE, checked_in_at NULLABLE, checked_in_by NULLABLE FK→User, voided_at NULLABLE, created_at)`
- `GalleryPhoto(id, event_id, uploader_id, storage_path, status, created_at, reviewed_at, reviewer_id)`
- `Feedback(id, event_id, user_id, rating, comment, created_at, updated_at)` — UNIQUE `(event_id, user_id)`
- `Report(id, reportable_type, reportable_id, reporter_user_id NOT NULL, reason, status, resolved_by_user_id NULLABLE, resolved_at NULLABLE, created_at)` — UNIQUE `(reporter_user_id, reportable_type, reportable_id)`. `reporter_user_id` is NOT NULL because PostgreSQL UNIQUE treats NULLs as distinct by default; allowing anonymous reports would let the same target be flagged unlimited times. Reporting requires sign-in.
- `NotificationLog(id, rsvp_id, kind, sent_at)` — UNIQUE `(rsvp_id, kind)`

### Page inventory

| Route | Audience | Notes |
|-------|----------|-------|
| `/` | Public | Landing → Explore |
| `/explore` | Public | Search + filters; `public` `published` events only |
| `/e/{event-slug}` | Public (if `published` + `public`) / direct URL (if `unlisted`) / 404 otherwise | Event detail |
| `/h/{host-org-slug}` | Public | Host page; lists upcoming `public` events |
| `/sign-in`, `/sign-up` | Anonymous | Email-password + Google |
| `/my-tickets` | Authenticated | All upcoming Tickets |
| `/my-events` | Authenticated members | Cross-`HostOrg` aggregation with filters |
| `/host/onboarding` | Authenticated | "Register as a Host" |
| `/host/{host-org-id}/dashboard` | `Host` of that `HostOrg` | Upcoming/Past tabs, Reports tab, Members tab |
| `/host/{host-org-id}/events/new` | `Host` | Event editor |
| `/host/{host-org-id}/events/{event-id}/edit` | `Host` | Event editor (existing) |
| `/host/{host-org-id}/events/{event-id}/checkin` | `Host` or `Checker` | Check-in page |
| `/host/{host-org-id}/members` | `Host` | Members + invite links + role change |
| `/join/{host-org-id}/{token}` | Authenticated (after auth gate) | Invite acceptance |
| `/admin/reports` | Platform Admin | Event reports queue |
| `/event/{event-id}/feedback` | `going` attendee in window | Feedback form (or read-only) |

### Edge functions

- `rsvp-create(event_id)` — wraps Capacity Decider + insert + ticket issue + email send + notification log.
- `rsvp-cancel(rsvp_id)` — voids ticket, runs Capacity Decider for promotions, sends emails for the canceller + each promoted attendee.
- `event-update-capacity(event_id, new_capacity)` — runs Capacity Decider; promotes in FIFO order in one transaction.
- `event-cancel(event_id)` — flips state, voids tickets, sends bulk email.
- `signed-gallery-url(photo_id)` — returns short-lived URL gated by status + identity.
- `accept-invite(host_org_id, token)` — validates token, inserts `Membership` if absent, no-op if present.
- `event-join-link(event_id)` — returns the `EventOnlineLink.online_url` only when the caller is a `going` attendee or `HostOrg` member; returns `null` otherwise. Backs the Ticket UI's "Join online" button and the `.ics` `LOCATION` for online events.
- `checkin-redeem(code, event_id)` — validates code + event match, sets `checked_in_at` and `checked_in_by`, blocks duplicates with the "Already checked in at HH:MM" message.
- `checkin-undo(ticket_id)` — server-enforced: only succeeds if the ticket is currently checked-in, `checked_in_by` matches the caller, and `checked_in_at` is within the last 60 seconds.

### Time zone storage

`Event.start_at` and `end_at` are `timestamptz` (UTC), with `time_zone` as IANA string (e.g. `"Europe/Berlin"`). The Time Display Formatter is the single place that converts UTC + zone to a string. `.ics` exports use the IANA zone via `TZID=`.

### Authorization

The Permission Resolver is invoked twice for every sensitive action:

1. Client side, to disable / hide UI affordances.
2. Server side (in the relevant edge function), to authorize the write.

Row-level security is set up to defend against direct Postgres access from the browser (Lovable Cloud's `service_role` is server-only).

---

## Testing Decisions

### What makes a good test

- Test **external behavior**, not internal structure. A test that asserts "calling RSVP twice when capacity is full produces one `going` and one `waitlisted` row in FIFO order" survives any refactor of the Capacity Decider; a test that asserts "the `_findFreeSlot` helper returned null" doesn't.
- Each test names a concrete scenario in plain English ("two simultaneous RSVPs at capacity-1 → one going + one waitlisted, no oversell").
- Pure-module tests run in milliseconds with no DB or network.
- Integration tests use a real ephemeral Postgres (Lovable Cloud test schema or local Docker) — never a mocked DB. Mocked DB tests have a known history of passing while production breaks; we avoid them.

### Modules with unit tests

The six pure deep modules get tight unit-test suites:

1. **Capacity & Waitlist Decider** — scenarios:
   - RSVP at `going < capacity` → state `going`.
   - RSVP at `going = capacity` → state `waitlisted`, position appended.
   - Cancel `going` while `waitlisted` exists → next FIFO promotion returned.
   - Cancel `going` while waitlist empty → no promotions.
   - Capacity raise from N to N+K with M ≤ K waitlisted → all M promoted; order preserved.
   - Capacity raise from N to N+K with M > K waitlisted → first K promoted, rest stay in original order.
   - Capacity lower below current `going` count → rejected with a specific error.
   - Two concurrent calls modeled at the decider layer return correct states given a serialized ordering (the transaction layer enforces serialization above this module).
2. **Ticket Code Generator** — scenarios:
   - Code is exactly 9 characters with a single dash at position 4.
   - Alphabet contains no `0`, `O`, `1`, `I`, `L`.
   - Collision retry: when the first generated code is taken, the second is returned.
   - Generator surface-rejects after N consecutive collisions (defensive cap).
3. **.ics Generator** — scenarios:
   - Output parses as valid iCalendar (validated against a parser).
   - `TZID=` matches the event zone string.
   - `UID` includes ticket code and app domain.
   - `LOCATION` is `event.address` for in-person, `online_url` only when the requester is ticketed; empty otherwise.
   - Description contains the event URL.
4. **CSV Export Formatter** — scenarios:
   - Output starts with UTF-8 BOM bytes.
   - Header row matches the exact schema.
   - Names containing commas, quotes, and newlines round-trip through RFC 4180 quoting.
   - ISO 8601 UTC formatting with `Z` suffix.
   - `Check-in Time` empty for non-checked-in rows.
   - Decoding the bytes as UTF-8 yields the original characters including non-ASCII.
5. **Time Display Formatter** — scenarios:
   - Same zone (event=viewer) → `secondary` is `undefined`.
   - Different zone → `secondary` filled with viewer-local string.
   - `endedNow` true when `eventEndUtc` is in the past.
   - DST edge: an event that starts during a "spring forward" hour formats correctly.
6. **Permission Resolver** — scenarios (one per `(actor, action, target)` matrix entry, exhaustive):
   - Anonymous can: view `published`+`public` event, view `HostOrg` page, browse Explore. Cannot: RSVP, report, view `online_url`, view check-in page, export CSV.
   - `Attendee` (signed-in, no Membership) can: RSVP to `published` event, cancel own RSVP, view own Tickets, submit Feedback (if eligible), upload GalleryPhoto, report. Cannot: view another HostOrg's draft, edit any event, view check-in page, export CSV.
   - `Checker` of HostOrg X can: view check-in page for X's events, redeem tickets for X's events, undo own scan within 60s. Cannot: edit X's events, view X's dashboard, export CSV, access check-in for HostOrg Y, approve gallery photos.
   - `Host` of HostOrg X can: do everything Checker can on X, plus edit X's events, manage members, approve gallery, export CSV, view feedback comments, hide X's gallery photos. Cannot: do anything on HostOrg Y unless also a member there.
   - Cross-`HostOrg` denial: a `Host` of X attempting any action on Y returns false.
   - `Platform Admin` can hide/unhide any `Event` regardless of HostOrg membership; cannot edit events.
   - `online_url` access: returns true only for `going` attendees or `HostOrg` members of that event.
   - Online URL gating boundary: a `cancelled` Rsvp does **not** grant access; a `waitlisted` Rsvp does **not** grant access.
   - Invite no-op: re-running `accept-invite` for an existing member returns "no change" outcome regardless of role embedded in the link.

### Modules with integration tests

In addition to the RSVP→Ticket→Check-in happy path, a small **permission-boundary integration suite** runs against a real ephemeral Postgres:

- Seed two HostOrgs, X and Y, each with one Host, one Checker, one published event.
- Verify the cross-product: every actor calls every edge function against both events. Each call is asserted as either succeeding or being denied with the expected error code. This is the test that catches RLS misconfiguration in the generated Lovable app.
- Specifically asserted:
  - Anonymous client cannot read `EventOnlineLink` rows directly (RLS denies).
  - `event-join-link` returns the URL for X's `going` attendee, X's Host, X's Checker; returns `null` for X's `waitlisted`/`cancelled`, for Y's members, and for anonymous.
  - `checkin-undo` rejects when the caller is not `checked_in_by`, when the ticket is no longer checked in, and when the 60-second window has elapsed.
  - `Report` insert by an anonymous (unauthenticated) caller is rejected.
  - Same-`(reporter, target)` second insert returns the unique-violation path.

### Integration test

One end-to-end happy-path test exercises the RSVP → Ticket → Check-in flow:

- Create a published event with capacity 2.
- Two distinct test users RSVP → both `going`, two tickets issued, two emails logged.
- Third user RSVPs → `waitlisted`.
- User #1 cancels → user #3 auto-promoted, fresh ticket issued, two emails logged (cancel-conf + RSVP-confirmed).
- A `Checker` redeems user #2's ticket → `checked_in_at` set, second redemption attempt blocked with the "already" message.
- Undo flips the latest check-in back.

Run against a real Postgres. The test asserts only via the same edge-function calls the UI uses, not via direct table inspection where avoidable.

### Skipping tests for

Auth (Lovable-managed), HostOrg/Membership CRUD glue (covered indirectly by the permission-boundary suite), Event Lifecycle CRUD, Discovery query builder, Notification Dispatcher (one smoke test that the Resend call is invoked is enough), Image Upload (manual verification in the browser is more honest than mocking `canvas`).

### Prior art

This is a greenfield Lovable project — no existing code patterns to mirror. Pure-module tests live under `task-2/lib/__tests__/`; the integration test under `task-2/tests/integration/`. Vitest is the runner (Vite default).

---

## Out of Scope

The following are intentionally **not** built. They are listed so Lovable does not ad-lib them and so the report later doesn't read as missing features.

1. Paid tickets / payments. The Free/Paid toggle **is** rendered with the disabled "Coming soon" tooltip per the brief, but no `is_paid` column or payment code path exists.
2. Magic-link sign-in.
3. 24-hour reminder emails or any time-scheduled notification.
4. Gallery approval/rejection email notices.
5. Provider-specific calendar links (Google / Outlook / Apple dropdown). The `.ics` is universal.
6. Map widgets, geocoding, "events near me" radius search.
7. AI auto-moderation of reports or gallery photos.
8. Image thumbnails, multiple sizes, image CDN configuration.
9. Dark mode.
10. In-app messaging between Hosts and attendees; Host-to-attendee bulk announcements.
11. Profile customization beyond display name + avatar.
12. Event series / recurring events.
13. Comments / questions on event pages.
14. Multi-language / i18n.
15. Mobile native apps — responsive web only.
16. Edit-notification emails when a Host changes a published event's date or venue. ("Edited at" timestamp on the page is the entire mechanism.)
17. Re-reporting after dismissal — DB unique constraint blocks it.
18. Capacity reduction below current `going` count — UI rejects.
19. Host-side cancellation of an individual `Rsvp` — only the whole event can be cancelled.

---

## Further Notes

### Brief-vs-PRD reconciliations

A handful of brief statements were made more precise here. The full glossary is `CONTEXT.md`; key reconciliations:

- The brief's "Host" is split into **`HostOrg`** (the publishing entity, with a public Host page) and the **`Host` member role** (a `Membership.role` value). The brief's "Hosts can invite members" maps to: a `Host` member of a `HostOrg` can invite, by managing the `HostOrg`'s two `Invite` rows.
- The brief's "Public (searchable) or Unlisted (link-only)" maps to `Event.visibility ∈ {public, unlisted}`, independent of `state`.
- The brief's "date range filter (Upcoming by default), location filter, and Include Past toggle" is reconciled into two real controls: a date-range picker (with `From` floored at today by default) and a single "Include past events" toggle.
- The brief's "RSVP and attendance" CSV is one combined CSV per event (all `Rsvp` rows in any state, with `Check-in Time` empty for non-checked-in rows), not two separate files.
- The brief's "Free/Paid toggle with Paid 'Coming soon'" is honored as **pure UI** — toggle rendered, Paid disabled with tooltip, no `is_paid` column or payment code path.

### Seed data (committed to demo deploy)

- 3 demo `User`s (`host@demo.app`, `checker@demo.app`, `attendee@demo.app`), all with password `Demo1234!`. Credentials documented in `task-2/README.md`.
  - No seeded user holds the Platform Admin role; `is_platform_admin = true` must be granted via SQL to exercise `/admin/reports`.
- 2 `HostOrg`s: *Riverside Coding Collective* (in-person, Berlin) and *Async Founders Lounge* (online).
- 5 `Event`s spanning every state: a past in-person event (with check-in history + ≥3 feedback ratings), an upcoming in-person event with waitlist (capacity 5, 4 going + 2 waitlisted), an upcoming online event, a draft, and an unlisted upcoming event.
- One `pending` `GalleryPhoto` on the past event.
- One `pending` `Report` against an event.
- A sample CSV at `task-2/samples/rsvps-sample.csv`.

### Submission artifacts

- Public deployed URL (Lovable preview domain).
- Demo credentials in `task-2/README.md`.
- Direct URL of the unlisted event in `task-2/README.md`.
- Sample CSV at `task-2/samples/rsvps-sample.csv`.
- `task-2/report.md` covering tools and techniques used, what worked, what did not, and notable decisions.
- `task-2/README.md` step-by-step usage guide for the main flows: Publish → RSVP → Ticket → Check-in.

### Risks / known sharp edges

- **Concurrent RSVPs at capacity-1.** Mitigated by `SELECT … FOR UPDATE` on the event row inside the edge function. The Capacity Decider unit tests exercise the math; the integration test exercises the lock indirectly (sequenced calls).
- **Email deliverability.** Resend dev sender is rate-limited and may land in spam for unfamiliar domains. Acceptable for a demo; sample emails are also viewable in the Resend dashboard if needed during the demo.
- **Browser canvas resize** is the only image processing. Some image formats (HEIC) may not be readable by `canvas.drawImage` — accepted formats (`jpeg`, `png`, `webp`) are explicit and validated client-side.
- **Promoted-but-unaware attendee.** A waitlisted attendee promoted to `going` may not realize until next visit (no email by design). Documented; non-blocking for a prototype.
- **Re-publishing after Unpublish.** Existing tickets stay valid. If the Host changes capacity downward in the editor while unpublished, the same "below current going" guard applies.
