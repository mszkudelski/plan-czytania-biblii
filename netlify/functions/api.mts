import { getStore } from "@netlify/blobs";
import { applyProgressLog, progressLogKey, progressLogPrefix } from "../../src/lib/progress-log";
import type { Config, Context } from "@netlify/functions";
import { validReminderSettings, validPushSubscription, testReminder } from "../../src/lib/notifications";
import { reminderStore, reminderKey, pushConfigured, missingPushConfiguration, sendReminder, type StoredReminder } from "./_shared/notifications";
import type {
  Credentials,
  Frequency,
  Group,
  Member,
  PlanDay,
} from "../../src/types";
import { cleanPersonName } from "../../src/lib/name";
import {
  formatRecoveryCode, generateRecoveryCode, hashRecoveryCode,
  normalizeRecoveryCode,
} from "../../src/lib/access-recovery";

type StoredMember = Member & {
  tokenHash?: string;
  tokenHashes?: string[];
};
type StoredGroup = Omit<Group, "members"> & {
  members: StoredMember[];
  inviteTokenHash?: string;
};
type SessionTransfer = {
  groupId: string;
  memberId: string;
  issuedByAdminId?: string;
  inviteToken?: string;
  expiresAt: string;
  usedAt?: string;
};
type AccessRecovery = { groupId: string; memberId: string };

const COLORS = ["#47634f", "#bf6f54", "#65778e", "#9a7245", "#765b7d"];
const SESSION_COOKIE = "plan-czytania-session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const TRANSFER_TTL_MS = 10 * 60 * 1000;
const TRANSFER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function groupStore() {
  return getStore({
    name: "plan-czytania-biblii-groups",
    consistency: "strong",
  });
}

function recoveryStore() {
  return getStore({ name: "plan-czytania-biblii-recovery", consistency: "strong" });
}

function recoveryProfileKey(credentials: Pick<Credentials, "groupId" | "memberId">) {
  return `profile-${credentials.groupId}-${credentials.memberId}`;
}

function json(
  data: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function error(message: string, status = 400) {
  return json({ error: message }, status);
}

function keyFor(groupId: string) {
  return `group-${groupId}`;
}

function transferKey(code: string) {
  return hashToken(code).then((hash) => `session-transfer-${hash}`);
}

function randomToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}

function randomTransferCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(
    bytes,
    (byte) => TRANSFER_CODE_ALPHABET[byte % TRANSFER_CODE_ALPHABET.length],
  ).join("");
}

function formatTransferCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function cleanTransferCode(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[\s-]/g, "")
    : "";
}

async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function publicGroup(group: StoredGroup): Group {
  const {
    members,
    inviteTokenHash: _inviteTokenHash,
    ...publicFields
  } = group;
  return {
    ...publicFields,
    members: members.map(
      ({
        tokenHash: _tokenHash,
        tokenHashes: _tokenHashes,
        ...member
      }) => member,
    ),
  };
}

function cleanText(value: unknown, maxLength = 80) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanCredentials(value: unknown): Credentials | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Credentials>;
  const groupId = cleanText(candidate.groupId, 100);
  const memberId = cleanText(candidate.memberId, 100);
  const token = cleanText(candidate.token, 200);
  const inviteToken = cleanText(candidate.inviteToken, 200);
  if (!groupId || !memberId || !token) return null;
  return {
    groupId,
    memberId,
    token,
    ...(inviteToken ? { inviteToken } : {}),
  };
}

function sessionCookie(credentials: Credentials) {
  const value = encodeURIComponent(JSON.stringify(credentials));
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function credentialsFromCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const encoded = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!encoded) return null;
  try {
    return cleanCredentials(JSON.parse(decodeURIComponent(encoded)));
  } catch {
    return null;
  }
}

function tokenHashes(member: StoredMember) {
  return [
    ...(member.tokenHashes ?? []),
    ...(member.tokenHash ? [member.tokenHash] : []),
  ];
}

