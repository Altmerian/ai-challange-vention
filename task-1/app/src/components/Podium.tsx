import type { LeaderboardEmployee } from "../types/leaderboard";
import { PodiumCard } from "./PodiumCard";

type PodiumProps = {
  topThree: LeaderboardEmployee[];
};

export function Podium({ topThree }: PodiumProps) {
  if (topThree.length === 0) {
    return null;
  }
  // Visual order matches the source widget: rank 2, rank 1, rank 3.
  const byRank = new Map(topThree.map((employee) => [employee.rank, employee]));
  const visualOrder: (LeaderboardEmployee | undefined)[] = [
    byRank.get(2),
    byRank.get(1),
    byRank.get(3),
  ];
  return (
    <section className="podium" aria-label="Top three employees">
      {visualOrder.map((employee, index) =>
        employee ? (
          <PodiumCard key={employee.employeeGuid} employee={employee} />
        ) : (
          <div key={`empty-${index}`} className="podium__empty" aria-hidden />
        ),
      )}
    </section>
  );
}
