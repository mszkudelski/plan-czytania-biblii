import { getStore } from "@netlify/blobs";

const registry = () => getStore({ name: "plan-czytania-e2e-cleanup", consistency: "strong" });
const json = (body: unknown, init?: ResponseInit) => Response.json(body, { ...init, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
export const E2E_HEADER = "x-reading-e2e-run";
export function e2eRunToken(request: Request) {
  const value = request.headers.get(E2E_HEADER);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function e2eRunHash(request: Request) {
  const token = e2eRunToken(request);
  if (!token) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function registerE2eGroup(runHash: string, groupId: string) {
  if (!uuid.test(groupId)) throw new Error("Invalid test group ID");
  // Write the journal first: cleanup can recover even when creation is interrupted.
  await registry().setJSON(`runs/${runHash}/${groupId}`, { groupId });
  await registry().set(`owners/${groupId}`, runHash);
}
export type CleanupStore = "plan-czytania-biblii-groups" | "plan-czytania-biblii-recovery" | "plan-czytania-notifications";
export async function trackE2eResource(groupId: string, store: CleanupStore, key: string) {
  if (!await registry().get(`owners/${groupId}`)) return;
  await registry().setJSON(`resources/${groupId}/${encodeURIComponent(store)}/${encodeURIComponent(key)}`, { store, key });
}
async function keys(prefix: string) {
  const result: string[] = [];
  for await (const page of registry().list({ prefix, paginate: true })) result.push(...page.blobs.map(blob => blob.key));
  return result;
}
async function deletePrefix(store: ReturnType<typeof getStore>, prefix: string) {
  const targets: string[] = [];
  for await (const page of store.list({ prefix, paginate: true })) targets.push(...page.blobs.map(blob => blob.key));
  for (let i = 0; i < targets.length; i += 16) await Promise.all(targets.slice(i, i + 16).map(key => store.delete(key)));
}
export async function cleanupE2e(request: Request, groupId?: string) {
  const hash = await e2eRunHash(request);
  if (!hash) return json({ error: "Missing cleanup capability" }, { status: 401 });
  if (!groupId) {
    const groups = (await keys(`runs/${hash}/`)).map(key => key.split("/").at(-1)!);
    return json({ groups });
  }
  if (!uuid.test(groupId)) return json({ error: "Invalid group ID" }, { status: 400 });
  const journalKey = `runs/${hash}/${groupId}`;
  // The name or administrator token is NOT sufficient to authorize deletion.
  if (!await registry().get(journalKey)) return json({ error: "Unknown test group" }, { status: 404 });
  const owner = await registry().get(`owners/${groupId}`);
  if (owner && owner !== hash) return json({ error: "Wrong test run" }, { status: 403 });
  const groups = getStore({ name: "plan-czytania-biblii-groups", consistency: "strong" });
  for (const key of await keys(`resources/${groupId}/`)) {
    const resource = await registry().get(key, { type: "json" }) as { store: CleanupStore; key: string } | null;
    if (resource) await getStore({ name: resource.store, consistency: "strong" }).delete(resource.key);
    await registry().delete(key);
  }
  await deletePrefix(groups, `progress-v1/${groupId}/`);
  await deletePrefix(groups, `group-state-v1/${groupId}/`);
  await groups.delete(`group-${groupId}`);
  await registry().delete(`owners/${groupId}`);
  // Keep the journal until all deletions succeed, so retries are safe.
  await registry().delete(journalKey);
  return json({ deleted: true });
}