function validatePlanDays(value: unknown): PlanDay[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5000) {
    return null;
  }

  const valid = value.every((day) => {
    if (!day || typeof day !== "object") return false;
    const candidate = day as PlanDay;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.index === "number" &&
      /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) &&
      typeof candidate.title === "string" &&
      Array.isArray(candidate.segments) &&
      candidate.segments.length > 0 &&
      candidate.segments.length <= 20 &&
      candidate.segments.every(
        (segment) =>
          typeof segment.id === "string" &&
          typeof segment.label === "string" &&
          typeof segment.section === "string",
      )
    );
  });
  if (!valid) return null;

  return value.map((day) => {
    const candidate = day as PlanDay;
    return {
      id: cleanText(candidate.id, 100),
      index: candidate.index,
      date: candidate.date,
      title: cleanText(candidate.title, 120),
      segments: candidate.segments.map((segment) => ({
        id: cleanText(segment.id, 120),
        label: cleanText(segment.label, 180),
        section: cleanText(segment.section, 80),
      })),
    };
  });
}

async function authenticate(
  group: StoredGroup,
  credentials: Partial<Credentials>,
) {
  const member = group.members.find(
    (candidate) => candidate.id === credentials.memberId,
  );
  if (!member || !credentials.token) return null;
  const candidateHash = await hashToken(credentials.token);
  return tokenHashes(member).includes(candidateHash) ? member : null;
}

export async function storedGroup(groupId: string) {
  const store = groupStore();
  const group = await store.get(keyFor(groupId), {
    type: "json",
    consistency: "strong",
  });
  if (!group) return null;
  const { blobs } = await store.list({ prefix: progressLogPrefix(groupId) });
  return applyProgressLog(group as StoredGroup, blobs.map(blob => blob.key));
}

