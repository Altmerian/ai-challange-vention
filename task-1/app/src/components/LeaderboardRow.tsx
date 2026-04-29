import type { LeaderboardEmployee } from "../types/leaderboard";
import { CategoryStats } from "./CategoryStats";
import { ExpandButton } from "./ExpandButton";
import { ScoreDisplay } from "./ScoreDisplay";

type LeaderboardRowProps = {
  employee: LeaderboardEmployee;
};

export function LeaderboardRow({ employee }: LeaderboardRowProps) {
  const subtitleParts = [employee.title, employee.unit].filter(Boolean);
  return (
    <article className="leaderboardRow">
      <span className="leaderboardRow__rank">{employee.rank}</span>
      {employee.avatar ? (
        <img
          className="leaderboardRow__avatar"
          src={employee.avatar}
          alt=""
          draggable={false}
        />
      ) : (
        <div className="leaderboardRow__avatar leaderboardRow__avatar--empty" aria-hidden />
      )}
      <div className="leaderboardRow__identity">
        <h3 className="leaderboardRow__name">{employee.name}</h3>
        <span className="leaderboardRow__role">{subtitleParts.join(" · ")}</span>
      </div>
      <CategoryStats counts={employee.categoryCounts} />
      <ScoreDisplay score={employee.totalScore} />
      <ExpandButton />
    </article>
  );
}
