import type { ActivityRecord, AvatarByEmployeeGuid } from "../types/activity";
import activitiesJson from "./activities.json";
import avatarsJson from "./avatars.json";

export const activityRecords: ActivityRecord[] =
  activitiesJson as ActivityRecord[];

export const avatarByEmployeeGuid: AvatarByEmployeeGuid =
  avatarsJson as AvatarByEmployeeGuid;
