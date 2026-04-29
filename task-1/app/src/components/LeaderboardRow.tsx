import type { LeaderboardEmployee } from "../types/leaderboard";
import { CategoryStats } from "./CategoryStats";
import { ExpandButton } from "./ExpandButton";
import { ExpandedActivityTable } from "./ExpandedActivityTable";
import { ScoreDisplay } from "./ScoreDisplay";

type LeaderboardRowProps = {
  employee: LeaderboardEmployee;
  isExpanded: boolean;
  onToggleDetails: () => void;
};

export function LeaderboardRow({
  employee,
  isExpanded,
  onToggleDetails,
}: LeaderboardRowProps) {
  const subtitle =
    employee.title && employee.unit
      ? `${employee.title} (${employee.unit})`
      : employee.title || employee.unit;
  const detailsId = `activity-details-${employee.employeeGuid}`;

  return (
    <article
      className={
        isExpanded
          ? "leaderboardRowContainer leaderboardRowContainer--expanded"
          : "leaderboardRowContainer"
      }
    >
      <div className="leaderboardRow">
        <span className="leaderboardRow__rank">{employee.rank}</span>
        {employee.avatar ? (
          <img
            className="leaderboardRow__avatar"
            src={employee.avatar}
            alt=""
            draggable={false}
          />
        ) : (
          <div
            className="leaderboardRow__avatar leaderboardRow__avatar--empty"
            aria-hidden
          />
        )}
        <div className="leaderboardRow__identity">
          <h3 className="leaderboardRow__name">{employee.name}</h3>
          <span className="leaderboardRow__role">{subtitle}</span>
        </div>
        <CategoryStats counts={employee.categoryCounts} />
        <ScoreDisplay score={employee.totalScore} />
        <ExpandButton
          employeeName={employee.name}
          detailsId={detailsId}
          isExpanded={isExpanded}
          onToggle={onToggleDetails}
        />
      </div>
      {isExpanded ? (
        <ExpandedActivityTable
          id={detailsId}
          activities={employee.activities}
        />
      ) : null}
    </article>
  );
}
