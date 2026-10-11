import type {
  Credentials,
  Frequency,
  Group,
  JoinInvite,
  Member,
  PlanDay,
} from "../types";
import { cleanPersonName } from "./name";
import {
  formatRecoveryCode, generateRecoveryCode, hashRecoveryCode,
  normalizeRecoveryCode,
} from "./access-recovery";

type LocalGroup = Group & {
  tokens: Record<string, string | string[]>;
  inviteToken?: string;
};

const STORAGE_KEY = "plan-czytania-biblii-local-groups";
const RECOVERY_KEY = "plan-czytania-biblii-local-recovery";
const MEMBER_ACCESS_KEY = "plan-czytania-biblii-local-member-access";
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
  const { tokens: _tokens, inviteToken: _inviteToken, ...rest } = group;
  return rest;
}

function memberTokens(group: LocalGroup, memberId: string) {
  const tokens = group.tokens[memberId];
  return Array.isArray(tokens) ? tokens : tokens ? [tokens] : [];
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
  const inviteToken = randomToken();
  const owner: Member = {
    id: memberId,
    name: cleanPersonName(input.ownerName),
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
    tokens: { [memberId]: [token] },
    inviteToken,
  };
  const all = loadAll();
  all[groupId] = group;
  saveAll(all);
  return {
    group: publicGroup(group),
    credentials: { groupId, memberId, token, inviteToken },
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
  if (
    !group ||
    !memberTokens(group, credentials.memberId).includes(credentials.token)
  ) {
    throw new Error("Nieprawidłowy link członka.");
  }
  const memberProgress = group.progress[credentials.memberId] ?? {};
  if (completed) memberProgress[segmentId] = new Date().toISOString();
  else delete memberProgress[segmentId];
  group.progress[credentials.memberId] = memberProgress;
  saveAll(all);
  return publicGroup(group);
}

export function localEnsureInvite(
  credentials: Credentials,
): Credentials {
  const all = loadAll();
  const group = all[credentials.groupId];
  const current = group?.members.find(
    (member) => member.id === credentials.memberId,
  );
  if (
    !group ||
    !current?.isAdmin ||
    !memberTokens(group, credentials.memberId).includes(credentials.token)
  ) {
    throw new Error("Tylko administrator może zapraszać.");
  }
  if (!group.inviteToken || group.inviteToken !== credentials.inviteToken) {
    group.inviteToken = randomToken();
    saveAll(all);
  }
  return { ...credentials, inviteToken: group.inviteToken };
}

export function localJoinGroup(
  invite: JoinInvite,
  name: string,
): { group: Group; credentials: Credentials } {
  const cleanName = cleanPersonName(name);
  const all = loadAll();
  const group = all[invite.groupId];
  if (!group || group.inviteToken !== invite.inviteToken) {
    throw new Error("Link zaproszenia jest nieprawidłowy.");
  }
  if (group.members.length >= 100) {
    throw new Error("Grupa osiągnęła limit 100 osób.");
  }
  const memberId = randomId();
  const token = randomToken();
  group.members.push({
    id: memberId,
    name: cleanName,
    color: COLORS[group.members.length % COLORS.length],
    isAdmin: false,
  });
  group.progress[memberId] = {};
  group.tokens[memberId] = [token];
  saveAll(all);
  return {
    group: publicGroup(group),
    credentials: {
      groupId: group.id,
      memberId,
      token,
    },
  };
}

export function localRemoveMember(
  credentials: Credentials,
  memberId: string,
): Group {
  const all = loadAll();
  const group = all[credentials.groupId];
  const current = group?.members.find(
    (member) => member.id === credentials.memberId,
  );
  if (
    !group ||
    !current?.isAdmin ||
    !memberTokens(group, credentials.memberId).includes(credentials.token)
  ) {
    throw new Error("Tylko administrator może usuwać osoby.");
  }
  const member = group.members.find((candidate) => candidate.id === memberId);
  if (!member) throw new Error("Nie znaleziono osoby.");
  if (member.isAdmin) throw new Error("Nie można usunąć administratora.");

  group.members = group.members.filter(
    (candidate) => candidate.id !== memberId,
  );
  delete group.progress[memberId];
  delete group.tokens[memberId];
  saveAll(all);
  return publicGroup(group);
}

type LocalRecovery = { groupId: string; memberId: string; codeHash: string };

function recoveryRecords(): Record<string, LocalRecovery> {
  return JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? "{}");
}

function recoveryProfileKey(credentials: Pick<Credentials, "groupId" | "memberId">) {
  return `${credentials.groupId}:${credentials.memberId}`;
}

function requireLocalMember(credentials: Credentials) {
  const group = loadAll()[credentials.groupId];
  if (!group?.members.some((member) => member.id === credentials.memberId) ||
      !memberTokens(group, credentials.memberId).includes(credentials.token)) {
    throw new Error("Nieprawidłowy dostęp.");
  }
}

