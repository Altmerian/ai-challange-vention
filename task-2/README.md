# Task 2 — Convene (Lovable Event Hosting Prototype)

A lightweight event hosting and attendance platform: hosts publish events, attendees RSVP and receive QR tickets, and checkers redeem those tickets at the door.

- **Live app:** https://altmer-events.lovable.app/
- **Lovable project (source):** [`lovable-app/`](./lovable-app/) — committed as a git submodule pointing at [`Altmerian/events-platform`](https://github.com/Altmerian/events-platform)
- **Submission report:** [`report.md`](./report.md)
- **PRD:** [`PRD.md`](./PRD.md) · **Domain glossary:** [`CONTEXT.md`](./CONTEXT.md)
- **Sample CSV export:** [`samples/rsvps-sample.csv`](./samples/rsvps-sample.csv)

## Demo credentials

All demo accounts share password **`Demo1234!`**.

| Email | Role |
|---|---|
| `host@demo.app` | Host of *Riverside Coding Collective* |
| `checker@demo.app` | Checker of *Riverside Coding Collective* |
| `attendee@demo.app` | Regular attendee with RSVPs across the seeded events |
| `extra1@demo.app` … `extra6@demo.app` | Extra accounts that populate the waitlist demo |

The seed includes two host orgs (*Riverside Coding Collective*, *Async Founders Lounge*) and five events covering the full lifecycle: a past event with check-ins and feedback, an upcoming event with waitlist, an upcoming online event, an unlisted upcoming event, and a draft.

## Main flows

### 1. Publish — as a Host

1. Sign in as `host@demo.app` and open the avatar menu → **Riverside Coding Collective**.
2. Click **New event** and fill the editor. The **Free / Paid** toggle is visible; **Paid** is disabled with a "Coming soon" tooltip.
3. Set title, description, start/end with time zone, capacity, address (or pick *Online* and add a join link via **Set link**), and a cover image. The **Publish** button stays disabled until every required field is set; missing fields are listed inline.
4. Save the draft, then **Publish**. From the same editor you can **Unpublish**, **Duplicate** (copies the form, not dates/RSVPs/tickets), or **Cancel** the event.
5. Public/Unlisted toggle controls discoverability — Unlisted events stay reachable by direct link but are hidden from Explore.

### 2. RSVP — as an Attendee

1. Sign in as `attendee@demo.app`. (Clicking **RSVP** while signed out redirects to sign-in and returns you to the event page.)
2. Open any published event from **Explore** and click **RSVP**.
3. If the event is at capacity you go to the **waitlist**. When a "going" attendee cancels, the next person on the waitlist is auto-promoted and a ticket is issued — the affected user sees an in-app banner.
4. You can cancel an RSVP at any time before the event ends; cancelling a "going" RSVP triggers the waitlist promotion above.

### 3. Ticket

1. Open **My Tickets** from the avatar menu — every upcoming RSVP shows here.
2. Each ticket shows a unique 8-character code formatted as `XXXX-XXXX` and a QR code encoding the same string.
3. Click **Add to Calendar** to download an `.ics` file with a `TZID=` matching the event's IANA zone — calendar apps render the correct local time wherever the attendee opens it.
4. For online events the join URL is included in the ticket and `.ics` only for confirmed attendees; unauthenticated visitors see *"RSVP to receive the join link"* on the event page.

### 4. Check-in — as a Checker (or Host)

1. Sign in as `checker@demo.app`. From the dashboard click **Check-in** on an event row, or open `/checkin/<event-id>` directly.
2. Type the ticket code (the input auto-formats to `XXXX-XXXX`) and submit. QR camera scanning is not surfaced — manual entry is the supported path per the brief.
3. Live counters show **Going / Waitlist / Checked-in**. A re-scan of an already-redeemed ticket shows the original check-in time and is not counted twice.
4. **Undo last scan** is available for **60 seconds** and only to the same checker who recorded it.

## Things to look at on the deployed site

- **Waitlist demo** — *Riverside Summer Jam* (capacity 5, 4 going + 2 waitlisted). Cancel one going RSVP and watch the next person get promoted.
- **Online URL gating** — *Founders Q&A: Async Hiring*. Logged-out and non-attendee viewers cannot see the join URL; only confirmed attendees and host-org members fetch it via the `event-join-link` edge function.
- **Unlisted event** — `/events/async-secret-roundtable`. Reachable by direct link, hidden from Explore.
- **Past event** — *Coffee & Code: Spring Edition* (already ended). RSVP is hidden, "Ended" badge is shown, going-attendees can submit feedback for 14 days.
- **CSV export** — Host dashboard → download icon on any event row. The schema is `Name,Email,RSVP Status,RSVP Created At,Check-in Time,Ticket Code` with UTF-8 BOM, RFC-4180 quoting, ISO-8601 UTC timestamps. A representative file is committed at [`samples/rsvps-sample.csv`](./samples/rsvps-sample.csv) and opens cleanly in Excel and Google Sheets.
- **Gallery** — any signed-in attendee can upload a photo to an event; Hosts approve or reject from the dashboard's Gallery queue. Approved photos are served via short-lived signed URLs.
- **Feedback** — after an event ends, attendees who were "going" can submit a 1–5 star rating + optional comment for 14 days. Public aggregate rating appears once an event has ≥3 ratings; individual comments stay private to the host org.
- **Reports & moderation** — the **Report** action on any event or photo opens a dialog. Event reports route to a Platform Admin at `/admin/reports`; gallery reports route to the host org's Hosts (dashboard → **Reports** tab). Hidden items can be unhidden. *No demo account holds the Platform Admin role in this prototype — `/admin/reports` is reachable only by promoting a user via SQL.*
- **Members & invites** — at `/host/<orgId>/members`. One reusable invite link per role (Host / Checker), copyable and revocable. Existing-role-wins if the same user follows a different invite.

## Repo layout

```
task-2/
├── README.md         ← this file (submission guide)
├── report.md         ← submission retrospective
├── PRD.md            ← product spec
├── CONTEXT.md        ← domain glossary
├── samples/
│   └── rsvps-sample.csv
├── lovable-app/      ← git submodule → github.com/Altmerian/events-platform
│                       React + Vite + TS + Tailwind + shadcn/ui +
│                       Lovable Cloud (Postgres / auth / storage / edge functions)
└── task-2-description.md
```

To check out the source locally:

```sh
git clone --recurse-submodules https://github.com/Altmerian/ai-challenge-vention.git
cd ai-challenge-vention/task-2/lovable-app
bun install
bun dev
```

The backend (Postgres + auth + storage + edge functions) is provisioned by Lovable Cloud and is already wired through `src/integrations/supabase/client.ts`.
