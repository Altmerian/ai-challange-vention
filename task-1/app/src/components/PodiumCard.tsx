import type { LeaderboardEmployee } from "../types/leaderboard";
import { ScoreDisplay } from "./ScoreDisplay";

type PodiumCardProps = {
  employee: LeaderboardEmployee;
};

export function PodiumCard({ employee }: PodiumCardProps) {
  const subtitleParts = [employee.title, employee.unit].filter(Boolean);
  return (
    <div className={`podiumCard podiumCard--rank${employee.rank}`}>
      <div className="podiumCard__avatarWrap">
        {employee.avatar ? (
          <img
            className="podiumCard__avatar"
            src={employee.avatar}
            alt=""
            draggable={false}
          />
        ) : (
          <div className="podiumCard__avatar podiumCard__avatar--empty" aria-hidden />
        )}
        <div className="podiumCard__rankBadge" aria-label={`Rank ${employee.rank}`}>
          {employee.rank}
        </div>
      </div>
      <h3 className="podiumCard__name">{employee.name}</h3>
      <p className="podiumCard__role">{subtitleParts.join(" · ")}</p>
      <ScoreDisplay score={employee.totalScore} variant="podium" />
      <div className="podiumCard__block" aria-hidden />
    </div>
  );
}