export function localRecoveryCodeStatus(credentials: Credentials) {
  requireLocalMember(credentials);
  return { hasCode: Boolean(recoveryRecords()[recoveryProfileKey(credentials)]) };
}

export async function localCreateRecoveryCode(credentials: Credentials) {
  requireLocalMember(credentials);
  const code = generateRecoveryCode();
  const records = recoveryRecords();
  records[recoveryProfileKey(credentials)] = {
    groupId: credentials.groupId, memberId: credentials.memberId,
    codeHash: await hashRecoveryCode(code),
  };
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(records));
  return { code: formatRecoveryCode(code) };
}

export async function localRedeemRecoveryCode(value: string) {
  const code = normalizeRecoveryCode(value);
  if (!code) throw new Error("Kod odzyskiwania ma nieprawidłowy format.");
  const codeHash = await hashRecoveryCode(code);
  const record = Object.values(recoveryRecords()).find((entry) => entry.codeHash === codeHash);
  const all = loadAll();
  const group = record ? all[record.groupId] : undefined;
  if (!record || !group?.members.some((member) => member.id === record.memberId)) {
    throw new Error("Kod odzyskiwania jest nieprawidłowy lub został zastąpiony nowym.");
  }
  const token = randomToken();
  group.tokens[record.memberId] = [...memberTokens(group, record.memberId), token];
  saveAll(all);
  return {
    group: publicGroup(group),
    credentials: { groupId: group.id, memberId: record.memberId, token },
  };
}

function requireLocalAdmin(credentials: Credentials) {
  requireLocalMember(credentials);
  const group = loadAll()[credentials.groupId];
  if (!group.members.find((member) => member.id === credentials.memberId)?.isAdmin) {
    throw new Error("Tylko administrator może zarządzać dostępem.");
  }
  return group;
}

export function localUpdateMemberRole(credentials: Credentials, memberId: string, isAdmin: boolean) {
  const group = requireLocalAdmin(credentials);
  const member = group.members.find((person) => person.id === memberId);
  if (!member) throw new Error("Nie znaleziono osoby.");
  if (!isAdmin && member.isAdmin && !group.members.some((person) => person.id !== memberId && person.isAdmin)) {
    throw new Error("Grupa musi mieć co najmniej jednego administratora.");
  }
  member.isAdmin = isAdmin;
  const all = loadAll();
  all[group.id] = group;
  saveAll(all);
  return publicGroup(group);
}

type LocalMemberAccess = {
  groupId: string; memberId: string; issuedByAdminId: string; expiresAt: string; usedAt?: string;
};

export async function localCreateMemberAccess(credentials: Credentials, memberId: string) {
  const group = requireLocalAdmin(credentials);
  if (!group.members.some((person) => person.id === memberId)) throw new Error("Nie znaleziono osoby.");
  const code = generateRecoveryCode().slice(0, 8);
  const hash = await hashRecoveryCode(code);
  const records: Record<string, LocalMemberAccess> = JSON.parse(localStorage.getItem(MEMBER_ACCESS_KEY) ?? "{}");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  records[hash] = { groupId: group.id, memberId, issuedByAdminId: credentials.memberId, expiresAt };
  localStorage.setItem(MEMBER_ACCESS_KEY, JSON.stringify(records));
  return { code: formatRecoveryCode(code), expiresAt };
}

export async function localRedeemMemberAccess(value: string): Promise<{ group: Group; credentials: Credentials }> {
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) throw new Error("Kod ma nieprawidłowy format.");
  const hash = await hashRecoveryCode(code);
  const records: Record<string, LocalMemberAccess> = JSON.parse(localStorage.getItem(MEMBER_ACCESS_KEY) ?? "{}");
  const record = records[hash];
  if (!record || record.usedAt || Date.parse(record.expiresAt) <= Date.now()) throw new Error("Kod jest nieprawidłowy lub wygasł.");
  // Claim before asynchronous work so concurrent redemptions cannot both pass.
  record.usedAt = new Date().toISOString();
  localStorage.setItem(MEMBER_ACCESS_KEY, JSON.stringify(records));
  const all = loadAll();
  const group = all[record.groupId];
  if (!group?.members.some((person) => person.id === record.issuedByAdminId && person.isAdmin)) {
    throw new Error("Administrator nie ma już uprawnień.");
  }
  const member = group.members.find((person) => person.id === record.memberId);
  if (!member) throw new Error("Użytkownik nie ma już dostępu.");
  const token = randomToken();
  group.tokens[member.id] = [...memberTokens(group, member.id), token];
  saveAll(all);
  return { group: publicGroup(group), credentials: { groupId: group.id, memberId: member.id, token } };
}

