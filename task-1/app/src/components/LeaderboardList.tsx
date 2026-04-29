import type { LeaderboardEmployee } from "../types/leaderboard";
import { LeaderboardRow } from "./LeaderboardRow";

type LeaderboardListProps = {
  employees: LeaderboardEmployee[];
};

export function LeaderboardList({ employees }: LeaderboardListProps) {
  return (
    <div className="leaderboardList" role="list">
      {employees.map((employee) => (
        <div key={employee.employeeGuid} role="listitem">
          <LeaderboardRow employee={employee} />
        </div>
      ))}
    </div>
  );
}
