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
  // Analytics identity is independent of group access and participant identity.
  analyticsPlanId?: string;
  planTemplate?: "mcheyne_365" | "custom_csv" | "unknown";
  analyticsDisabled?: boolean;
  name: string;
  createdAt: string;
  startDate: string;
  frequency: Frequency;
  planDays: PlanDay[];
  planRevision?: string;
  planVersion?: number;
  planRestore?: { savedAt: string; expiresAt: string };
  // Append-only index for immutable progress logs, including older plans.
  progressSegmentIds?: string[];
  members: Member[];
  progress: Record<string, Record<string, string>>;
};

export type Credentials = {
  groupId: string;
  memberId: string;
  token: string;
  inviteToken?: string;
};

export type JoinInvite = {
  groupId: string;
  inviteToken: string;
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
