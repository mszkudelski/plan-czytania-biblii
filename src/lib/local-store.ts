import type { Credentials, Frequency, Group, Member, PlanDay } from "../types";

type LocalGroup = Group & { tokens: Record<string, string> };

const STORAGE_KEY = "plan-czytania-biblii-local-groups";
const COLORS = ["#47634f", "#bf6f54", "#65778e", "#9a7245", "#765b7d"];

function randomId() {
  return crypto.randomUUID();
}

function randomToken() {
  return `${randomId()}${randomId()}`.replaceAll("-", "");
}

function loadAll(): Record<string, LocalGroup> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
}

function saveAll(groups: Record<string, LocalGroup>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

function publicGroup(group: LocalGroup): Group {
  const { tokens: _tokens, ...rest } = group;
  return rest;
}

export function localCreateGroup(input: {
  name: string;
  ownerName: string;
  startDate: string;
  frequency: Frequency;
  planDays: PlanDay[];
}): { group: Group; credentials: Credentials } {
  const groupId = randomId();
  const memberId = randomId();
  const token = randomToken();
  const owner: Member = {
    id: memberId,
    name: input.ownerName,
    color: COLORS[0],
    isAdmin: true,
  };
  const group: LocalGroup = {
    id: groupId,
    name: input.name,
    createdAt: new Date().toISOString(),
    startDate: input.startDate,
    frequency: input.frequency,
    planDays: input.planDays,
    members: [owner],
    progress: { [memberId]: {} },
    tokens: { [memberId]: token },
  };
  const all = loadAll();
  all[groupId] = group;
  saveAll(all);
  return {
    group: publicGroup(group),
    credentials: { groupId, memberId, token },
  };
}

export function localGetGroup(groupId: string): Group {
  const group = loadAll()[groupId];
  if (!group) throw new Error("Nie znaleziono grupy.");
  return publicGroup(group);
}

export function localUpdateProgress(
  credentials: Credentials,
  segmentId: string,
  completed: boolean,
): Group {
  const all = loadAll();
  const group = all[credentials.groupId];
  if (!group || group.tokens[credentials.memberId] !== credentials.token) {
    throw new Error("Nieprawidłowy link członka.");
  }
  const memberProgress = group.progress[credentials.memberId] ?? {};
  if (completed) memberProgress[segmentId] = new Date().toISOString();
  else delete memberProgress[segmentId];
  group.progress[credentials.memberId] = memberProgress;
  saveAll(all);
  return publicGroup(group);
}

export function localAddMember(
  credentials: Credentials,
  name: string,
): { group: Group; memberCredentials: Credentials } {
  const all = loadAll();
  const group = all[credentials.groupId];
  const current = group?.members.find(
    (member) => member.id === credentials.memberId,
  );
  if (
    !group ||
    !current?.isAdmin ||
    group.tokens[credentials.memberId] !== credentials.token
  ) {
    throw new Error("Tylko administrator może zapraszać.");
  }
  const memberId = randomId();
  const token = randomToken();
  group.members.push({
    id: memberId,
    name,
    color: COLORS[group.members.length % COLORS.length],
    isAdmin: false,
  });
  group.progress[memberId] = {};
  group.tokens[memberId] = token;
  saveAll(all);
  return {
    group: publicGroup(group),
    memberCredentials: {
      groupId: group.id,
      memberId,
      token,
    },
  };
}
