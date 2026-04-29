import type {
  ActivityRecord,
  AvatarByEmployeeGuid,
} from "../types/activity";
import type {
  CategoryCounts,
  LeaderboardActivityRow,
  LeaderboardEmployee,
  LeaderboardFilters,
  LeaderboardQuarter,
} from "../types/leaderboard";

const emptyCategoryCounts = (): CategoryCounts => ({
  Learning: 0,
  Mentorship: 0,
  Speaking: 0,
  Community: 0,
});

export const getQuarterFromDate = (date: string): LeaderboardQuarter => {
  const month = Number(date.slice(5, 7));
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
};

export const getAvailableYears = (records: ActivityRecord[]): number[] => {
  const years = new Set<number>();
  for (const record of records) {
    const year = Number(record.ActivityEndDate.slice(0, 4));
    if (!Number.isNaN(year)) years.add(year);
  }
  return Array.from(years).sort((a, b) => b - a);
};

const matchesActivityFilters = (
  record: ActivityRecord,
  filters: LeaderboardFilters,
): boolean => {
  if (filters.year !== undefined) {
    const year = Number(record.ActivityEndDate.slice(0, 4));
    if (year !== filters.year) return false;
  }
  if (filters.quarter !== undefined) {
    if (getQuarterFromDate(record.ActivityEndDate) !== filters.quarter) return false;
  }
  if (filters.category !== undefined) {
    if (record.ActivityCategory !== filters.category) return false;
  }
  return true;
};

const toActivityRow = (record: ActivityRecord): LeaderboardActivityRow => ({
  id: record.ActivityExternalId,
  title: record.ActivityTitle,
  category: record.ActivityCategory,
  date: record.ActivityEndDate,
  points: record.ActivityPoints,
});

const matchesSearch = (employee: LeaderboardEmployee, query: string): boolean => {
  const haystack = `${employee.name} ${employee.title} ${employee.unit}`.toLowerCase();
  return haystack.includes(query);
};

export const deriveLeaderboard = (
  records: ActivityRecord[],
  avatars: AvatarByEmployeeGuid,
  filters: LeaderboardFilters = {},
): LeaderboardEmployee[] => {
  const filtered = records.filter((record) => matchesActivityFilters(record, filters));

  const grouped = new Map<string, LeaderboardEmployee>();
  for (const record of filtered) {
    const guid = record["Employee GUID"];
    let employee = grouped.get(guid);
    if (!employee) {
      employee = {
        employeeGuid: guid,
        rank: 0,
        name: record.EmployeeName,
        title: record.EmployeeTitle,
        unit: record.EmployeeUnit,
        email: record.Email,
        avatar: avatars[guid] ?? "",
        totalScore: 0,
        categoryCounts: emptyCategoryCounts(),
        activities: [],
      };
      grouped.set(guid, employee);
    }
    employee.totalScore += record.ActivityPoints;
    employee.categoryCounts[record.ActivityCategory] += 1;
    employee.activities.push(toActivityRow(record));
  }

  let employees = Array.from(grouped.values());

  const trimmedQuery = filters.searchQuery?.trim().toLowerCase() ?? "";
  if (trimmedQuery.length > 0) {
    employees = employees.filter((employee) => matchesSearch(employee, trimmedQuery));
  }

  // Strict string comparators (not localeCompare) so ranks match byte-for-byte
  // across browsers and CI locales — same rationale as the data generator.
  employees.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.employeeGuid === b.employeeGuid) return 0;
    return a.employeeGuid < b.employeeGuid ? -1 : 1;
  });

  employees.forEach((employee, index) => {
    employee.rank = index + 1;
  });

  return employees;
};
