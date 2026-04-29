export type ActivityCategory =
  | "Learning"
  | "Mentorship"
  | "Speaking"
  | "Community";

export type ActivityRecord = {
  ActivityExternalId: string;
  EmployeeName: string;
  EmployeeTitle: string;
  EmployeeUnit: string;
  ActivityEndDate: string;
  Email: string;
  ActivityCategory: ActivityCategory;
  "Employee GUID": string;
  ActivityPoints: number;
  ActivityTitle: string;
};

export type AvatarByEmployeeGuid = Record<string, string>;
