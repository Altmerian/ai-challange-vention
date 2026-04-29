import type { ActivityCategory } from "./activity";

export type LeaderboardQuarter = "Q1" | "Q2" | "Q3" | "Q4";

export type LeaderboardFilters = {
  year?: number;
  quarter?: LeaderboardQuarter;
  category?: ActivityCategory;
  searchQuery?: string;
};

export type LeaderboardActivityRow = {
  id: string;
  title: string;
  category: ActivityCategory;
  date: string;
  points: number;
};

export type CategoryCounts = Record<ActivityCategory, number>;

export type LeaderboardEmployee = {
  employeeGuid: string;
  rank: number;
  name: string;
  title: string;
  unit: string;
  email: string;
  avatar: string;
  totalScore: number;
  categoryCounts: CategoryCounts;
  activities: LeaderboardActivityRow[];
};
