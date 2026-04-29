import { describe, expect, it } from "vitest";
import type {
  ActivityCategory,
  ActivityRecord,
  AvatarByEmployeeGuid,
} from "../types/activity";
import {
  deriveLeaderboard,
  getAvailableYears,
  getQuarterFromDate,
} from "./leaderboard";
import {
  getCategoryFilterOptions,
  getQuarterFilterOptions,
  getYearFilterOptions,
} from "./filterOptions";

const A_GUID = "guid-a";
const B_GUID = "guid-b";
const C_GUID = "guid-c";

const makeRecord = (overrides: Partial<ActivityRecord>): ActivityRecord => ({
  ActivityExternalId: "act-x",
  EmployeeName: "Default Name",
  EmployeeTitle: "Default Title",
  EmployeeUnit: "Default Unit",
  ActivityEndDate: "2025-04-15",
  Email: "default@example.com",
  ActivityCategory: "Learning" satisfies ActivityCategory,
  "Employee GUID": A_GUID,
  ActivityPoints: 10,
  ActivityTitle: "Default Activity",
  ...overrides,
});

const avatars: AvatarByEmployeeGuid = {
  [A_GUID]: "data:image/svg+xml;base64,AAA",
  [B_GUID]: "data:image/svg+xml;base64,BBB",
};

describe("deriveLeaderboard", () => {
  it("groups records that share an Employee GUID into one employee", () => {
    const records: ActivityRecord[] = [
      makeRecord({ ActivityExternalId: "act-1", "Employee GUID": A_GUID }),
      makeRecord({ ActivityExternalId: "act-2", "Employee GUID": A_GUID }),
      makeRecord({ ActivityExternalId: "act-3", "Employee GUID": B_GUID }),
    ];
    const result = deriveLeaderboard(records, avatars);
    expect(result).toHaveLength(2);
    const a = result.find((e) => e.employeeGuid === A_GUID)!;
    expect(a.activities).toHaveLength(2);
  });

  it("sums ActivityPoints into totalScore for grouped records", () => {
    const records: ActivityRecord[] = [
      makeRecord({
        ActivityExternalId: "act-1",
        "Employee GUID": A_GUID,
        ActivityPoints: 10,
      }),
      makeRecord({
        ActivityExternalId: "act-2",
        "Employee GUID": A_GUID,
        ActivityPoints: 5,
      }),
    ];
    const [a] = deriveLeaderboard(records, avatars);
    expect(a.totalScore).toBe(15);
  });

  it("derives category counts and activity rows from the same filtered records", () => {
    const records: ActivityRecord[] = [
      makeRecord({
        ActivityExternalId: "act-1",
        "Employee GUID": A_GUID,
        ActivityCategory: "Learning",
        ActivityPoints: 10,
      }),
      makeRecord({
        ActivityExternalId: "act-2",
        "Employee GUID": A_GUID,
        ActivityCategory: "Learning",
        ActivityPoints: 4,
      }),
      makeRecord({
        ActivityExternalId: "act-3",
        "Employee GUID": A_GUID,
        ActivityCategory: "Speaking",
        ActivityPoints: 6,
      }),
    ];
    const [a] = deriveLeaderboard(records, avatars);
    expect(a.categoryCounts).toEqual({
      Learning: 2,
      Mentorship: 0,
      Speaking: 1,
      Community: 0,
    });
    expect(a.activities).toHaveLength(3);
    expect(a.totalScore).toBe(20);
  });

  it("applies year, quarter, and category filters before scoring", () => {
    const records: ActivityRecord[] = [
      makeRecord({
        ActivityExternalId: "act-1",
        "Employee GUID": A_GUID,
        ActivityEndDate: "2025-02-10",
        ActivityCategory: "Learning",
        ActivityPoints: 10,
      }),
      makeRecord({
        ActivityExternalId: "act-2",
        "Employee GUID": A_GUID,
        ActivityEndDate: "2024-08-10",
        ActivityCategory: "Learning",
        ActivityPoints: 100,
      }),
      makeRecord({
        ActivityExternalId: "act-3",
        "Employee GUID": A_GUID,
        ActivityEndDate: "2025-06-15",
        ActivityCategory: "Learning",
        ActivityPoints: 50,
      }),
      makeRecord({
        ActivityExternalId: "act-4",
        "Employee GUID": A_GUID,
        ActivityEndDate: "2025-02-22",
        ActivityCategory: "Mentorship",
        ActivityPoints: 99,
      }),
    ];
    const [a] = deriveLeaderboard(records, avatars, {
      year: 2025,
      quarter: "Q1",
      category: "Learning",
    });
    expect(a.totalScore).toBe(10);
    expect(a.activities.map((r) => r.id)).toEqual(["act-1"]);
  });

  it("removes employees with no matching activities after filtering", () => {
    const records: ActivityRecord[] = [
      makeRecord({
        ActivityExternalId: "act-1",
        "Employee GUID": A_GUID,
        ActivityEndDate: "2025-04-10",
        ActivityCategory: "Learning",
      }),
      makeRecord({
        ActivityExternalId: "act-2",
        "Employee GUID": B_GUID,
        ActivityEndDate: "2024-04-10",
        ActivityCategory: "Learning",
      }),
    ];
    const result = deriveLeaderboard(records, avatars, { year: 2025 });
    expect(result.map((e) => e.employeeGuid)).toEqual([A_GUID]);
  });

  it("filters by query across name, title, and unit fields with trim/lowercase", () => {
    const records: ActivityRecord[] = [
      makeRecord({
        ActivityExternalId: "act-1",
        "Employee GUID": A_GUID,
        EmployeeName: "Uladzislau Marchyk",
        EmployeeTitle: "Software Engineer",
        EmployeeUnit: "Platform",
        ActivityPoints: 30,
      }),
      makeRecord({
        ActivityExternalId: "act-2",
        "Employee GUID": A_GUID,
        EmployeeName: "Uladzislau Marchyk",
        EmployeeTitle: "Software Engineer",
        EmployeeUnit: "Platform",
        ActivityPoints: 20,
      }),
      makeRecord({
        ActivityExternalId: "act-3",
        "Employee GUID": B_GUID,
        EmployeeName: "Rochelle Hackett",
        EmployeeTitle: "Senior Engineer",
        EmployeeUnit: "Research",
        ActivityPoints: 100,
      }),
      makeRecord({
        ActivityExternalId: "act-4",
        "Employee GUID": C_GUID,
        EmployeeName: "Lillie Nikolaus-Gerhold",
        EmployeeTitle: "Architect",
        EmployeeUnit: "Mobile",
        ActivityPoints: 90,
      }),
    ];
    const result = deriveLeaderboard(records, avatars, { searchQuery: "  RCH  " });
    // Multi-field haystack matches: B (Research), C (Architect), A (Marchyk).
    expect(result.map((e) => e.employeeGuid)).toEqual([B_GUID, C_GUID, A_GUID]);
    expect(result.find((e) => e.employeeGuid === A_GUID)?.totalScore).toBe(50);
  });

  it("sorts employees by descending score and assigns 1-based ranks deterministically", () => {
    const records: ActivityRecord[] = [
      makeRecord({
        ActivityExternalId: "act-1",
        "Employee GUID": A_GUID,
        EmployeeName: "Bravo",
        ActivityPoints: 50,
      }),
      makeRecord({
        ActivityExternalId: "act-2",
        "Employee GUID": B_GUID,
        EmployeeName: "Alpha",
        ActivityPoints: 50,
      }),
      makeRecord({
        ActivityExternalId: "act-3",
        "Employee GUID": C_GUID,
        EmployeeName: "Charlie",
        ActivityPoints: 100,
      }),
    ];
    const result = deriveLeaderboard(records, {
      ...avatars,
      [C_GUID]: "data:image/svg+xml;base64,CCC",
    });
    expect(result.map((e) => ({ guid: e.employeeGuid, rank: e.rank }))).toEqual([
      { guid: C_GUID, rank: 1 },
      { guid: B_GUID, rank: 2 },
      { guid: A_GUID, rank: 3 },
    ]);
  });

  it("returns an empty array when filters/search match no records", () => {
    const records: ActivityRecord[] = [
      makeRecord({ "Employee GUID": A_GUID, ActivityEndDate: "2025-04-10" }),
    ];
    const result = deriveLeaderboard(records, avatars, { year: 2099 });
    expect(result).toEqual([]);
  });

  it("falls back to empty avatar string when GUID is missing in avatar map", () => {
    const records: ActivityRecord[] = [
      makeRecord({ "Employee GUID": "unknown" }),
    ];
    const [emp] = deriveLeaderboard(records, avatars);
    expect(emp.avatar).toBe("");
  });
});