async function createGroup(request: Request) {
  const store = groupStore();
  const body = (await request.json()) as {
    name?: unknown;
    ownerName?: unknown;
    startDate?: unknown;
    frequency?: Frequency;
    planDays?: unknown;
  };
  const name = cleanText(body.name);
  const ownerName = cleanPersonName(cleanText(body.ownerName));
  const planDays = validatePlanDays(body.planDays);
  const startDate = cleanText(body.startDate, 10);
  const frequency = body.frequency;

  if (!name || !ownerName || !planDays) {
    return error("Brakuje poprawnej nazwy, właściciela lub planu.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return error("Nieprawidłowa data rozpoczęcia.");
  }
  if (
    !frequency ||
    !["daily", "weekdays", "custom"].includes(frequency.kind) ||
    !Array.isArray(frequency.days) ||
    !frequency.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  ) {
    return error("Nieprawidłowa częstotliwość.");
  }

  const groupId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const token = randomToken();
  const inviteToken = randomToken();
  const group: StoredGroup = {
    id: groupId,
    name,
    createdAt: new Date().toISOString(),
    startDate,
    frequency,
    planDays,
    members: [
      {
        id: memberId,
        name: ownerName,
        color: COLORS[0],
        isAdmin: true,
        tokenHashes: [await hashToken(token)],
      },
    ],
    progress: { [memberId]: {} },
    inviteTokenHash: await hashToken(inviteToken),
  };

  const result = await store.set(keyFor(groupId), JSON.stringify(group), {
    onlyIfNew: true,
  });
  if (!result.modified) return error("Spróbuj ponownie.", 409);

  const credentials = { groupId, memberId, token, inviteToken };
  return json(
    { group: publicGroup(group), credentials },
    201,
    { "set-cookie": sessionCookie(credentials) },
  );
}

async function getGroup(groupId: string) {
  const group = await storedGroup(groupId);
  if (!group) return error("Nie znaleziono grupy.", 404);
  return json(publicGroup(group));
}

async function saveSession(request: Request) {
  const credentials = cleanCredentials(await request.json());
  if (!credentials) return error("Nieprawidłowa sesja.", 400);
  const group = await storedGroup(credentials.groupId);
  if (!group) return error("Nie znaleziono grupy.", 404);
  if (!(await authenticate(group, credentials))) {
    return error("Sesja wygasła.", 401);
  }
  return json(
    { group: publicGroup(group), credentials },
    200,
    { "set-cookie": sessionCookie(credentials) },
  );
}

async function restoreSession(request: Request) {
  const credentials = credentialsFromCookie(request);
  if (!credentials) return error("Brak zapisanej sesji.", 401);
  const group = await storedGroup(credentials.groupId);
  if (!group || !(await authenticate(group, credentials))) {
    return json(
      { error: "Sesja wygasła." },
      401,
      { "set-cookie": clearedSessionCookie() },
    );
  }
  return json({ group: publicGroup(group), credentials });
}

function clearSession() {
  return json(
    { ok: true },
    200,
    { "set-cookie": clearedSessionCookie() },
  );
}

async function recoveryCodeStatus(request: Request) {
  const credentials = cleanCredentials(await request.json());
  if (!credentials) return error("Nieprawidłowy dostęp.", 401);
  const group = await storedGroup(credentials.groupId);
  if (!group || !(await authenticate(group, credentials))) {
    return error("Nieprawidłowy dostęp.", 401);
  }
  const record = await recoveryStore().get(recoveryProfileKey(credentials), { type: "json" });
  return json({ hasCode: Boolean(record) });
}

async function createRecoveryCode(request: Request) {
  const credentials = cleanCredentials(await request.json());
  if (!credentials) return error("Nieprawidłowy dostęp.", 401);
  const group = await storedGroup(credentials.groupId);
  if (!group || !(await authenticate(group, credentials))) {
    return error("Nieprawidłowy dostęp.", 401);
  }
  const store = recoveryStore();
  const code = generateRecoveryCode();
  const codeHash = await hashRecoveryCode(code);
  const record: AccessRecovery = {
    groupId: credentials.groupId, memberId: credentials.memberId,
  };
  const created = await store.set(`code-${codeHash}`, JSON.stringify(record), { onlyIfNew: true });
  if (!created.modified) return error("Nie udało się utworzyć kodu. Spróbuj ponownie.", 409);
  // One pointer per profile makes a newly issued code replace the old one.
  // Plaintext codes are never stored, including in the lookup record.
  await store.set(recoveryProfileKey(credentials), JSON.stringify({ codeHash }));
  return json({ code: formatRecoveryCode(code) }, 201);
}

async function redeemRecoveryCode(request: Request) {
  const body = (await request.json()) as { code?: unknown } | null;
  const code = normalizeRecoveryCode(body?.code);
  if (!code) return error("Kod odzyskiwania ma nieprawidłowy format.", 400);
  const store = recoveryStore();
  const codeHash = await hashRecoveryCode(code);
  const record = await store.get(`code-${codeHash}`, { type: "json" }) as AccessRecovery | null;
  if (!record) return error("Kod odzyskiwania jest nieprawidłowy lub został zastąpiony nowym.", 401);
  let credentials: Credentials | null = null;
  const response = await updateStoredGroup(record.groupId, async (group) => {
    const active = await store.get(recoveryProfileKey(record), { type: "json" }) as { codeHash: string } | null;
    const member = group.members.find((candidate) => candidate.id === record.memberId);
    if (!member || active?.codeHash !== codeHash) {
      return error("Kod odzyskiwania jest nieprawidłowy lub został zastąpiony nowym.", 401);
    }
    const token = randomToken();
    member.tokenHashes = [...tokenHashes(member), await hashToken(token)];
    delete member.tokenHash;
    credentials = { groupId: record.groupId, memberId: record.memberId, token };
  });
  if (response.status === 404) return error("Kod odzyskiwania jest nieprawidłowy lub został zastąpiony nowym.", 401);
  if (response.status !== 200 || !credentials) return response;
  return json(
    { group: await response.json(), credentials }, 201,
    { "set-cookie": sessionCookie(credentials) },
  );
}

async function createSessionTransfer(request: Request) {
  const credentials = cleanCredentials(await request.json());
  if (!credentials) return error("Nieprawidłowa sesja.", 400);
  const group = await storedGroup(credentials.groupId);
  if (!group) return error("Nie znaleziono grupy.", 404);
  const member = await authenticate(group, credentials);
  if (!member) return error("Sesja wygasła.", 401);

  let inviteToken: string | undefined;
  if (
    member.isAdmin &&
    credentials.inviteToken &&
    group.inviteTokenHash &&
    (await hashToken(credentials.inviteToken)) === group.inviteTokenHash
  ) {
    inviteToken = credentials.inviteToken;
  }

  return issueSessionTransfer({
    groupId: credentials.groupId, memberId: credentials.memberId,
    ...(inviteToken ? { inviteToken } : {}),
  });
}

async function issueSessionTransfer(profile: Omit<SessionTransfer, "expiresAt" | "usedAt">) {
  const store = groupStore();
  const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomTransferCode();
    const transfer: SessionTransfer = {
      ...profile, expiresAt,
    };
    const result = await store.set(
      await transferKey(code),
      JSON.stringify(transfer),
      { onlyIfNew: true },
    );
    if (result.modified) {
      return json({ code: formatTransferCode(code), expiresAt }, 201);
    }
  }
  return error("Nie udało się utworzyć kodu. Spróbuj ponownie.", 409);
}

