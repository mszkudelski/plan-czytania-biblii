const base = process.env.PRODUCTION_BASE_URL;
const expected = process.env.EXPECTED_COMMIT;
if (base !== "https://plan-czytania.netlify.app" || !/^[a-f0-9]{40}$/.test(expected ?? "")) {
  throw new Error("Invalid production check configuration");
}
const deadline = Date.now() + 10 * 60 * 1000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(base + "/build-info.json?commit=" + expected, {
      headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const info = await response.json();
      if (info.commit === expected && info.context === "production") {
        ready = true; break;
      }
    }
  } catch { /* The previous deployment remains live while Netlify builds. */ }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
if (!ready) throw new Error("Production did not publish the expected commit within ten minutes");
const page = await fetch(base + "/", { signal: AbortSignal.timeout(15000) });
if (!page.ok) throw new Error("Production page returned " + page.status);
const html = await page.text();
if (!html.includes('id="root"')) throw new Error("Application root is missing");
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
if (!assets.some(path => path.endsWith(".js"))) throw new Error("Application JavaScript is missing");
for (const asset of new Set(assets)) {
  const response = await fetch(base + asset, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Application asset failed: " + asset);
}
const missing = await fetch(base + "/api/groups/" + crypto.randomUUID(), { signal: AbortSignal.timeout(15000) });
if (missing.status !== 404) throw new Error("API returned " + missing.status + " for a missing plan");
console.log("Production verified: " + expected + "; page, assets and read-only API checks passed");
