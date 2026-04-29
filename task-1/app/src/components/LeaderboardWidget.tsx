import { useEffect, useMemo, useState } from "react";
import type { ActivityRecord, AvatarByEmployeeGuid } from "../types/activity";
import type { LeaderboardFilters } from "../types/leaderboard";
import {
  getCategoryFilterOptions,
  getQuarterFilterOptions,
  getYearFilterOptions,
} from "../utils/filterOptions";
import { deriveLeaderboard } from "../utils/leaderboard";
import { FilterBar } from "./FilterBar";
import { LeaderboardHeader } from "./LeaderboardHeader";
import { LeaderboardList } from "./LeaderboardList";
import { Podium } from "./Podium";

type LeaderboardWidgetProps = {
  activityRecords: ActivityRecord[];
  avatarByEmployeeGuid: AvatarByEmployeeGuid;
};

export function LeaderboardWidget({
  activityRecords,
  avatarByEmployeeGuid,
}: LeaderboardWidgetProps) {
  const [filters, setFilters] = useState<LeaderboardFilters>({});
  const [expandedEmployeeGuid, setExpandedEmployeeGuid] = useState<string | null>(
    null,
  );
  const yearOptions = useMemo(
    () => getYearFilterOptions(activityRecords),
    [activityRecords],
  );
  const quarterOptions = useMemo(() => getQuarterFilterOptions(), []);
  const categoryOptions = useMemo(() => getCategoryFilterOptions(), []);
  const employees = useMemo(
    () => deriveLeaderboard(activityRecords, avatarByEmployeeGuid, filters),
    [activityRecords, avatarByEmployeeGuid, filters],
  );
  const topThree = employees.slice(0, 3);

  useEffect(() => {
    if (
      expandedEmployeeGuid !== null &&
      !employees.some((employee) => employee.employeeGuid === expandedEmployeeGuid)
    ) {
      setExpandedEmployeeGuid(null);
    }
  }, [employees, expandedEmployeeGuid]);

  const handleToggleEmployeeDetails = (employeeGuid: string) => {
    setExpandedEmployeeGuid((current) =>
      current === employeeGuid ? null : employeeGuid,
    );
  };

  return (
    <section className="leaderboardRoot" aria-label="Leaderboard">
      <LeaderboardHeader
        title="Leaderboard"
        subtitle="Top performers based on contributions and activity"
      />
      <FilterBar
        filters={filters}
        yearOptions={yearOptions}
        quarterOptions={quarterOptions}
        categoryOptions={categoryOptions}
        onYearChange={(year) => setFilters((current) => ({ ...current, year }))}
        onQuarterChange={(quarter) =>
          setFilters((current) => ({ ...current, quarter }))
        }
        onCategoryChange={(category) =>
          setFilters((current) => ({ ...current, category }))
        }
        onSearchChange={(searchQuery) =>
          setFilters((current) => ({ ...current, searchQuery }))
        }
      />
      <Podium topThree={topThree} />
      <LeaderboardList
        employees={employees}
        expandedEmployeeGuid={expandedEmployeeGuid}
        onToggleEmployeeDetails={handleToggleEmployeeDetails}
      />
    </section>
  );
}
