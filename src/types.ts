export type FrequencyKind = "daily" | "weekdays" | "custom";

export type Frequency = {
  kind: FrequencyKind;
  days: number[];
};

export type PlanSegment = {
  id: string;
  label: string;
  section: string;
};

export type PlanDay = {
  id: string;
  index: number;
  date: string;
  title: string;
  segments: PlanSegment[];
};

export type Member = {
  id: string;
  name: string;
  color: string;
  isAdmin: boolean;
};

export type Group = {
  id: string;
  name: string;
  createdAt: string;
  startDate: string;
  frequency: Frequency;
  planDays: PlanDay[];
  members: Member[];
  progress: Record<string, Record<string, string>>;
};

export type Credentials = {
  groupId: string;
  memberId: string;
  token: string;
};

export type ImportedRow = {
  title: string;
  date?: string;
  segments: Array<{ label: string; section: string }>;
};

export type MemberMetrics = {
  completedSegments: number;
  totalSegments: number;
  expectedSegments: number;
  progressPercent: number;
  paceDays: number;
  completedDays: number;
  streak: number;
};