async function redeemSessionTransfer(request: Request) {
  const store = groupStore();
  const body = (await request.json()) as { code?: unknown } | null;
  const code = cleanTransferCode(body?.code);
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) return error("Kod ma nieprawidłowy format.", 400);

  const key = await transferKey(code);
  const entry = await store.getWithMetadata(key, {
    type: "json",
    consistency: "strong",
  });
  if (!entry) return error("Kod jest nieprawidłowy lub wygasł.", 404);
  const transfer = entry.data as SessionTransfer;
  if (transfer.usedAt || Date.parse(transfer.expiresAt) <= Date.now()) {
    return error("Kod jest nieprawidłowy lub wygasł.", 410);
  }

  const claimed = await store.set(
    key,
    JSON.stringify({ ...transfer, usedAt: new Date().toISOString() }),
    { onlyIfMatch: entry.etag },
  );
  if (!claimed.modified) return error("Kod został już wykorzystany.", 409);

  let credentials: Credentials | null = null;
  const response = await updateStoredGroup(
    transfer.groupId,
    async (group) => {
      if (transfer.issuedByAdminId && !group.members.some(
        (person) => person.id === transfer.issuedByAdminId && person.isAdmin,
      )) {
        return error("Administrator nie ma już uprawnień. Poproś o nowy link dostępu.", 403);
      }
      const member = group.members.find(
        (candidate) => candidate.id === transfer.memberId,
      );
      if (!member) return error("Użytkownik nie ma już dostępu.", 403);
      const token = randomToken();
      member.tokenHashes = [
        ...tokenHashes(member),
        await hashToken(token),
      ];
      delete member.tokenHash;
      credentials = {
        groupId: transfer.groupId,
        memberId: transfer.memberId,
        token,
        ...(transfer.inviteToken
          ? { inviteToken: transfer.inviteToken }
          : {}),
      };
    },
  );

  if (response.status !== 200 || !credentials) return response;
  const group = (await response.json()) as Group;
  return json(
    { group, credentials },
    201,
    { "set-cookie": sessionCookie(credentials) },
  );
}

async function updateStoredGroup(
  groupId: string,
  updater: (group: StoredGroup) => Promise<Response | void>,
) {
  const store = groupStore();
  const key = keyFor(groupId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const entry = await store.getWithMetadata(key, {
      type: "json",
      consistency: "strong",
    });
    if (!entry) return error("Nie znaleziono grupy.", 404);
    const group = entry.data as StoredGroup;
    const response = await updater(group);
    if (response) return response;

    const result = await store.set(key, JSON.stringify(group), {
      onlyIfMatch: entry.etag,
    });
    if (result.modified) {
      const current = await storedGroup(groupId);
      return json(publicGroup(current ?? group));
    }
  }
  return error("Plan został właśnie zmieniony. Spróbuj ponownie.", 409);
}

