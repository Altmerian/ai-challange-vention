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
