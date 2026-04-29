import type { LeaderboardEmployee } from "../types/leaderboard";
import { EmptyState } from "./EmptyState";
import { LeaderboardRow } from "./LeaderboardRow";

type LeaderboardListProps = {
  employees: LeaderboardEmployee[];
  expandedEmployeeGuid: string | null;
  onToggleEmployeeDetails: (employeeGuid: string) => void;
};

export function LeaderboardList({
  employees,
  expandedEmployeeGuid,
  onToggleEmployeeDetails,
}: LeaderboardListProps) {
  if (employees.length === 0) {
    return (
      <div className="leaderboardList">
        <EmptyState />
      </div>
    );
  }

  return (
    <ol className="leaderboardList">
      {employees.map((employee) => (
        <li key={employee.employeeGuid} className="leaderboardList__item">
          <LeaderboardRow
            employee={employee}
            isExpanded={employee.employeeGuid === expandedEmployeeGuid}
            onToggleDetails={() => onToggleEmployeeDetails(employee.employeeGuid)}
          />
        </li>
      ))}
    </ol>
  );
}
