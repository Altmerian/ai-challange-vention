import type { LeaderboardEmployee } from "../types/leaderboard";
import { LeaderboardHeader } from "./LeaderboardHeader";
import { LeaderboardList } from "./LeaderboardList";
import { LeaderboardToolbarShell } from "./LeaderboardToolbarShell";
import { Podium } from "./Podium";

type LeaderboardWidgetProps = {
  employees: LeaderboardEmployee[];
};

export function LeaderboardWidget({ employees }: LeaderboardWidgetProps) {
  const topThree = employees.slice(0, 3);
  return (
    <section className="leaderboardRoot" aria-label="Leaderboard">
      <LeaderboardHeader
        title="Leaderboard"
        subtitle="Employee activity ranked by total score across the synthetic dataset."
      />
      <LeaderboardToolbarShell />
      <Podium topThree={topThree} />
      <LeaderboardList employees={employees} />
    </section>
  );
}
