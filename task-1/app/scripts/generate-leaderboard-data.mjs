import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { faker } from "@faker-js/faker";
import { createAvatar } from "@dicebear/core";
import { loreleiNeutral } from "@dicebear/collection";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../src/data");
const ACTIVITIES_PATH = path.join(DATA_DIR, "activities.json");
const AVATARS_PATH = path.join(DATA_DIR, "avatars.json");

const SEED = 20260429;
const REFERENCE_DATE = "2026-04-29T00:00:00Z";
const TARGET_EMPLOYEES = 200;
const TARGET_ACTIVITIES = 450;
const YEARS = [2025, 2026];
const QUARTERS = [1, 2, 3, 4];
const CATEGORIES = ["Learning", "Mentorship", "Speaking", "Community"];

const TITLE_BANK = [
  "Engineer",
  "Senior Engineer",
  "Staff Engineer",
  "Architect",
  "Designer",
  "Senior Designer",
  "Lead Designer",
  "Coordinator",
  "Specialist",
  "Analyst",
  "Researcher",
  "Producer",
  "Developer",
  "Senior Developer",
  "Tech Lead",
];

const UNIT_BANK = [
  "Engineering",
  "Design",
  "Operations",
  "Quality",
  "Research",
  "Platform",
  "Analytics",
  "Documentation",
  "Education",
  "Mobile",
  "Web",
  "Data",
  "Tools",
  "Reliability",
  "Growth",
];

const TOPIC_BANK = [
  "accessibility",
  "performance budgets",
  "testing strategy",
  "design systems",
  "React patterns",
  "TypeScript types",
  "code review craft",
  "API design",
  "observability",
  "feature flags",
  "data modeling",
  "CI pipelines",
  "incident response",
  "documentation hygiene",
  "release planning",
];

const TITLE_TEMPLATES = [
  (topic) => `Led session on ${topic}`,
  (topic) => `Hosted ${topic} workshop`,
  (topic) => `Mentored team on ${topic}`,
  (topic) => `Presented ${topic} at all-hands`,
  (topic) => `Wrote guide on ${topic}`,
  (topic) => `Organized ${topic} reading group`,
  (topic) => `Reviewed ${topic} proposals`,
  (topic) => `Coached peers on ${topic}`,
];

const PRIVACY_MARKERS = [
  /\/sites\/edu/i,
  /shared documents/i,
  /sharepoint/i,
  /leaderboarddata/i,
  /vention/i,
  /\bcorp\b/i,
  /\binternal\b/i,
  /\blocalhost\b/i,
];

const QUARTER_RANGES = {
  1: { startMonth: 0, endMonth: 2 },
  2: { startMonth: 3, endMonth: 5 },
  3: { startMonth: 6, endMonth: 8 },
  4: { startMonth: 9, endMonth: 11 },
};

faker.seed(SEED);
faker.setDefaultRefDate(REFERENCE_DATE);