async function updateProgress(request: Request, groupId: string) {
  const body = (await request.json()) as Partial<Credentials> & {
    segmentId?: unknown;
    completed?: unknown;
  };
  const segmentId = cleanText(body.segmentId, 120);
  const group = await storedGroup(groupId);
  if (!group) return error("Nie znaleziono grupy.", 404);
  const member = await authenticate(group, body);
  if (!member) return error("Nieprawidłowy link dostępu.", 401);
  const segmentIndex = group.planDays.flatMap(day => day.segments)
    .findIndex(segment => segment.id === segmentId);
  if (segmentIndex < 0 || typeof body.completed !== "boolean") {
    return error("Nieprawidłowy fragment.");
  }

  // Each operation has its own key. Parallel writes never replace another
  // person's progress or another reading's update, unlike whole-group writes.
  await groupStore().set(
    progressLogKey(groupId, member.id, segmentIndex, body.completed),
    "{}",
  );
  const current = await storedGroup(groupId);
  return json(publicGroup(current ?? group));
}

async function ensureInvite(request: Request, groupId: string) {
  const body = (await request.json()) as Partial<Credentials>;
  let inviteCredentials: Credentials | null = null;

  const response = await updateStoredGroup(groupId, async (group) => {
    const current = await authenticate(group, body);
    if (!current?.isAdmin || !body.memberId || !body.token) {
      return error("Tylko administrator może zapraszać.", 403);
    }

    let inviteToken = cleanText(body.inviteToken, 200);
    const tokenMatches =
      inviteToken &&
      group.inviteTokenHash &&
      (await hashToken(inviteToken)) === group.inviteTokenHash;

    if (!tokenMatches) {
      inviteToken = randomToken();
      group.inviteTokenHash = await hashToken(inviteToken);
    }

    inviteCredentials = {
      groupId,
      memberId: body.memberId,
      token: body.token,
      inviteToken,
    };
  });

  if (response.status !== 200 || !inviteCredentials) return response;
  return json(
    inviteCredentials,
    200,
    { "set-cookie": sessionCookie(inviteCredentials) },
  );
}

async function joinGroup(request: Request, groupId: string) {
  const body = (await request.json()) as {
    name?: unknown;
    inviteToken?: unknown;
  };
  const name = cleanPersonName(cleanText(body.name));
  const inviteToken = cleanText(body.inviteToken, 200);
  if (!name) return error("Podaj imię.");
  if (!inviteToken) return error("Link zaproszenia jest nieprawidłowy.", 401);

  let createdCredentials: Credentials | null = null;
  const response = await updateStoredGroup(groupId, async (group) => {
    if (
      !group.inviteTokenHash ||
      (await hashToken(inviteToken)) !== group.inviteTokenHash
    ) {
      return error("Link zaproszenia jest nieprawidłowy.", 401);
    }
    const memberId = crypto.randomUUID();
    const token = randomToken();
    if (group.members.length >= 100) {
      return error("Grupa osiągnęła limit 100 osób.", 409);
    }
    group.members.push({
      id: memberId,
      name,
      color: COLORS[group.members.length % COLORS.length],
      isAdmin: false,
      tokenHashes: [await hashToken(token)],
    });
    group.progress[memberId] = {};
    createdCredentials = { groupId, memberId, token };
  });

  if (response.status !== 200 || !createdCredentials) return response;
  const group = (await response.json()) as Group;
  return json(
    { group, credentials: createdCredentials },
    201,
    { "set-cookie": sessionCookie(createdCredentials) },
  );
}

async function removeMember(
  request: Request,
  groupId: string,
  memberId: string,
) {
  const body = (await request.json()) as Partial<Credentials>;

  return updateStoredGroup(groupId, async (group) => {
    const current = await authenticate(group, body);
    if (!current?.isAdmin) {
      return error("Tylko administrator może usuwać osoby.", 403);
    }
    const member = group.members.find((candidate) => candidate.id === memberId);
    if (!member) return error("Nie znaleziono osoby.", 404);
    if (member.isAdmin) {
      return error("Nie można usunąć administratora.", 409);
    }

    group.members = group.members.filter(
      (candidate) => candidate.id !== memberId,
    );
    delete group.progress[memberId];
  });
}

async function createMemberAccess(request: Request, groupId: string, memberId: string) {
  const credentials = cleanCredentials(await request.json());
  if (!credentials || credentials.groupId !== groupId) return error("Nieprawidłowy dostęp.", 401);
  const group = await storedGroup(groupId);
  if (!group) return error("Nie znaleziono grupy.", 404);
  const current = await authenticate(group, credentials);
  if (!current?.isAdmin) return error("Tylko administrator może przywracać dostęp.", 403);
  if (!group.members.some((person) => person.id === memberId)) return error("Nie znaleziono osoby.", 404);
  // The code points to the selected member, never to the issuing admin.
  // No invitation secret is copied into the restored member's session.
  return issueSessionTransfer({ groupId, memberId, issuedByAdminId: current.id });
}