describe("filter helpers", () => {
  it("getAvailableYears returns unique years sorted descending", () => {
    const records: ActivityRecord[] = [
      makeRecord({ ActivityEndDate: "2024-04-10" }),
      makeRecord({ ActivityEndDate: "2026-01-15" }),
      makeRecord({ ActivityEndDate: "2025-12-31" }),
      makeRecord({ ActivityEndDate: "2025-03-01" }),
    ];
    expect(getAvailableYears(records)).toEqual([2026, 2025, 2024]);
  });

  it("getQuarterFromDate maps month to Q1..Q4", () => {
    expect(getQuarterFromDate("2025-01-01")).toBe("Q1");
    expect(getQuarterFromDate("2025-03-31")).toBe("Q1");
    expect(getQuarterFromDate("2025-04-01")).toBe("Q2");
    expect(getQuarterFromDate("2025-06-30")).toBe("Q2");
    expect(getQuarterFromDate("2025-07-01")).toBe("Q3");
    expect(getQuarterFromDate("2025-09-30")).toBe("Q3");
    expect(getQuarterFromDate("2025-10-01")).toBe("Q4");
    expect(getQuarterFromDate("2025-12-31")).toBe("Q4");
  });

  it("builds year dropdown options with the all-years default first", () => {
    const records: ActivityRecord[] = [
      makeRecord({ ActivityEndDate: "2025-04-10" }),
      makeRecord({ ActivityEndDate: "2026-01-15" }),
      makeRecord({ ActivityEndDate: "2025-12-31" }),
    ];
    expect(getYearFilterOptions(records)).toEqual([
      { value: undefined, label: "All Years" },
      { value: 2026, label: "2026" },
      { value: 2025, label: "2025" },
    ]);
  });

  it("builds the five quarter dropdown options", () => {
    expect(getQuarterFilterOptions()).toEqual([
      { value: undefined, label: "All Quarters" },
      { value: "Q1", label: "Q1" },
      { value: "Q2", label: "Q2" },
      { value: "Q3", label: "Q3" },
      { value: "Q4", label: "Q4" },
    ]);
  });

  it("builds the five category dropdown options with the all-categories default first", () => {
    expect(getCategoryFilterOptions()).toEqual([
      { value: undefined, label: "All Categories" },
      { value: "Learning", label: "Learning" },
      { value: "Mentorship", label: "Mentorship" },
      { value: "Speaking", label: "Speaking" },
      { value: "Community", label: "Community" },
    ]);
  });
});
