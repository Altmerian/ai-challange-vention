import type { ActivityCategory, ActivityRecord } from "../types/activity";
import type { LeaderboardQuarter } from "../types/leaderboard";
import { getAvailableYears } from "./leaderboard";

export type FilterOption<T> = {
  value: T;
  label: string;
};

export const getYearFilterOptions = (
  records: ActivityRecord[],
): FilterOption<number | undefined>[] => [
  { value: undefined, label: "All Years" },
  ...getAvailableYears(records).map((year) => ({
    value: year,
    label: String(year),
  })),
];

export const getQuarterFilterOptions = (): FilterOption<
  LeaderboardQuarter | undefined
>[] => [
  { value: undefined, label: "All Quarters" },
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
];

export const getCategoryFilterOptions = (): FilterOption<
  ActivityCategory | undefined
>[] => [
  { value: undefined, label: "All Categories" },
  { value: "Learning", label: "Learning" },
  { value: "Mentorship", label: "Mentorship" },
  { value: "Speaking", label: "Speaking" },
  { value: "Community", label: "Community" },
];
