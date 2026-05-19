/**
 * Parses and validates the ATC_* environment variables into an immutable Config.
 *
 * Collects every error before returning — startup must surface all problems at once
 * (PRD User Story #2). No partial-success state.
 */

export type ConfigError = {
  variable: string;
  message: string;
};

export type Config = Readonly<{
  runwayLengthsM: readonly number[];
  gateCount: number;
  groundCrewCount: number;
  landingDurationMin: number;
  takeoffDurationMin: number;
  gateTurnaroundMin: number;
  separationTakeoffMin: number;
  separationLandingMin: number;
  separationMixedMin: number;
  dependencyBufferMin: number;
  maxHorizonMin: number;
  defaultTimezone: string;
}>;

export type ParseResult =
  | { ok: true; config: Config }
  | { ok: false; errors: ConfigError[] };

const REQUIRED_INT_VARS: ReadonlyArray<{
  key: keyof Config;
  envName: string;
  minimum: number;
}> = [
  { key: "gateCount", envName: "ATC_GATE_COUNT", minimum: 1 },
  { key: "groundCrewCount", envName: "ATC_GROUND_CREW_COUNT", minimum: 1 },
  { key: "landingDurationMin", envName: "ATC_LANDING_DURATION_MIN", minimum: 1 },
  { key: "takeoffDurationMin", envName: "ATC_TAKEOFF_DURATION_MIN", minimum: 1 },
  { key: "gateTurnaroundMin", envName: "ATC_GATE_TURNAROUND_MIN", minimum: 1 },
  { key: "separationTakeoffMin", envName: "ATC_SEPARATION_TAKEOFF_MIN", minimum: 0 },
  { key: "separationLandingMin", envName: "ATC_SEPARATION_LANDING_MIN", minimum: 0 },
  { key: "separationMixedMin", envName: "ATC_SEPARATION_MIXED_MIN", minimum: 0 },
  { key: "dependencyBufferMin", envName: "ATC_DEPENDENCY_BUFFER_MIN", minimum: 0 },
  { key: "maxHorizonMin", envName: "ATC_MAX_HORIZON_MIN", minimum: 1 },
];

const DEFAULT_TIMEZONE = "UTC";

export function parseFromEnv(env: NodeJS.ProcessEnv): ParseResult {
  const errors: ConfigError[] = [];

  const runwayLengthsM = parseRunwayLengths(env.ATC_RUNWAY_LENGTHS_M, errors);

  const ints: Partial<Record<keyof Config, number>> = {};
  for (const spec of REQUIRED_INT_VARS) {
    const value = parsePositiveInt(env[spec.envName], spec.envName, spec.minimum, errors);
    if (value !== null) {
      (ints as Record<string, number>)[spec.key] = value;
    }
  }

  const defaultTimezone = parseTimezone(env.ATC_DEFAULT_TIMEZONE, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const config: Config = {
    runwayLengthsM: runwayLengthsM ?? [],
    gateCount: ints.gateCount!,
    groundCrewCount: ints.groundCrewCount!,
    landingDurationMin: ints.landingDurationMin!,
    takeoffDurationMin: ints.takeoffDurationMin!,
    gateTurnaroundMin: ints.gateTurnaroundMin!,
    separationTakeoffMin: ints.separationTakeoffMin!,
    separationLandingMin: ints.separationLandingMin!,
    separationMixedMin: ints.separationMixedMin!,
    dependencyBufferMin: ints.dependencyBufferMin!,
    maxHorizonMin: ints.maxHorizonMin!,
    defaultTimezone,
  };

  return { ok: true, config };
}

function parseRunwayLengths(
  raw: string | undefined,
  errors: ConfigError[],
): readonly number[] | null {
  const variable = "ATC_RUNWAY_LENGTHS_M";
  if (raw === undefined || raw.trim() === "") {
    errors.push({ variable, message: "missing required environment variable" });
    return null;
  }
  const parts = raw.split(",").map((s) => s.trim());
  const startingErrorCount = errors.length;
  const values: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === "") {
      errors.push({
        variable,
        message: `entry ${i + 1}: empty value (got "${raw}")`,
      });
      continue;
    }
    if (!INTEGER_PATTERN.test(part)) {
      errors.push({
        variable,
        message: `entry ${i + 1}: expected integer, got "${part}"`,
      });
      continue;
    }
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1) {
      errors.push({
        variable,
        message: `entry ${i + 1}: must be ≥1, got ${n}`,
      });
      continue;
    }
    values.push(n);
  }
  if (errors.length > startingErrorCount) {
    return null;
  }
  if (values.length === 0) {
    errors.push({ variable, message: "at least one runway length is required" });
    return null;
  }
  return values;
}

const INTEGER_PATTERN = /^-?\d+$/;

function parsePositiveInt(
  raw: string | undefined,
  variable: string,
  minimum: number,
  errors: ConfigError[],
): number | null {
  if (raw === undefined || raw.trim() === "") {
    errors.push({ variable, message: "missing required environment variable" });
    return null;
  }
  const trimmed = raw.trim();
  if (!INTEGER_PATTERN.test(trimmed)) {
    errors.push({
      variable,
      message: `expected integer, got "${raw}"`,
    });
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n)) {
    errors.push({ variable, message: `expected integer, got "${raw}"` });
    return null;
  }
  if (n < minimum) {
    errors.push({
      variable,
      message: `must be ≥${minimum}, got ${n}`,
    });
    return null;
  }
  return n;
}

function parseTimezone(raw: string | undefined, errors: ConfigError[]): string {
  const variable = "ATC_DEFAULT_TIMEZONE";
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TIMEZONE;
  }
  const candidate = raw.trim();
  if (!isValidIanaTimezone(candidate)) {
    errors.push({
      variable,
      message: `unknown IANA timezone "${candidate}"`,
    });
    return DEFAULT_TIMEZONE;
  }
  return candidate;
}

/**
 * Validates an IANA timezone name against the system tz database via `Intl.DateTimeFormat`.
 * A timezone that the runtime cannot resolve throws a `RangeError` during construction.
 * We additionally require the input to match `resolvedOptions().timeZone` exactly so
 * that case-folded inputs like `europe/warsaw` are rejected — the resolved form is the
 * single source of truth per ADR-0002 (no silent normalisation, no silent UTC fallback).
 * Aliases that the tz database itself preserves (e.g. `US/Eastern`) round-trip and are
 * therefore accepted, since the system tz database treats them as first-class names.
 */
export function isValidIanaTimezone(name: string): boolean {
  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions()
      .timeZone;
    return resolved === name;
  } catch {
    return false;
  }
}

/**
 * Renders a `ConfigError[]` as a single multi-line block suitable for stderr.
 */
export function formatErrors(errors: readonly ConfigError[]): string {
  const lines = ["Invalid configuration — fix all of the following and restart:"];
  for (const e of errors) {
    lines.push(`  - ${e.variable}: ${e.message}`);
  }
  return lines.join("\n");
}
