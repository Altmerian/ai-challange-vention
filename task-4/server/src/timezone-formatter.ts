/**
 * Pure timezone formatter.
 *
 * Maps an integer-minute offset relative to a UTC anchor into an ISO-8601 string
 * **with offset baked in**, rendered in the supplied IANA Client Timezone (PRD
 * ADR-0002). Invalid IANA names raise `InvalidTimezoneError` — no silent UTC
 * fallback.
 *
 * The implementation goes through `Intl.DateTimeFormat` so DST transitions are
 * handled by the system tz database. The offset is back-computed from the
 * formatted wall-time rather than parsed from `longOffset`, because runtimes
 * differ in whether they emit `GMT+02:00` or `+02:00` and how they render UTC
 * (some emit just `GMT`).
 */

import { isValidIanaTimezone } from "./config.js";

export class InvalidTimezoneError extends Error {
  readonly timezone: string;
  constructor(timezone: string) {
    super(`unknown IANA timezone "${timezone}"`);
    this.name = "InvalidTimezoneError";
    this.timezone = timezone;
  }
}

/**
 * Renders the instant `anchorUTC + offsetMin` minutes as an ISO-8601 string in
 * `timezone`. Anchor must be a UTC `Date`; offset is integer minutes (the canonical
 * scheduling unit per ADR-0002).
 */
export function formatOffsetInZone(
  offsetMin: number,
  anchorUTC: Date,
  timezone: string,
): string {
  if (!Number.isInteger(offsetMin)) {
    throw new Error(`formatOffsetInZone requires integer minute offset (got ${offsetMin})`);
  }
  if (!isValidIanaTimezone(timezone)) {
    throw new InvalidTimezoneError(timezone);
  }
  const instant = new Date(anchorUTC.getTime() + offsetMin * 60_000);
  return formatInstantInZone(instant, timezone);
}

/**
 * Renders a Date as an ISO-8601 string in `timezone` with offset suffix.
 *
 * Pulls year/month/day/hour/minute/second from `Intl.DateTimeFormat` and computes
 * the offset by reading the same wall-time as UTC and diffing — this avoids
 * runtime-dependent parsing of `timeZoneName: "longOffset"`.
 */
function formatInstantInZone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const wall = collectParts(parts);
  const offsetMs = computeOffsetMs(instant, wall);
  const offsetSuffix = formatOffsetSuffix(offsetMs);
  return `${wall.year}-${wall.month}-${wall.day}T${wall.hour}:${wall.minute}:${wall.second}${offsetSuffix}`;
}

type WallTime = Readonly<{
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}>;

function collectParts(parts: Intl.DateTimeFormatPart[]): WallTime {
  const out: Partial<Record<string, string>> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      out[p.type] = p.value;
    }
  }
  return {
    year: required(out.year, "year"),
    month: required(out.month, "month"),
    day: required(out.day, "day"),
    hour: required(out.hour, "hour") === "24" ? "00" : required(out.hour, "hour"),
    minute: required(out.minute, "minute"),
    second: required(out.second, "second"),
  };
}

function required(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`Intl.DateTimeFormat did not emit ${name} part`);
  }
  return value;
}

function computeOffsetMs(instant: Date, wall: WallTime): number {
  const asUtcMs = Date.UTC(
    Number(wall.year),
    Number(wall.month) - 1,
    Number(wall.day),
    Number(wall.hour),
    Number(wall.minute),
    Number(wall.second),
  );
  return asUtcMs - instant.getTime();
}

function formatOffsetSuffix(offsetMs: number): string {
  const sign = offsetMs >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMs);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
