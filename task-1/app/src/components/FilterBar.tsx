import type { ActivityCategory } from "../types/activity";
import type {
  LeaderboardFilters,
  LeaderboardQuarter,
} from "../types/leaderboard";
import type { FilterOption } from "../utils/filterOptions";
import { FilterDropdown } from "./FilterDropdown";
import { SearchBox } from "./SearchBox";

type FilterBarProps = {
  filters: LeaderboardFilters;
  yearOptions: FilterOption<number | undefined>[];
  quarterOptions: FilterOption<LeaderboardQuarter | undefined>[];
  categoryOptions: FilterOption<ActivityCategory | undefined>[];
  onYearChange: (year: number | undefined) => void;
  onQuarterChange: (quarter: LeaderboardQuarter | undefined) => void;
  onCategoryChange: (category: ActivityCategory | undefined) => void;
  onSearchChange: (searchQuery: string) => void;
};

export function FilterBar({
  filters,
  yearOptions,
  quarterOptions,
  categoryOptions,
  onYearChange,
  onQuarterChange,
  onCategoryChange,
  onSearchChange,
}: FilterBarProps) {
  return (
    <div className="toolbarShell">
      <div className="toolbarShell__filters">
        <FilterDropdown
          label="Filter by year"
          placeholder="All Years"
          options={yearOptions}
          value={filters.year}
          onChange={onYearChange}
        />
        <FilterDropdown
          label="Filter by quarter"
          placeholder="Quarter"
          options={quarterOptions}
          value={filters.quarter}
          onChange={onQuarterChange}
        />
        <FilterDropdown
          label="Filter by category"
          placeholder="All Categories"
          options={categoryOptions}
          value={filters.category}
          onChange={onCategoryChange}
        />
      </div>
      <SearchBox
        value={filters.searchQuery ?? ""}
        onChange={onSearchChange}
      />
    </div>
  );
}
