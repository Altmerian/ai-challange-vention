import type { LeaderboardActivityRow } from "../types/leaderboard";

type ExpandedActivityTableProps = {
  id: string;
  activities: LeaderboardActivityRow[];
};

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatActivityDate = (date: string) => {
  const [year, month, day] = date.slice(0, 10).split("-");
  const monthIndex = Number(month) - 1;
  const monthName = monthNames[monthIndex];
  if (!year || !monthName || !day) return date.slice(0, 10);
  return `${day}-${monthName}-${year}`;
};

export function ExpandedActivityTable({
  id,
  activities,
}: ExpandedActivityTableProps) {
  const titleId = `${id}-title`;

  return (
    <section className="activityDetails" id={id} aria-labelledby={titleId}>
      <h3 className="detailsTitle" id={titleId}>
        Recent Activity
      </h3>
      <div className="activityDetails__tableWrap">
        <table className="activityTable">
          <thead>
            <tr>
              <th scope="col">Activity</th>
              <th scope="col">Category</th>
              <th scope="col">Date</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => (
              <tr key={activity.id}>
                <td className="activityName">{activity.title}</td>
                <td>
                  <span className="categoryBadge">{activity.category}</span>
                </td>
                <td className="activityDate">
                  {formatActivityDate(activity.date)}
                </td>
                <td className="activityPoints">+{activity.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
