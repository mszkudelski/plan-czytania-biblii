import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import type {
  Credentials,
  Frequency,
  Group,
  Member,
  PlanDay,
} from "../../src/types";
import { cleanPersonName, normalizePersonName } from "../../src/lib/name";

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
  inviteToken?: string;
  expiresAt: string;
  usedAt?: string;
};

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
    ? value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
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

async function storedGroup(groupId: string) {
  const store = groupStore();
  const group = await store.get(keyFor(groupId), {
    type: "json",
    consistency: "strong",
  });
  return (group as StoredGroup | null) ?? null;
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

async function createSessionTransfer(request: Request) {
  const store = groupStore();
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

  const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomTransferCode();
    const transfer: SessionTransfer = {
      groupId: credentials.groupId,
      memberId: credentials.memberId,
      ...(inviteToken ? { inviteToken } : {}),
      expiresAt,
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
  const body = (await request.json()) as { code?: unknown };
  const code = cleanTransferCode(body.code);
  if (code.length !== 8) return error("Kod ma nieprawidłowy format.", 400);

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
    if (result.modified) return json(publicGroup(group));
  }
  return error("Plan został właśnie zmieniony. Spróbuj ponownie.", 409);
}

async function updateProgress(request: Request, groupId: string) {
  const body = (await request.json()) as Partial<Credentials> & {
    segmentId?: unknown;
    completed?: unknown;
  };
  const segmentId = cleanText(body.segmentId, 120);

  return updateStoredGroup(groupId, async (group) => {
    const member = await authenticate(group, body);
    if (!member) return error("Nieprawidłowy link dostępu.", 401);
    const exists = group.planDays.some((day) =>
      day.segments.some((segment) => segment.id === segmentId),
    );
    if (!exists || typeof body.completed !== "boolean") {
      return error("Nieprawidłowy fragment.");
    }

    const progress = group.progress[member.id] ?? {};
    if (body.completed) progress[segmentId] = new Date().toISOString();
    else delete progress[segmentId];
    group.progress[member.id] = progress;
  });
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
    const existingMember = group.members.find(
      (member) =>
        normalizePersonName(member.name) === normalizePersonName(name),
    );

    if (existingMember) {
      existingMember.tokenHashes = [
        ...tokenHashes(existingMember),
        await hashToken(token),
      ];
      delete existingMember.tokenHash;
      createdCredentials = {
        groupId,
        memberId: existingMember.id,
        token,
      };
      return;
    }

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

export default async (request: Request) => {
  try {
    const url = new URL(request.url);
    const marker = url.pathname.includes("/.netlify/functions/api/")
      ? "/.netlify/functions/api/"
      : "/api/";
    const route = url.pathname.split(marker)[1]?.split("/").filter(Boolean) ?? [];

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
