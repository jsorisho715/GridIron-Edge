// Functional and accessibility checks use synthetic league data, never cookies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { AxeBuilder } = require(process.env.AXE_MODULE || "@axe-core/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
let devServer;
process.on("exit", () => devServer?.kill());
(async () => {
  if (process.env.SPAWN_QA_SERVER === "1") {
    devServer = spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173"],
      { stdio: "ignore" },
    );
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch("http://127.0.0.1:5173/app");
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    assert(ready, "QA server did not start");
  }
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(),
    errors = [],
    audits = [];
  const generated = spawnSync("bun", ["run", "scripts/qa-fixture.ts"], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);
  let state = JSON.parse(generated.stdout),
    locked = true,
    failSync = false,
    holdRead = false,
    releaseRead,
    readStarted;
  let advisor = state.advisor;
  delete state.advisor;
  await page.route("https://a.espncdn.com/i/headshots/**", (route) =>
    route.request().url().endsWith("/2500.png")
      ? route.abort()
      : route.fulfill({
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#eaf0e8"/><circle cx="24" cy="18" r="9" fill="#6b8b73"/><path d="M8 48v-9c0-14 32-14 32 0v9" fill="#6b8b73"/></svg>',
        }),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/gridiron/workspace*", async (route) => {
    if (locked)
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unlock your private workspace.", code: "locked" }),
      });
    if (new URL(route.request().url()).searchParams.has("player"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          events: [
            {
              kind: "injury",
              summary: "ESPN fantasy availability changed from QUESTIONABLE to ACTIVE.",
              observedAt: Date.now(),
            },
          ],
          forecasts: [
            {
              player_id: "2500",
              season: 2026,
              week: 1,
              forecast_at: Date.now() - 86400000,
              kickoff: Date.now() - 3600000,
              estimate: 15,
              actual: 17,
              espn: 16,
              baseline: 13,
            },
          ],
        }),
      });
    const body = route.request().postDataJSON();
    let result = state;
    if (!body && holdRead) {
      holdRead = false;
      readStarted();
      await new Promise((resolve) => {
        releaseRead = resolve;
      });
    }
    if (body?.action === "preferences") {
      state.preferences = { ...state.preferences, ...body, updatedAt: Date.now() };
      result = { preferences: state.preferences };
    }
    if (body?.action === "sync")
      result = {
        synced: !failSync,
        workspace: state,
        ...(failSync ? { error: "Synthetic provider outage" } : {}),
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(result),
    });
  });
  await page.route("**/api/gridiron/advisor", (route) => {
    if (locked)
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"error":"Locked"}',
      });
    const body = route.request().postDataJSON();
    if (body?.action === "decide") {
      const d = advisor.decisions.find((d) => d.id === body.id);
      d.status = body.status;
    }
    if (body?.action === "configure")
      advisor = {
        ...advisor,
        configured: !!body.key || advisor.configured,
        enabled: body.enabled,
        risk: body.risk,
      };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(advisor),
    });
  });
  await page.route("**/api/gridiron/connection", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }),
  );
  const overflow = async () =>
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      "Page overflows viewport",
    );
  const axe = async (label) => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    audits.push({
      label,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.slice(0, 3).map((n) => n.target),
      })),
    });
  };
  await page.goto("http://127.0.0.1:5173/app", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Your league. Your eyes only." }).waitFor();
  assert.equal(await page.getByText(state.snapshot.teamName, { exact: true }).count(), 0);
  await axe("locked");
  locked = false;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "What should you do today?" }).waitFor();
  await overflow();
  await axe("desktop-today");
  await page.getByRole("heading", { name: "Do these next" }).waitFor();
  assert(
    (await page.locator(".ga-decision").count()) <= 3,
    "Today must show at most three decisions",
  );
  await page.locator(".ga-decision summary").first().click();
  await axe("decision-evidence");
  await page.getByRole("button", { name: "Approve", exact: true }).first().click();
  await page.getByRole("heading", { name: "Your approved plans" }).waitFor();
  assert.equal(advisor.decisions.filter((d) => d.status === "approved").length, 1);
  await page.getByRole("button", { name: "Done", exact: true }).first().click();
  assert.equal(advisor.decisions.filter((d) => d.status === "completed").length, 1);
  if (await page.getByRole("button", { name: "Skip", exact: true }).count())
    await page.getByRole("button", { name: "Skip", exact: true }).first().click();
  await page.screenshot({ path: "/tmp/gridiron-live-desktop.png", fullPage: true });
  await page.locator(".gi-today-glance").getByRole("button").first().click();
  await page.getByRole("dialog").waitFor();
  await axe("lineup-dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const desktopNav = page.getByRole("navigation", { name: "Main navigation" });
  await desktopNav.getByRole("button", { name: /^My team/ }).click();
  await page
    .getByRole("navigation", { name: "My team sections" })
    .getByRole("button", { name: "Opponents", exact: true })
    .click();
  await page.getByRole("heading", { name: "Opponent Team 2", exact: true }).waitFor();
  await page.getByText("Managed by Manager 2", { exact: true }).waitFor();
  assert(await page.getByText("CONFIRMED BY ESPN", { exact: true }).count());
  assert(await page.getByText("NOTICED BETWEEN REFRESHES", { exact: true }).count());
  await page.getByLabel("Show", { exact: true }).selectOption("trade");
  assert.equal(await page.locator(".gi-activity").count(), 1);
  await page.getByLabel("Show", { exact: true }).selectOption("all");
  await page.getByLabel("Who are we watching?").selectOption("3");
  await page.getByText("Managed by Manager 3", { exact: true }).waitFor();
  await page.getByLabel("Who are we watching?").selectOption("2");
  await axe("desktop-opponents");
  await overflow();
  await page.screenshot({ path: "/tmp/gridiron-opponents-desktop.png", fullPage: true });
  await desktopNav.getByRole("button", { name: "Players", exact: true }).click();
  await page.getByLabel("Search players").fill("Alex");
  const select = page.getByRole("button", { name: /Select .* for comparison/ });
  await select.nth(0).click();
  await select.nth(1).click();
  await page.getByRole("button", { name: "Compare players", exact: true }).click();
  await page.getByRole("heading", { name: "Make the clearer call." }).waitFor();
  await axe("comparison-dialog");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: /^Watch Alex/ })
    .first()
    .click();
  assert.equal(state.preferences.watched.length, 1);
  await desktopNav.getByRole("button", { name: "League", exact: true }).click();
  await page
    .getByRole("navigation", { name: "League sections" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByLabel("Private notes, synced across your devices")
    .fill("Synthetic cross-device game plan");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await page.getByText("Notes saved across your devices.", { exact: true }).waitFor();
  assert.equal(state.preferences.notes, "Synthetic cross-device game plan");
  await axe("settings");
  await page
    .getByLabel("OpenAI API key", { exact: true })
    .fill("sk-synthetic_browser_key_only_123456789");
  await page.getByLabel("Automatically review material changes").check();
  await page.getByRole("button", { name: "Save AI settings", exact: true }).click();
  await page
    .getByText("Settings saved. Your key has been cleared from this form.", { exact: true })
    .waitFor();
  assert.equal(await page.getByLabel("Replace OpenAI API key (optional)").inputValue(), "");
  assert.equal(advisor.enabled, true);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.getByLabel("Private notes, synced across your devices").inputValue(),
    "Synthetic cross-device game plan",
  );
  assert.equal(await page.evaluate(() => localStorage.getItem("gridiron-sample-v1")), null);
  for (const width of [360, 412, 448]) {
    await page.setViewportSize({ width, height: 998 });
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Today", exact: true })
      .click();
    await overflow();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "My team", exact: true })
      .click();
    await page.locator(".ge-player-name").first().click();
    await page.getByRole("dialog").waitFor();
    await page
      .getByRole("navigation", { name: "Player details" })
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await page.getByText(/out of 100 leagues/).waitFor();
    await overflow();
    await page
      .getByRole("navigation", { name: "Player details" })
      .getByRole("button", { name: "Why", exact: true })
      .click();
    await page.getByText("Too early to tell", { exact: false }).waitFor();
    assert.equal(
      await page.locator("dialog .gi-photo-large img").count(),
      0,
      "Broken headshot should use initials",
    );
    await page
      .getByRole("navigation", { name: "Player details" })
      .getByRole("button", { name: "History", exact: true })
      .click();
    await page
      .locator("dialog summary")
      .filter({ hasText: "Saved player history & prediction results" })
      .click();
    await page.getByText("Actual: 17.0 · Missed by 2.0 points", { exact: true }).waitFor();
    if (width === 448) await axe("pixel-player-help-memory");
    await page.keyboard.press("Escape");
    await page
      .getByRole("navigation", { name: "My team sections" })
      .getByRole("button", { name: "Opponents", exact: true })
      .click();
    await overflow();
    if (width === 448) {
      await axe("pixel-opponents");
      await page.screenshot({ path: "/tmp/gridiron-opponents-pixel.png", fullPage: true });
    }
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Today", exact: true })
      .click();
    if (width === 448) {
      await axe("pixel-today");
      await page.screenshot({ path: "/tmp/gridiron-live-pixel.png", fullPage: true });
    }
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "Players", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Player sections" })
      .getByRole("button", { name: "Waivers", exact: true })
      .click();
    await overflow();
    if (width === 448) await axe("pixel-waivers");
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "My team", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "My team sections" })
      .getByRole("button", { name: /Updates/, exact: false })
      .click();
    await overflow();
    if (width === 448) await axe("pixel-reports");
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("button", { name: "League", exact: true })
      .click();
    await overflow();
  }
  failSync = true;
  await page.getByRole("button", { name: "Refresh league", exact: true }).click();
  await page.getByText("Synthetic provider outage", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "The bigger picture." }).count(), 1);
  await page
    .getByRole("navigation", { name: "League sections" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const started = new Promise((resolve) => {
    readStarted = resolve;
  });
  holdRead = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await started;
  await page.getByRole("button", { name: "Sign out of this device" }).click();
  await page.getByRole("heading", { name: "Your league. Your eyes only." }).waitFor();
  const completed = page.waitForResponse((r) => r.url().endsWith("/api/gridiron/workspace"));
  releaseRead();
  await completed;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(
    await page.getByRole("heading", { name: "Your league. Your eyes only." }).count(),
    1,
    "A delayed private response must not restore data after logout",
  );
  locked = true;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Your league. Your eyes only." }).waitFor();
  assert.equal(
    await page.getByText("Synthetic cross-device game plan", { exact: true }).count(),
    0,
  );
  await browser.close();
  devServer?.kill();
  const report = {
    errors,
    audits,
    screenshots: ["/tmp/gridiron-live-desktop.png", "/tmp/gridiron-live-pixel.png"],
    viewports: [360, 412, 448, 1440],
  };
  fs.writeFileSync("/tmp/gridiron-ui-audit.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  assert.equal(errors.length, 0);
  assert.equal(audits.flatMap((a) => a.violations).length, 0, "Accessibility violations remain");
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