function pad(n, width) {
  return String(n).padStart(width, "0");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function pickFromArray(arr) {
  return faker.helpers.arrayElement(arr);
}

function dateInQuarter(year, quarter) {
  const { startMonth, endMonth } = QUARTER_RANGES[quarter];
  const from = new Date(Date.UTC(year, startMonth, 1));
  const to = new Date(Date.UTC(year, endMonth + 1, 0));
  const picked = faker.date.between({ from, to });
  return picked.toISOString().slice(0, 10);
}

function buildEmployees() {
  const employees = [];
  for (let i = 0; i < TARGET_EMPLOYEES; i++) {
    const fullName = faker.person.fullName();
    const guid = faker.string.uuid();
    const title = pickFromArray(TITLE_BANK);
    const unit = pickFromArray(UNIT_BANK);
    const email = `${slugify(fullName)}.${pad(i + 1, 3)}@example.com`;
    employees.push({
      guid,
      name: fullName,
      title,
      unit,
      email,
    });
  }
  return employees;
}

function buildActivities(employees) {
  const activities = [];
  for (let i = 0; i < TARGET_ACTIVITIES; i++) {
    // Cycle deterministically across 8 (year, quarter) buckets so all
    // 4 quarters and both years are represented with even spread.
    const bucket = i % 8;
    const year = YEARS[Math.floor(bucket / 4)];
    const quarter = QUARTERS[bucket % 4];
    const date = dateInQuarter(year, quarter);

    // First TARGET_EMPLOYEES activities go 1:1 to ensure full coverage;
    // remaining activities pick a random employee.
    const employee =
      i < employees.length ? employees[i] : pickFromArray(employees);

    const category = pickFromArray(CATEGORIES);
    const topic = pickFromArray(TOPIC_BANK);
    const template = pickFromArray(TITLE_TEMPLATES);
    const points = faker.number.int({ min: 5, max: 25 });

    activities.push({
      ActivityExternalId: `act-${pad(i + 1, 4)}`,
      EmployeeName: employee.name,
      EmployeeTitle: employee.title,
      EmployeeUnit: employee.unit,
      ActivityEndDate: date,
      Email: employee.email,
      ActivityCategory: category,
      "Employee GUID": employee.guid,
      ActivityPoints: points,
      ActivityTitle: template(topic),
    });
  }
  // Stable ordering by ActivityExternalId. Use strict comparator (not
  // localeCompare) so output is byte-identical across machines/CI locales.
  activities.sort((a, b) =>
    a.ActivityExternalId < b.ActivityExternalId
      ? -1
      : a.ActivityExternalId > b.ActivityExternalId
        ? 1
        : 0,
  );
  return activities;
}

function buildAvatars(employees) {
  // Sorted by GUID for stable JSON output. Strict comparator avoids
  // host-locale sensitivity in localeCompare.
  const sorted = [...employees].sort((a, b) =>
    a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0,
  );
  const map = {};
  for (const emp of sorted) {
    const avatar = createAvatar(loreleiNeutral, { seed: emp.guid });
    map[emp.guid] = avatar.toDataUri();
  }
  return map;
}

const REQUIRED_FIELDS = [
  "ActivityExternalId",
  "EmployeeName",
  "EmployeeTitle",
  "EmployeeUnit",
  "ActivityEndDate",
  "Email",
  "ActivityCategory",
  "Employee GUID",
  "ActivityPoints",
  "ActivityTitle",
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function findPrivacyMarker(value) {
  for (const re of PRIVACY_MARKERS) {
    if (re.test(value)) return re.source;
  }
  return null;
}

function validate(activities, employees, avatars) {
  const errors = [];

  if (activities.length < 440 || activities.length > 460) {
    errors.push(
      `Activity count out of range: got ${activities.length}, expected ~450`,
    );
  }
  const guids = new Set(activities.map((a) => a["Employee GUID"]));
  if (guids.size < 195 || guids.size > 205) {
    errors.push(
      `Unique employee count out of range: got ${guids.size}, expected ~200`,
    );
  }
  if (employees.length !== TARGET_EMPLOYEES) {
    errors.push(
      `Employee bank size mismatch: got ${employees.length}, expected ${TARGET_EMPLOYEES}`,
    );
  }

  // Coverage: every employee appears in at least one activity.
  const missingEmployees = employees
    .filter((e) => !guids.has(e.guid))
    .map((e) => e.guid);
  if (missingEmployees.length > 0) {
    errors.push(
      `Employees with zero activities: ${missingEmployees.length}`,
    );
  }

  const yearSet = new Set();
  const quarterSet = new Set();
  const categorySet = new Set();

  for (const a of activities) {
    const keys = Object.keys(a);
    if (keys.length !== REQUIRED_FIELDS.length) {
      errors.push(
        `Activity ${a.ActivityExternalId} has ${keys.length} fields, expected ${REQUIRED_FIELDS.length}`,
      );
    }
    for (const f of REQUIRED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(a, f)) {
        errors.push(`Activity ${a.ActivityExternalId} missing field: ${f}`);
      }
    }
    if (typeof a.ActivityPoints !== "number" || a.ActivityPoints <= 0) {
      errors.push(
        `Activity ${a.ActivityExternalId} has invalid ActivityPoints: ${a.ActivityPoints}`,
      );
    }
    if (!ISO_DATE_RE.test(a.ActivityEndDate)) {
      errors.push(
        `Activity ${a.ActivityExternalId} has non-ISO ActivityEndDate: ${a.ActivityEndDate}`,
      );
    } else {
      const d = new Date(a.ActivityEndDate);
      if (Number.isNaN(d.getTime())) {
        errors.push(
          `Activity ${a.ActivityExternalId} ActivityEndDate is not a valid date`,
        );
      } else {
        yearSet.add(d.getUTCFullYear());
        quarterSet.add(Math.floor(d.getUTCMonth() / 3) + 1);
      }
    }
    if (!CATEGORIES.includes(a.ActivityCategory)) {
      errors.push(
        `Activity ${a.ActivityExternalId} has unknown category: ${a.ActivityCategory}`,
      );
    } else {
      categorySet.add(a.ActivityCategory);
    }
    if (!a.Email.endsWith("@example.com")) {
      errors.push(
        `Activity ${a.ActivityExternalId} has non-example.com email: ${a.Email}`,
      );
    }

    for (const f of Object.keys(a)) {
      const val = a[f];
      if (typeof val === "string") {
        const marker = findPrivacyMarker(val);
        if (marker) {
          errors.push(
            `Activity ${a.ActivityExternalId}.${f} contains privacy marker /${marker}/: "${val}"`,
          );
        }
      }
    }
  }

  if (yearSet.size !== 2) {
    errors.push(`Years covered = ${yearSet.size}, expected 2`);
  }
  if (quarterSet.size !== 4) {
    errors.push(`Quarters covered = ${quarterSet.size}, expected 4`);
  }
  if (categorySet.size !== 4) {
    errors.push(`Categories covered = ${categorySet.size}, expected 4`);
  }

  // Every employee GUID must have an avatar entry.
  for (const guid of guids) {
    if (!avatars[guid]) {
      errors.push(`Missing avatar for GUID: ${guid}`);
    }
  }
  for (const value of Object.values(avatars)) {
    if (!value.startsWith("data:image/svg+xml")) {
      errors.push(`Avatar value is not an SVG data URI`);
      break;
    }
  }

  return errors;
}

function writeJsonStable(filePath, value) {
  const json = JSON.stringify(value, null, 2) + "\n";
  writeFileSync(filePath, json, "utf8");
}

function main() {
  const employees = buildEmployees();
  const activities = buildActivities(employees);
  const avatars = buildAvatars(employees);

  const errors = validate(activities, employees, avatars);
  if (errors.length > 0) {
    console.error("Generation validation failed:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  writeJsonStable(ACTIVITIES_PATH, activities);
  writeJsonStable(AVATARS_PATH, avatars);

  console.log(
    `OK: ${activities.length} activities, ${
      new Set(activities.map((a) => a["Employee GUID"])).size
    } employees, ${Object.keys(avatars).length} avatars`,
  );
}

main();