async function updateMemberRole(request: Request, groupId: string, memberId: string) {
  const value = await request.json();
  const credentials = cleanCredentials(value);
  if (!credentials || credentials.groupId !== groupId) return error("Nieprawidłowy dostęp.", 401);
  const isAdmin = (value as { isAdmin?: unknown }).isAdmin;
  if (typeof isAdmin !== "boolean") return error("Nieprawidłowa rola.", 400);
  return updateStoredGroup(groupId, async (group) => {
    const current = await authenticate(group, credentials);
    if (!current?.isAdmin) return error("Tylko administrator może zmieniać role.", 403);
    const member = group.members.find((person) => person.id === memberId);
    if (!member) return error("Nie znaleziono osoby.", 404);
    if (!isAdmin && member.isAdmin && !group.members.some(
      (person) => person.id !== memberId && person.isAdmin,
    )) return error("Grupa musi mieć co najmniej jednego administratora.", 409);
    member.isAdmin = isAdmin;
  });
}

async function notifications(request: Request, groupId: string, scope: string) {
  const value = await request.json();
  if (!value || typeof value !== "object") return error("Nieprawidłowa operacja.");
  const body = value as Partial<Credentials> & { deviceId?: unknown; settings?: unknown; subscription?: unknown; action?: unknown };
  const credentials = cleanCredentials(value);
  if (!credentials) return error("Nieprawidłowy link dostępu.", 401);
  const group = await storedGroup(groupId);
  if (!group) return error("Nie znaleziono grupy.", 404);
  const member = await authenticate(group, credentials);
  if (!member) return error("Nieprawidłowy link dostępu.", 401);
  if (typeof body.deviceId !== "string" || !/^[a-f0-9-]{36}$/.test(body.deviceId)) {
    return error("Nieprawidłowe urządzenie.");
  }
  const store = reminderStore();
  const key = reminderKey(scope, body.deviceId, groupId, member.id);
  const record = await store.get(key, { type: "json" }) as StoredReminder | null;
  const ownRecord = record?.groupId === groupId && record.memberId === member.id ? record : null;
  const publicSettings = (value: StoredReminder | null) => value ? {
    enabled: value.enabled, time: value.time, timeZone: value.timeZone,
  } : null;
  if (body.action === "read") return json(publicSettings(ownRecord));
  if (body.action === "disable") {
    if (ownRecord) await store.delete(key);
    return json({ enabled: false });
  }
  if (body.action === "save") {
    if (!validReminderSettings(body.settings) || !body.settings.enabled || !validPushSubscription(body.subscription)) {
      return error("Nieprawidłowa godzina, strefa czasowa lub subskrypcja powiadomień.");
    }
    if (!pushConfigured()) return error("Powiadomienia nie są jeszcze skonfigurowane na serwerze.", 503);
    const reminder: StoredReminder = {
      enabled: true, time: body.settings.time, timeZone: body.settings.timeZone,
      deviceId: body.deviceId, groupId, memberId: member.id,
      subscription: { endpoint: body.subscription.endpoint, keys: {
        p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth,
      } },
      origin: new URL(request.url).origin,
    };
    await store.setJSON(key, reminder);
    return json(publicSettings(reminder));
  }
  if (body.action === "test") {
    if (!ownRecord?.enabled) return error("Najpierw włącz powiadomienia.", 409);
    const payload = testReminder(group, member.id, body.deviceId, new Date(), ownRecord.timeZone);
    if (!payload) return error("W planie nie ma fragmentów do pokazania w powiadomieniu testowym.", 409);
    const rateKey = `tests/${encodeURIComponent(scope)}/${body.deviceId}/${Math.floor(Date.now() / 60000)}`;
    const claim = await store.set(rateKey, "sent", { onlyIfNew: true });
    if (!claim.modified) return error("Poczekaj minutę przed kolejnym testem.", 429);
    try {
      await sendReminder(ownRecord, payload);
      return json({ ok: true });
    } catch (caught) {
      const status = (caught as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await store.delete(key);
        return error("Subskrypcja wygasła. Włącz powiadomienia ponownie.", 410);
      }
      return error("Nie udało się wysłać powiadomienia. Spróbuj ponownie za minutę.", 503);
    }
  }
  return error("Nieprawidłowa operacja.");
}

