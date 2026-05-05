# Task 2 — Context

Domain language for the Lovable event hosting prototype. Definitions here override the looser usage in `task-2-description.md`.

## Glossary

### User
An authenticated person. Has a single account, can be a member of zero or more `HostOrg`s, and can RSVP to events.

### HostOrg
The publishing entity — the "Host" the brief refers to as a profile with name, logo, bio, and contact email. Has a public Host page. Owns events. Has members.

> Avoid the bare term **Host** for the entity — it collides with the member role. Use `HostOrg`.

### Membership
The link between a `User` and a `HostOrg`, carrying exactly one role: `Host` or `Checker`. A `User` may belong to multiple `HostOrg`s with different roles in each.

### Host (role)
Membership role with full management rights inside a `HostOrg`: create/manage events, approve gallery uploads, view dashboard, export CSVs, invite members.

### Checker (role)
Membership role limited to the check-in page for events under that `HostOrg`. No event editing, no dashboard, no exports.

### Register as a Host
The self-serve flow that creates a new `HostOrg` and makes the current `User` its first member with role `Host`.

### My Events
A page aggregating events across **every** `HostOrg` the current `User` is a member of, with role-appropriate quick actions per event.

### Sign-in
Authentication via **email + password** (primary) or **Google OAuth** (one-click). No magic links. Seeded demo `User`s have known passwords so graders can log in deterministically.

### Event time
Stored as UTC `timestamptz` plus an IANA zone string (e.g. `"Europe/Berlin"`) on the event row. The zone is part of the event, not the viewer.

### Time display rule
Primary clock = **event-local time** (with the zone label, e.g. "19:00 CET"). When the viewer's browser zone differs from the event zone, a secondary muted line shows **viewer-local time** ("your time: 13:00 EST"). The editor defaults the zone selector to the `HostOrg`'s saved zone, falling back to the browser zone for the first event. `.ics` exports use `TZID=` so calendar apps convert. The "Ended" state is computed from event end UTC vs `now()`.

### Ticket
Issued to a `User` on confirmed RSVP. Belongs to one event and one user. Carries a unique opaque **code**: 8 characters from an unambiguous alphabet (no `0/O`, `1/I/L`), formatted `XXXX-XXXX` for readability. The QR encodes the raw code string.

