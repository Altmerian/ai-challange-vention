# Integer-minute time model with wall-clock anchor and per-call IANA timezone

All durations, buffers, horizons, and operation offsets are non-negative integer **minutes**. Each **Scheduling Pass** captures `schedule_start_at` once as a UTC ISO-8601 instant (minute precision); every operation's canonical position is its integer `start_offset_min` / `end_offset_min` relative to that anchor. Tool responses additionally emit `start_at` / `end_at` as ISO-8601 strings *with offset baked in*, formatted in the **Client Timezone** (an optional IANA name passed per tool call, falling back to `ATC_DEFAULT_TIMEZONE`).

## Why

Three forces pointed here:

- **Determinism.** The integer-minute offset is the canonical, deterministic value; the wall-clock anchor floats but is recorded once per pass so re-derivation is exact. Determinism tests compare offsets, not wall-clock strings.
- **Human readability.** Airport schedules are conventionally expressed in minutes; sub-minute precision is meaningless here. Operators reading the env vars see "5" (minutes), not "300" (seconds).
- **Client locality.** AI clients typically operate in a user-local timezone — emitting offset-bearing ISO strings in the client's zone lets the agent read them without a conversion step, while the underlying schedule remains timezone-free.

## Considered alternatives

- **Seconds.** Sub-minute precision is meaningless in this domain; minutes give smaller integers and human-readable env vars.
- **UTC-only ISO strings, no offsets stored.** Loses the deterministic anchor and forces clients to know "what is t=0?" externally.
- **Per-server timezone via env var only.** Multi-tenant clients with different locales would all see the server's zone — unhelpful.

## Consequences

The `timezone` argument is accepted by every tool that emits timestamps (`generate_schedule`, `cancel_flight`, `get_airport_status`, `analyze_bottleneck`). It defaults to `ATC_DEFAULT_TIMEZONE` (which itself defaults to `UTC`). Validation against the system tz database is mandatory — invalid names are an error envelope, not silent UTC fallback.