export default async (request: Request, context: Context) => {
  try {
    const url = new URL(request.url);
    const marker = url.pathname.includes("/.netlify/functions/api/")
      ? "/.netlify/functions/api/"
      : "/api/";
    const route = url.pathname.split(marker)[1]?.split("/").filter(Boolean) ?? [];

    if (request.method === "GET" && route.join("/") === "notifications/config") {
      return json({
        publicKey: pushConfigured() ? Netlify.env.get("READING_PUSH_VAPID_PUBLIC_KEY") : null,
        scheduled: context.deploy.context === "production",
        missingKeys: missingPushConfiguration(),
      });
    }
    if (request.method === "POST" && route.length === 3 && route[0] === "groups" && route[2] === "notifications") {
      const scope = context.deploy.context === "production" ? "production" : url.origin;
      return await notifications(request, route[1], scope);
    }

    if (request.method === "POST" && route.length === 1 && route[0] === "groups") {
      return createGroup(request);
    }
    if (request.method === "GET" && route.length === 1 && route[0] === "session") {
      return restoreSession(request);
    }
    if (request.method === "POST" && route.length === 1 && route[0] === "session") {
      return saveSession(request);
    }
    if (
      request.method === "POST" &&
      route.length === 5 && route[0] === "groups" && route[2] === "members"
    ) {
      if (route[4] === "access") return createMemberAccess(request, route[1], route[3]);
      if (route[4] === "role") return updateMemberRole(request, route[1], route[3]);
    }
    if (
      request.method === "DELETE" &&
      route.length === 1 &&
      route[0] === "session"
    ) {
      return clearSession();
    }
    if (
      request.method === "POST" &&
      route.length === 2 &&
      route[0] === "session" &&
      route[1] === "recovery-code"
    ) {
      return createRecoveryCode(request);
    }
    if (
      request.method === "POST" &&
      route.length === 3 &&
      route[0] === "session" &&
      route[1] === "recovery-code"
    ) {
      if (route[2] === "status") return recoveryCodeStatus(request);
      if (route[2] === "redeem") return redeemRecoveryCode(request);
    }
    if (
      request.method === "POST" &&
      route.length === 2 &&
      route[0] === "session" &&
      route[1] === "transfers"
    ) {
      return createSessionTransfer(request);
    }
    if (
      request.method === "POST" &&
      route.length === 3 &&
      route[0] === "session" &&
      route[1] === "transfers" &&
      route[2] === "redeem"
    ) {
      return redeemSessionTransfer(request);
    }
    if (
      request.method === "GET" &&
      route.length === 2 &&
      route[0] === "groups"
    ) {
      return getGroup(route[1]);
    }
    if (
      request.method === "POST" &&
      route.length === 3 &&
      route[0] === "groups" &&
      route[2] === "progress"
    ) {
      return updateProgress(request, route[1]);
    }
    if (
      request.method === "POST" &&
      route.length === 3 &&
      route[0] === "groups" &&
      route[2] === "invite"
    ) {
      return ensureInvite(request, route[1]);
    }
    if (
      request.method === "POST" &&
      route.length === 3 &&
      route[0] === "groups" &&
      route[2] === "join"
    ) {
      return joinGroup(request, route[1]);
    }
    if (
      request.method === "DELETE" &&
      route.length === 4 &&
      route[0] === "groups" &&
      route[2] === "members"
    ) {
      return removeMember(request, route[1], route[3]);
    }
    return error("Nie znaleziono endpointu.", 404);
  } catch (caught) {
    console.error(caught);
    return error("Wewnętrzny błąd serwera.", 500);
  }
};

export const config: Config = {
  path: "/api/*",
};