### Check-in
Marking a `Ticket` as redeemed by setting `checked_in_at` and `checked_in_by` (= the redeeming `User`'s id). Performed on the event's check-in page by a `Checker` or `Host` member of the event's `HostOrg`. Accepts the code via manual entry or QR scan. Authorization gate: the code's event must match the URL's event AND the current `User` must have a `Membership` in that event's `HostOrg`. Re-scanning a redeemed ticket shows "Already checked in at HH:MM" and does not double-count.

**Undo last scan:** the check-in edge function exposes an `undo(ticket_id)` action. Server-side preconditions (all must hold):
1. The ticket is currently `checked_in` (`checked_in_at IS NOT NULL`).
2. `checked_in_by` matches the calling `User`.
3. `checked_in_at` is within the last **60 seconds**.

If any precondition fails, the action returns an explanatory error and does nothing. This makes Undo safe across multiple concurrent checkers (each scanner can only undo their own most-recent scan, within a tight window) without modeling a checker-session entity.

### Rsvp
A `User`'s response to an event. States: `going`, `waitlisted`, `cancelled`. A `going` `Rsvp` always has exactly one active `Ticket`; `cancelled` voids it. The `going` count is enforced ≤ event capacity.

### Waitlist
Ordered queue of `waitlisted` `Rsvp`s for an event, ordered by creation time (FIFO). A waitlisted attendee sees their position and the `Ticket` UI is hidden.

### Promotion
The act of flipping a `waitlisted` `Rsvp` to `going` and issuing a `Ticket`. Triggered automatically when (a) a `going` attendee cancels, or (b) a `Host` increases capacity. Sets `promoted_at`. Visible in-app to the promoted attendee on next visit (no email in MVP). The promoted seat is held — the attendee can subsequently cancel like any `going` attendee.

### Event mode
`event.mode` is either `in_person` (requires `address` — plain text, no geocoding) or `online` (requires `online_url`). The editor shows one of the two fields based on the toggle. Address is never geocoded; no map widget in MVP.

### Online URL gating
**Storage:** `online_url` lives on a separate `EventOnlineLink` table (1:1 with `Event`, FK `event_id UNIQUE`), **not** as a column on `Event`. Rationale: Lovable Cloud surfaces `Event` rows to anonymous clients through RLS; RLS filters rows, not columns, so storing the URL on `Event` would leak it to every public reader.

**Access:** `EventOnlineLink` rows are unreadable from the browser (RLS denies all client-side reads). The link is fetched by a dedicated edge function `event-join-link(event_id)` which returns the URL only when the caller is (a) a `going` attendee of the event, or (b) a member of the event's `HostOrg`. All other callers receive `null`.

**UI:** Public visitors see "Online event — RSVP to receive the join link". `going` attendees see the URL on their Ticket and event page. The `.ics` `LOCATION` field is filled only for ticketed attendees and is generated server-side via the same edge function (or client-side after a successful `event-join-link` call).

### Capacity rules
- All RSVP / promotion writes go through a single Lovable Cloud edge function that runs the count + insert in one transaction with row-level locking on the event, preventing oversell races.
- A `Host` cannot lower capacity below the current `going` count; the editor blocks this with an inline error.
- A `Host` cannot cancel an individual `Rsvp` — only unpublish or cancel the whole event.
- An attendee can cancel any time before `event.end`.

### Image upload rules
- **Buckets** (Supabase Storage): `host-logos` (public-read), `event-covers` (public-read), `gallery` (private; signed URLs).
- **Accepted formats:** `image/jpeg`, `image/png`, `image/webp`.
- **Max input size:** 8 MB.
- **Client-side normalization** before upload: longest edge resized to 1600 px on a `canvas`, re-encoded as WebP quality 0.85. Server validates final size and MIME.
- No thumbnails, no server-side image pipeline, no EXIF stripping beyond what canvas re-encoding drops, no AI auto-moderation.

### Add to Calendar
A single button on the Ticket UI that downloads an `.ics` file generated client-side. The file uses `TZID=` matching the event's IANA zone, includes `SUMMARY`, `DESCRIPTION`, `URL` (event page), and `UID = "{ticket.code}@{app-domain}"`. `LOCATION` follows the online-URL gating rule. No Google/Outlook/Apple provider dropdown — `.ics` is universal.

### Platform Admin
A `User`-level boolean (`is_platform_admin`) seeded by SQL — there is no UI to grant or revoke. Platform Admins access `/admin/reports` and resolve reports against events themselves. The role is orthogonal to `Membership`; a Platform Admin is not implicitly a member of any `HostOrg`.

### Report
A flag raised by a **signed-in** `User` against an `Event` or a `GalleryPhoto`. Anonymous reporting is **not supported** — the "Report" action redirects unauthenticated visitors through sign-in first.

Schema: `reportable_type` (`event` | `gallery_photo`), `reportable_id`, `reporter_user_id` (NOT NULL), `reason TEXT` (≤500 chars, free text), `status` (`pending` | `actioned` | `dismissed`), `resolved_by_user_id NULLABLE`, `resolved_at NULLABLE`. Unique constraint on `(reporter_user_id, reportable_type, reportable_id)` — one report per user per target. (Reason for the NOT NULL: PostgreSQL UNIQUE treats NULLs as distinct by default, which would let anonymous reporters duplicate-flood the queue.)

### Report routing
- Reports on an `Event` → reviewed by **Platform Admins** at `/admin/reports`.
- Reports on a `GalleryPhoto` → reviewed by **`Host` members** of the photo's `HostOrg` from a "Reports" tab on the dashboard.

### Hide (moderation action)
Resolution = setting `hidden_at` on the target and the report's `status = actioned`. A hidden `Event` 404s for the public (visible only to its `HostOrg` members and Platform Admins). A hidden `GalleryPhoto` is removed from public gallery views. Reversible by the same reviewer ("Unhide" clears `hidden_at`). Dismissal sets `status = dismissed` without affecting the target.

### Free/Paid
The brief requires a Free/Paid toggle in the event editor with the Paid option disabled and a "Coming soon" tooltip. **Honored as pure UI** — the toggle is rendered, Paid is `disabled` and shows the tooltip on hover. There is no `is_paid` column on `Event` and no payment code path; selecting Paid is impossible. All events are free.

### Seed data
Bootstrapped on first deploy via a seed migration. Demo credentials are committed in `task-2/README.md` so graders can sign in.

**`User`s (3):**
- `host@demo.app` / `Demo1234!` — Host of *Riverside Coding Collective*. (Not a Platform Admin in the seed; that role is left unassigned and must be granted via SQL to exercise `/admin/reports`.)
- `checker@demo.app` / `Demo1234!` — Checker of *Riverside Coding Collective*.
- `attendee@demo.app` / `Demo1234!` — Has RSVPs across multiple events.

**`HostOrg`s (2):**
- *Riverside Coding Collective* — in-person, Berlin (`Europe/Berlin`).
- *Async Founders Lounge* — online-mostly.

**`Event`s (5), covering every state worth demoing:**
1. Past in-person event (Riverside) with 1 `checked_in` attendee, 1 no-show, ≥3 `Feedback` ratings → exercises check-in history, CSV with check-in time, public aggregate rating.
2. Upcoming in-person event (Riverside, capacity 5) with 4 `going` + 2 `waitlisted` → exercises waitlist UI.
3. Upcoming online event (Async) → exercises `online_url` gating.
4. Draft event (Riverside) → exercises draft visibility.
5. Unlisted upcoming event (Async) → URL goes in submission.

**Other seeded fixtures:**
- One `pending` `GalleryPhoto` on event #1.
- One `pending` `Report` against an event.
- Sample CSV at `task-2/samples/rsvps-sample.csv` exported from event #1.

### Out of scope
Explicitly NOT built (called out in the PRD so Lovable doesn't ad-lib them):

1. Paid tickets / payments / Free–Paid toggle.
2. Magic-link sign-in.
3. 24-hour reminder emails.
4. Gallery approval/rejection email notices.
5. Provider-specific calendar links (Google/Outlook dropdown).
6. Map widgets / geocoding.
7. AI auto-moderation.
8. Image thumbnails, multiple sizes, image CDN config.
9. Dark mode.
10. In-app messaging between Hosts and attendees; Host-to-attendee announcements.
11. Profile customization beyond name + avatar.
12. Event series / recurring events.
13. Comments / questions on event pages.
14. Multi-language / i18n.
15. Mobile native apps — responsive web only.

### Look & feel
Warm-neutral light theme, single accent. Reference vibe: lu.ma + Linear.

- **Palette tokens:**
  - `--bg`: `#FAFAF8`
  - `--surface`: `#FFFFFF`
  - `--text`: `#0F1014`
  - `--muted`: `#6B6F76`
  - `--accent`: `#D85C3F` (terracotta) — primary buttons, links, RSVP CTA, focus rings
- **Typography:** system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). No webfont. Headings differ from body by weight only.
- **Geometry:** generous whitespace; cards rounded `12px`, buttons rounded `8px`.
- **Components:** shadcn/ui defaults, only re-skinned via Tailwind theme tokens. Do not fork components.
- **Event cards:** photo-forward, 16:9 cover, title below, time + venue + Host underneath.
- **Dark mode:** out of scope for MVP — toggle disabled.

### Event state machine
`draft` → `published` ⇄ `unpublished` → `cancelled`. Plus the **derived** `ended` state, which is `event.end < now()` evaluated at read time (no DB transition).

| State | Public visibility | Accepts RSVPs | RSVP button | Notes |
|-------|-------------------|---------------|-------------|-------|
| `draft` | `HostOrg` members only (404 for everyone else) | No | Hidden | Editable; no notifications fire. |
| `published` | Per `Visibility` (Public → Explore; Unlisted → direct URL only) | Yes | Visible | Capacity edits flow through promotion logic. |
| `unpublished` | `HostOrg` members only (404 for everyone else) | No | Hidden | Existing tickets remain valid and visible on `/my-tickets`. Re-publishable. No email fires. |
| `cancelled` | Page shows "Cancelled" badge; tickets voided | No | Hidden | Triggers the "Event cancelled by Host" email to all `going` and `waitlisted` attendees. Terminal state in UI. |

**Publish gate:** `draft` → `published` requires all of: `title`, `start`, `end`, `time_zone`, mode-specific venue, `capacity ≥ 1`, `cover_image_path`, `description`. Button is disabled with inline reasons until satisfied.

**Edit-after-publish:** all fields editable while `published`. No automatic email on edit; "Edited at {timestamp}" shows on the public event page.

### Visibility
`Event.visibility` is `public` (listed in Explore + direct URL works) or `unlisted` (direct URL only; excluded from Explore, search index, and `HostOrg` public page). Independent of state.

### Duplicate
Action available on any event regardless of state. Creates a new `Event` in `draft` state owned by the same `HostOrg`. **Copies:** `title` (suffixed with " (copy)"), `description`, `mode`, `address`, `online_url`, `capacity`, `visibility`, `cover_image_path`. **Does not copy:** `start`, `end`, `time_zone`, RSVPs, Tickets, Feedback, GalleryPhotos, Reports.

### Explore
Public discovery page listing events. Three controls (replacing the brief's overlapping list of "date range / Upcoming default / Include Past"):

1. **Text search** — Postgres full-text search over `Event.title` (weight A), `Event.description` (weight B), and the owning `HostOrg.name` (weight C). Debounced 300 ms. Results ranked by relevance.
2. **Date range** — `From` / `To` inputs. Default `From = today`, `To` empty (open-ended). Combined with the "Include past events" toggle: when toggle is off, `From` is floored to today; when on, the floor is removed.
3. **Location filter** — free-text input matched `ILIKE %term%` against `Event.address`. Plus a **Mode** dropdown (`Any | In-person | Online`). Selecting `Online` disables the location input.

**Sort:** "Include past events" off → `start ASC` (next-up first). On → `start DESC` (most recent past first).

**Past event display:** "Ended" pill, dimmed cover, no RSVP CTA on card or detail page.

**Unlisted events** are excluded from Explore results, from `HostOrg` public-page event lists, and from search indexing. They are reachable only via direct URL.

### Feedback
A `User`'s post-event review. Schema: `event_id`, `user_id`, `rating` (1–5 int), `comment TEXT NULLABLE` (≤2000 chars), `created_at`, `updated_at`. Unique on `(event_id, user_id)`.

**Eligibility:** any `User` with an `Rsvp` in `going` state for the event (check-in not required). `waitlisted`, `cancelled`, and never-RSVP'd users cannot submit.

**Window:** opens at `event.end`, closes 14 days later. Submissions are editable while the window is open. After close, the user can view their own submission read-only but cannot edit.

**Visibility:**
- **Aggregate** (average rating + count) is **public** on the event page and the `HostOrg`'s public Host page, but only displayed once the event has **≥ 3 ratings**. The Host page aggregate is computed across all past events that individually meet the ≥3 floor.
- **Individual comments and ratings** are visible only to `Host` members of the event's `HostOrg`, on the dashboard's per-event view. Never displayed publicly.

### CSV export
One CSV per event, downloaded from the event row in the Host dashboard. Generated client-side. Schema (exactly these columns, in this order):

```
Name,Email,RSVP Status,RSVP Created At,Check-in Time,Ticket Code
```

- **Encoding:** UTF-8 with BOM (`\xEF\xBB\xBF`) so Excel decodes accented characters correctly.
- **Quoting:** RFC 4180. Name is always quoted; any field containing `,`, `"`, or newline is quoted.
- **Date columns:** ISO 8601 UTC (`2026-05-05T18:31:42Z`). No locale formatting.
- **RSVP Status values:** `going`, `waitlisted`, `cancelled` (matches DB state, lowercase).
- **Empty cells:** truly empty (no `—`, no `null`). Check-in Time is empty for non-checked-in rows.
- **Scope:** all `Rsvp` rows for the event, regardless of state.
- **Filename:** `rsvps-{event-slug}-{event-start-date}.csv`.
- A sample CSV is committed at `task-2/samples/rsvps-sample.csv` as a submission artifact.

### Notification email
Transactional email via Lovable Cloud's built-in Resend integration. Sender: `notifications@{app-domain}`. Triggers in MVP, exhaustive list:
1. **RSVP confirmed** (`going` state reached, whether direct or via promotion). Contains ticket code, event title, event-local time, link.
2. **RSVP cancelled by attendee.** Plain confirmation.
3. **Event cancelled by Host.** Sent to all `going` and `waitlisted` attendees.

Explicitly **not** in MVP: 24-hour reminders, gallery approval/rejection notices, separate waitlist-promotion-only emails (covered by trigger 1), report-resolution notices.

### Invite
A reusable, role-bound, revocable join link for a `HostOrg`. Two rows per `HostOrg` — one with `role = host`, one with `role = checker`. Schema: `host_org_id`, `role`, `token TEXT UNIQUE`, `revoked_at NULLABLE`. URL form: `/join/{hostOrgId}/{token}`.

Behavior:
- Anyone with the link can join after signing in (auth gate redirects through sign-in/sign-up).
- The join action inserts a `Membership` only if the `User` is not already a member of that `HostOrg`. If they are, the join is a no-op and the existing role wins — invite links cannot be used to upgrade or downgrade an existing member's role. Role changes require an explicit action by a `Host` member on the Members page.
- "Reset link" sets `revoked_at` on the existing row and creates a new token; the old URL 404s.
- No time-based expiry.
- The `HostOrg` founder (first member) becomes a `Host` member directly via the "Register as a Host" flow; invite links are not used for the founder.

### GalleryPhoto
A photo uploaded by a `User` to an event's gallery. Status: `pending` (visible only to uploader, badged "Pending review"), `approved` (publicly visible on event page), or `rejected` (hidden, retained for audit). Hosts of the event's `HostOrg` approve or reject via the dashboard. Public access is enforced by signed URL: the storage function returns a URL only when status is `approved` or the requester is the uploader / a `HostOrg` member.
