# Task

In this task you will use Lovable to build and deploy a web application from scratch.

Your goal is to build a lightweight event hosting and attendance platform — a tool for running free community-style events end to end. It lets organizers publish an event page and share it publicly, while attendees can confirm they are coming and receive a digital pass. The goal is to make it easy to manage turnout and entry at the venue, and to capture basic post-event outcomes.

## Core publishing and hosting

- Any user can register as a Host via a self-serve flow.
- Host profile includes: name, logo, short bio, and contact email, with a public Host page.
- Event creation supports: title, description, start and end date/time with time zone, venue address or online link, capacity, and cover image.
- Events can be Public (searchable) or Unlisted (link-only), and exist in Draft or Published state with Publish, Unpublish, and Duplicate actions.
- A Free/Paid toggle is visible in the event editor; the Paid option is disabled with a "Coming soon" tooltip.

## Discovery and sharing

- An Explore page allows browsing events with text search, date range filter (Upcoming by default), location filter, and an "Include Past" toggle.
- Past events display a clear "Ended" state; the RSVP option is hidden.
- Event and Host pages include social preview metadata for shareable links.

## RSVP and tickets

- RSVP requires sign-in; unauthenticated users are redirected to sign-in and returned to the event page afterward.
- Capacity is enforced; RSVPs beyond capacity go to a waitlist.
- Confirmed attendees receive a ticket with a unique QR code and an "Add to Calendar" option.
- Attendees can cancel their RSVP; a "My Tickets" page shows all upcoming tickets.

## Waitlist

- Waitlist is FIFO; the next person in queue is automatically promoted when a seat opens due to a cancellation or capacity increase.
- Promotion is visible in-app to the affected attendee.

## Roles and permissions

- Each Host supports two member roles: Host and Checker.
- Hosts can invite members by role via a copyable link.
- Host role covers all management actions: creating and managing events, approving gallery uploads, viewing the dashboard, and exporting CSVs.
- Checker role is limited to accessing the check-in page for events under that Host.

## Host dashboard and operations

- Host dashboard lists Upcoming and Past events with per-event stats: Going, Waitlist, and Checked-in counts.
- CSV export is available for RSVPs and attendance, with columns: name, email, RSVP status, and check-in time. Exported files must open correctly in Excel and Google Sheets.
- A "My Events" page aggregates all events where the user holds a role, with filters by Host, date range, and text search, and role-appropriate quick actions.

## Check-in page

- A Checker can open the check-in page for an event and scan QR codes or enter codes manually. QR codes must be generated for each ticket; scanning them with a camera is not required — manual code entry is sufficient.
- The page shows live counters, prevents duplicate check-ins, and supports undoing the last scan.

## Community content and feedback

- Attendees can submit post-event feedback after the event ends: a 1–5 star rating plus an optional comment.
- Attendees can upload photos to an event gallery; uploads require Host approval before being displayed publicly.
- Any user can report an event or photo; reported items appear in a review queue and can be hidden.

## Requirements

### Application behavior

- Unauthenticated users can browse all events, including past ones.
- Clicking RSVP when signed out prompts sign-in and returns to the event page afterward.
- Signed-in users can register as a Host, create and publish Public or Unlisted free events, and manage them from the Host dashboard.
- Signed-in users can RSVP to an event, immediately view a unique QR ticket, add the event to their calendar, cancel their RSVP, and view all upcoming tickets on a Tickets page.
- When capacity is reached, new RSVPs go to the waitlist; the next person in queue is promoted automatically when a seat opens.
- A Checker can open the check-in page, enter codes manually, view live counters, avoid duplicate scans, and undo the last scan.
- Gallery uploads require Host approval before public display; post-event feedback is available after the event ends.
- The "Report" flow surfaces reported items in a review list; they can be hidden from public view.
- "My Events" is visible to users with roles and aggregates their events with filters and appropriate quick actions.
- The event editor shows the Free/Paid toggle with Paid disabled and an explanatory tooltip.
- Past event pages clearly show "Ended" and hide the RSVP option.

### Submission artifacts

- A shareable public URL to a working deployed application.
- The deployed app must have at least one Host, one upcoming event, and one past event seeded.
- At least one example CSV export file demonstrating the correct schema.
- A `report.md` in your repository covering: tools and techniques used, what worked, what did not, and any notable decisions made during development.
- A step-by-step README file explaining the main flows: Publish → RSVP → Ticket → Check-in. This should be a usage guide, not a copy of the requirements.
- Your GitHub repository must be public, with the project placed in a `task-2` folder.

---

\* — a working solution does not need to cover every requirement perfectly — we understand that some features may be harder to implement than others. What matters is genuine effort: a well-structured application that seriously attempts the full scope will qualify for compensation even if a few things are incomplete. However, a rushed or minimally implemented submission that covers only a fraction of the requirements will not.
