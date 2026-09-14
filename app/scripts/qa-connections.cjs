// Local UI contract checks. All API responses and credentials are synthetic.
// Run with PLAYWRIGHT_MODULE=/usr/local/lib/node_modules/playwright node scripts/qa-connections.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: .75 });
  const page = await context.newPage(), errors = [], requests = [];
  page.on("pageerror", e => errors.push(e.message));
  let state = { ready: false, authenticated: false, missing: ["OWNER_ACCESS_KEY", "CREDENTIAL_ENCRYPTION_KEY"] }, failSave = false;
  const summary = { leagueId: 10309566, teamId: 25, season: 2026, leagueName: "UI test league", teamName: "UI test team", teamCount: 12, verifiedAt: "2026-09-13T12:00:00Z", revision: "test-revision" };
  await page.route("**/api/gridiron/connection", async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    let status = 200, result = state;
    if (body?.action === "login") { state = { ready: true, authenticated: true, connection: null }; result = { ok: true }; }
    if (body?.action === "save") {
      if (failSave) { status = 422; result = { error: "ESPN did not accept these cookies." }; }
      else { state.connection = summary; result = { ok: true, connection: summary }; }
    }
    if (body?.action === "test") result = { ok: true, connection: summary };
    if (body?.action === "disconnect") { state.connection = null; result = { ok: true, connection: null }; }
    if (body?.action === "logout") { state = { ready: true, authenticated: false }; result = { ok: true }; }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result), headers: { "Cache-Control": "no-store" } });
  });
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.goto("http://localhost:5173/connections", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "One security step first." }).waitFor();
  assert.equal(await page.locator("#swid").count(), 0);
  await page.getByText("One-time hosting setup", { exact: true }).click();
  await page.getByRole("button", { name: "Generate two keys on this device" }).click();
  const generated = await page.locator("#generated-owner").inputValue();
  assert.match(generated, /^[a-f0-9]{64}$/);
  assert.notEqual(generated, await page.locator("#generated-encryption").inputValue());
  assert.equal(requests.some(body => body && JSON.stringify(body).includes(generated)), false);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await noOverflow();
  state = { ready: true, authenticated: false };
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Owner access key").fill("synthetic-owner-key-with-at-least-32-characters");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await page.getByRole("heading", { name: "Connect your ESPN league" }).waitFor();
  assert.equal(await page.locator("[name=leagueId]").inputValue(), "10309566");
  assert.equal(await page.locator("[name=teamId]").inputValue(), "25");
  assert.equal(await page.locator("[name=season]").inputValue(), "2026");
  await noOverflow();
  await page.screenshot({ path: "/tmp/ge-connections-desktop.jpg", fullPage: true, type: "jpeg", quality: 65 });
  await page.setViewportSize({ width: 412, height: 915 });
  await noOverflow();
  await page.screenshot({ path: "/tmp/ge-connections-mobile.jpg", fullPage: true, type: "jpeg", quality: 65 });
  const fill = async () => {
    await page.getByLabel("SWID", { exact: true }).fill("{12345678-1234-1234-1234-123456789abc}");
    await page.getByLabel("espn_s2", { exact: true }).fill("synthetic-cookie-value-only");
    await page.getByLabel("Allow a read-only ESPN check", { exact: false }).check();
  };
  failSave = true; await fill();
  await page.getByRole("button", { name: "Verify & save connection" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator("#swid").inputValue(), "");
  assert.equal(await page.locator("#espn-s2").inputValue(), "");
  failSave = false; await fill();
  await page.getByRole("button", { name: "Verify & save connection" }).click();
  await page.getByRole("heading", { name: "ESPN connection saved." }).waitFor();
  assert.equal(await page.locator("#espn-s2").count(), 0);
  assert.equal(await page.evaluate(() => [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => /synthetic-cookie|synthetic-owner|12345678-1234/.test(value)))), false);
  await page.getByRole("button", { name: "Test saved connection" }).click();
  await page.getByText("ESPN accepted your saved connection.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  assert.equal(requests.filter(body => body?.action === "disconnect").length, 0);
  await page.getByRole("button", { name: "Keep connection" }).click();
  await page.getByRole("button", { name: "Replace cookies" }).click();
  assert.equal(await page.locator("#espn-s2").inputValue(), "");
  await page.getByRole("button", { name: "Cancel replacement" }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Delete saved credentials" }).click();
  await page.getByRole("heading", { name: "Connect your ESPN league" }).waitFor();
  await page.getByRole("button", { name: "Sign out of this device" }).click();
  await page.getByRole("heading", { name: "Unlock your workspace" }).waitFor();
  await noOverflow();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(JSON.stringify({ result: "PASS", desktop: 1440, mobile: 412, tests: ["fail-closed setup", "browser-only key generator", "owner login", "prefilled IDs", "masked fields", "clear on failed submit", "save and test", "empty replacement fields", "confirmed deletion", "logout", "no secret persistence", "no overflow", "no page errors"], screenshots: ["/tmp/ge-connections-desktop.jpg", "/tmp/ge-connections-mobile.jpg"] }));
  await browser.close();
})().catch(error => { console.error(error.stack); process.exit(1); });
