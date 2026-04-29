import { LeaderboardWidget } from "./components/LeaderboardWidget";
import {
  activityRecords,
  avatarByEmployeeGuid,
} from "./data/leaderboardData";

export default function App() {
  return (
    <LeaderboardWidget
      activityRecords={activityRecords}
      avatarByEmployeeGuid={avatarByEmployeeGuid}
    />
  );
}
