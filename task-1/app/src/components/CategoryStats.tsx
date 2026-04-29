import type { ActivityCategory } from "../types/activity";
import type { CategoryCounts } from "../types/leaderboard";
import { categoryIconMap } from "./icons";

const stableOrder: ActivityCategory[] = [
  "Learning",
  "Mentorship",
  "Speaking",
  "Community",
];

type CategoryStatsProps = {
  counts: CategoryCounts;
};

export function CategoryStats({ counts }: CategoryStatsProps) {
  const visible = stableOrder.filter((category) => counts[category] > 0);
  if (visible.length === 0) {
    return <div className="categoryStats categoryStats--empty" aria-hidden />;
  }
  return (
    <ul className="categoryStats" aria-label="Activity categories">
      {visible.map((category) => {
        const Icon = categoryIconMap[category];
        return (
          <li key={category} className="categoryStat">
            <Icon className="categoryStat__icon" width={20} height={20} />
            <span className="categoryStat__count" aria-label={`${category}: ${counts[category]}`}>
              {counts[category]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
