import { LeaderboardWidget } from "./components/LeaderboardWidget";
import {
  activityRecords,
  avatarByEmployeeGuid,
} from "./data/leaderboardData";
import { deriveLeaderboard } from "./utils/leaderboard";

const employees = deriveLeaderboard(activityRecords, avatarByEmployeeGuid);

export default function App() {
  return <LeaderboardWidget employees={employees} />;
}
