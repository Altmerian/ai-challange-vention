import { describe, expect, it } from "vitest";

import { formatErrors, parseFromEnv } from "../src/config.js";

function makeEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {
    ATC_RUNWAY_LENGTHS_M: "2500,3500",
    ATC_GATE_COUNT: "4",
    ATC_GROUND_CREW_COUNT: "2",
    ATC_LANDING_DURATION_MIN: "5",
    ATC_TAKEOFF_DURATION_MIN: "4",
    ATC_GATE_TURNAROUND_MIN: "30",
    ATC_SEPARATION_TAKEOFF_MIN: "2",
    ATC_SEPARATION_LANDING_MIN: "2",
    ATC_SEPARATION_MIXED_MIN: "3",
    ATC_DEPENDENCY_BUFFER_MIN: "15",
    ATC_MAX_HORIZON_MIN: "240",
    ATC_DEFAULT_TIMEZONE: "Europe/Warsaw",
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

describe("parseFromEnv", () => {
  it("parses a fully valid env into a config matching the spec", () => {
    const result = parseFromEnv(makeEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.runwayLengthsM).toEqual([2500, 3500]);
    expect(result.config.gateCount).toBe(4);
    expect(result.config.groundCrewCount).toBe(2);
    expect(result.config.landingDurationMin).toBe(5);
    expect(result.config.takeoffDurationMin).toBe(4);
    expect(result.config.gateTurnaroundMin).toBe(30);
    expect(result.config.separationTakeoffMin).toBe(2);
    expect(result.config.separationLandingMin).toBe(2);
    expect(result.config.separationMixedMin).toBe(3);
    expect(result.config.dependencyBufferMin).toBe(15);
    expect(result.config.maxHorizonMin).toBe(240);
    expect(result.config.defaultTimezone).toBe("Europe/Warsaw");
  });

  it("defaults ATC_DEFAULT_TIMEZONE to UTC when unset", () => {
    const result = parseFromEnv(makeEnv({ ATC_DEFAULT_TIMEZONE: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.defaultTimezone).toBe("UTC");
  });

  it("reports a missing required variable", () => {
    const result = parseFromEnv(makeEnv({ ATC_GATE_COUNT: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      variable: "ATC_GATE_COUNT",
      message: expect.stringMatching(/missing required/),
    });
  });

  it("rejects a non-integer value for an int field", () => {
    const result = parseFromEnv(makeEnv({ ATC_LANDING_DURATION_MIN: "5.5" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      variable: "ATC_LANDING_DURATION_MIN",
      message: expect.stringMatching(/expected integer/),
    });
  });

  it("rejects an out-of-range value (minimum violated)", () => {
    const result = parseFromEnv(makeEnv({ ATC_GATE_COUNT: "0" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      variable: "ATC_GATE_COUNT",
      message: expect.stringMatching(/≥1/),
    });
  });

  it("rejects an invalid IANA timezone with no silent UTC fallback", () => {
    const result = parseFromEnv(makeEnv({ ATC_DEFAULT_TIMEZONE: "Mars/Olympus" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      variable: "ATC_DEFAULT_TIMEZONE",
      message: expect.stringMatching(/Mars\/Olympus/),
    });
  });

  it("collects multiple errors in one pass instead of short-circuiting", () => {
    const result = parseFromEnv(
      makeEnv({
        ATC_GATE_COUNT: "0",
        ATC_LANDING_DURATION_MIN: "abc",
        ATC_DEFAULT_TIMEZONE: "Not/A_Zone",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    const variables = result.errors.map((e) => e.variable);
    expect(variables).toContain("ATC_GATE_COUNT");
    expect(variables).toContain("ATC_LANDING_DURATION_MIN");
    expect(variables).toContain("ATC_DEFAULT_TIMEZONE");
  });

  it("rejects ATC_RUNWAY_LENGTHS_M with non-integer entries", () => {
    const result = parseFromEnv(makeEnv({ ATC_RUNWAY_LENGTHS_M: "2500,foo" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.variable).toBe("ATC_RUNWAY_LENGTHS_M");
  });

  it("rejects empty ATC_RUNWAY_LENGTHS_M", () => {
    const result = parseFromEnv(makeEnv({ ATC_RUNWAY_LENGTHS_M: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.variable).toBe("ATC_RUNWAY_LENGTHS_M");
  });

  it("rejects runway lengths below the minimum (≥1)", () => {
    const result = parseFromEnv(makeEnv({ ATC_RUNWAY_LENGTHS_M: "2500,0" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.variable).toBe("ATC_RUNWAY_LENGTHS_M");
  });

  it("collects every bad entry within ATC_RUNWAY_LENGTHS_M (no within-var short-circuit)", () => {
    const result = parseFromEnv(makeEnv({ ATC_RUNWAY_LENGTHS_M: "0,foo,3000,-1" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const runwayErrors = result.errors.filter((e) => e.variable === "ATC_RUNWAY_LENGTHS_M");
    expect(runwayErrors.length).toBe(3);
    expect(runwayErrors[0]?.message).toMatch(/entry 1/);
    expect(runwayErrors[1]?.message).toMatch(/entry 2/);
    expect(runwayErrors[2]?.message).toMatch(/entry 4/);
  });

  it("rejects case-folded IANA names (Europe/Warsaw must round-trip exactly)", () => {
    const result = parseFromEnv(makeEnv({ ATC_DEFAULT_TIMEZONE: "europe/warsaw" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.variable).toBe("ATC_DEFAULT_TIMEZONE");
  });
});

describe("formatErrors", () => {
  it("renders a header and one bullet per error", () => {
    const text = formatErrors([
      { variable: "ATC_GATE_COUNT", message: "must be ≥1, got 0" },
      { variable: "ATC_DEFAULT_TIMEZONE", message: 'unknown IANA timezone "X"' },
    ]);
    expect(text.split("\n")).toEqual([
      "Invalid configuration — fix all of the following and restart:",
      "  - ATC_GATE_COUNT: must be ≥1, got 0",
      '  - ATC_DEFAULT_TIMEZONE: unknown IANA timezone "X"',
    ]);
  });
});
