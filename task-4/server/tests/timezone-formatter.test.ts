import { describe, expect, it } from "vitest";

import { InvalidTimezoneError, formatOffsetInZone } from "../src/timezone-formatter.js";

describe("formatOffsetInZone", () => {
  it("renders UTC with +00:00 offset and minute precision", () => {
    const anchor = new Date("2026-05-19T10:00:00Z");
    const text = formatOffsetInZone(45, anchor, "UTC");
    expect(text).toBe("2026-05-19T10:45:00+00:00");
  });

  it("renders Europe/Warsaw with its CEST offset on a summer date", () => {
    const anchor = new Date("2026-07-15T09:00:00Z");
    // 2026-07-15 is CEST (UTC+2). 0 offset = local 11:00:00.
    expect(formatOffsetInZone(0, anchor, "Europe/Warsaw")).toBe(
      "2026-07-15T11:00:00+02:00",
    );
  });

  it("crosses a Europe/Warsaw DST transition (CET → CEST 2026-03-29)", () => {
    // 00:30 UTC on the DST-spring-forward day in Warsaw: still CET (+01:00) → 01:30 local.
    const anchor = new Date("2026-03-29T00:30:00Z");
    expect(formatOffsetInZone(0, anchor, "Europe/Warsaw")).toBe(
      "2026-03-29T01:30:00+01:00",
    );
    // 02:30 UTC after the spring-forward at 02:00 wall-time (which jumps to 03:00):
    // wall-time is 04:30, offset is +02:00 (CEST).
    const afterDst = new Date("2026-03-29T02:30:00Z");
    expect(formatOffsetInZone(0, afterDst, "Europe/Warsaw")).toBe(
      "2026-03-29T04:30:00+02:00",
    );
  });

  it("renders a non-UTC fixed-offset zone (Asia/Tokyo, +09:00, no DST)", () => {
    const anchor = new Date("2026-05-19T00:00:00Z");
    expect(formatOffsetInZone(90, anchor, "Asia/Tokyo")).toBe(
      "2026-05-19T10:30:00+09:00",
    );
  });

  it("renders a half-hour offset zone correctly", () => {
    // Node's Intl canonicalises Asia/Kolkata → Asia/Calcutta, and Config rejects
    // names that do not round-trip exactly. Use the canonical form.
    const anchor = new Date("2026-05-19T00:00:00Z");
    expect(formatOffsetInZone(0, anchor, "Asia/Calcutta")).toBe(
      "2026-05-19T05:30:00+05:30",
    );
  });

  it("throws InvalidTimezoneError for an unknown IANA name", () => {
    expect(() =>
      formatOffsetInZone(0, new Date("2026-05-19T00:00:00Z"), "Mars/Olympus"),
    ).toThrow(InvalidTimezoneError);
  });

  it("rejects case-folded zone names (no silent normalisation)", () => {
    expect(() =>
      formatOffsetInZone(0, new Date("2026-05-19T00:00:00Z"), "europe/warsaw"),
    ).toThrow(InvalidTimezoneError);
  });

  it("rejects a non-integer minute offset", () => {
    expect(() =>
      formatOffsetInZone(1.5, new Date("2026-05-19T00:00:00Z"), "UTC"),
    ).toThrow(/integer minute/);
  });
});
