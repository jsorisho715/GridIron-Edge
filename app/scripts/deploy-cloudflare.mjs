import { writeFileSync, appendFileSync, mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { checkWorkerRuntime } from "./check-worker-runtime.mjs";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, OWNER_ACCESS_KEY: owner, CREDENTIAL_ENCRYPTION_KEY: encryption } = process.env;
const name = process.env.APP_SLUG || "gridiron-edge";
function check(ok, message) { if (!ok) throw new Error(message); }
async function api(path, method = "GET", body) {
  const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + account + path, {
    method, redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (method === "GET" && path === "/workers/subdomain" && r.status === 404 &&
      (data.errors || []).some(e => e.code === 10007)) return null;
  check(r.ok && data.success !== false, "Cloudflare " + method + " " + path.split("?")[0] + " returned HTTP " + r.status + "; codes " + (data.errors || []).map(e => e.code).join(",") + ". Check the token permissions and account.");
  return data.result;
}
async function main() {
  check(token && /^[a-f0-9]{32}$/.test(account || ""), "Configure the Cloudflare token and account ID.");
  check(owner && owner.length >= 32 && owner.length <= 256, "OWNER_ACCESS_KEY must be 32 to 256 characters.");
  check(/^[a-fA-F0-9]{64}$/.test(encryption || ""), "CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hex characters.");
  check(/^[a-z][a-z0-9-]{2,40}$/.test(name), "Invalid Worker name.");
  await checkWorkerRuntime(join(process.env.RUNNER_TEMP || tmpdir(), "gridiron-tools/node_modules/wrangler/package.json"));
  let subdomain = (await api("/workers/subdomain"))?.subdomain;
  if (!subdomain) {
    // Only provision an absent address; never rename an existing account address.
    subdomain = (await api("/workers/subdomain", "PUT", {
      subdomain: name + "-" + account.slice(0, 8)
    }))?.subdomain;
  }
  check(subdomain && /^[a-z0-9-]+$/.test(subdomain), "Set up a workers.dev subdomain in Cloudflare Workers & Pages, then rerun deployment.");
  let db;
  for (let page = 1; page <= 20; page++) {
    const list = await api("/d1/database?per_page=100&page=" + page);
    check(Array.isArray(list), "Unexpected D1 database list.");
    db = list.find(d => d.name === name + "-db");
    if (db || list.length < 100) break;
    check(page < 20, "Database lookup limit reached.");
  }
  if (!db) db = await api("/d1/database", "POST", { name: name + "-db" });
  check(/^[a-f0-9-]{36}$/i.test(db?.uuid || ""), "Invalid D1 database ID.");
  const dir = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "gridiron-deploy-"));
  const cfg = join(dir, "wrangler.json"), sec = join(dir, "secrets.json");
  const config = {
    name, account_id: account, main: resolve("dist/server/server.js"),
    compatibility_date: "2026-09-14", compatibility_flags: ["nodejs_compat"],
    workers_dev: true, preview_urls: false, send_metrics: false,
    triggers: { crons: ["*/15 * * * *"] },
    assets: { directory: resolve("dist/client"), binding: "ASSETS", not_found_handling: "none" },
    vars: { APP_SLUG: name, HF_ENV: process.env.HF_ENV || "production" },
    d1_databases: [{ binding: "DB", database_name: name + "-db", database_id: db.uuid, migrations_dir: resolve("migrations") }],
    observability: { enabled: false }
  };
  const childEnv = { ...process.env };
  delete childEnv.OWNER_ACCESS_KEY; delete childEnv.CREDENTIAL_ENCRYPTION_KEY;
  function wrangler(args) {
    const executable = join(process.env.RUNNER_TEMP || tmpdir(), "gridiron-tools/node_modules/wrangler/bin/wrangler.js");
    const r = spawnSync(process.execPath, [executable, ...args], { stdio: "inherit", env: childEnv, timeout: 240000 });
    check(r.status === 0, "Wrangler " + args[0] + " failed; see deployment output.");
  }
  try {
    writeFileSync(cfg, JSON.stringify(config), { mode: 0o600 });
    // App keys go directly to Cloudflare in the deployment, never to logs or artifacts.
    writeFileSync(sec, JSON.stringify({ OWNER_ACCESS_KEY: owner, CREDENTIAL_ENCRYPTION_KEY: encryption }), { mode: 0o600 });
    wrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", cfg]);
    wrangler(["deploy", "--config", cfg, "--secrets-file", sec]);
  } finally {
    for (const file of [sec, cfg]) { try { unlinkSync(file); } catch {} }
    try { rmdirSync(dir); } catch {}
  }
  const origin = "https://" + name + "." + subdomain + ".workers.dev";
  const get = async path => {
    for(let attempt=0;attempt<3;attempt++){
      try{const response=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(15000)});if(response.status<500||attempt===2)return response;await response.body?.cancel();}
      catch(error){if(attempt===2)throw new Error('Loading check could not reach '+path+' ('+(error.cause?.code||error.name||'network')+').');}
      await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
    }
  };
  let healthy = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    let status;
    try {
      const r = await fetch(origin + "/api/gridiron/connection", { redirect: "error", signal: AbortSignal.timeout(10000) });
      check(![401,403].includes(r.status), "ACCESS_BLOCKED");
      status = r.ok ? await r.json() : null;
    } catch (e) {
      if (e.message === "ACCESS_BLOCKED") throw new Error("A hosting access policy blocked the readiness check.");
    }
    if (status?.ready === true && status.authenticated === false && !status.connection) { healthy = true; break; }
    await new Promise(r => setTimeout(r, 5000));
  }
  check(healthy, "Worker deployed but secure setup readiness failed. Check bindings and migrations.");
  const html = await get("/connections");
  check(html.ok && (await html.text()).includes("Secure connections"), "Connection screen smoke check failed.");
  // Check deployed entry pages, install assets and their first-party CSS/font/JS references.
  const pageResponse=await get('/app');
  check(pageResponse.ok,'Workspace page failed to load.');const pageHTML=await pageResponse.text();
  const paths=new Set(['/manifest.webmanifest','/sw.js','/offline.html','/icon-192.png','/icon-512.png','/robots.txt']);
  for(const match of pageHTML.matchAll(/(?:href|src)="(\/assets\/[^"?#]+)"/g))paths.add(match[1]);
  let assetsChecked=0;
  const asset=async path=>{const r=await get(path);check(r.ok,'A deployed asset failed to load: '+path);assetsChecked++;if(r.headers.get('content-type')?.includes('text/css')){const css=await r.text();check(!/data:font\//.test(css),'Inline fonts violate the production CSP.');return [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>new URL(m[1],origin+path)).filter(u=>u.origin===origin&&/\.woff2?$/.test(u.pathname)).map(u=>u.pathname);}await r.arrayBuffer();return [];};
  const fonts=new Set();const initial=[...paths];for(let i=0;i<initial.length;i+=6)for(const found of await Promise.all(initial.slice(i,i+6).map(asset)))for(const path of found)fonts.add(path);
  const fontPaths=[...fonts];for(let i=0;i<fontPaths.length;i+=6)await Promise.all(fontPaths.slice(i,i+6).map(asset));
  console.log('Production loading checks passed: '+assetsChecked+' install, script, style and font assets.');
  const privateStatus = await get("/api/gridiron/workspace");
  check(privateStatus.status === 401, "Private workspace must reject unauthenticated reads.");
  let cookie;
  const privateCall = async (path, body) => {
    const response = await fetch(origin + path, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(120000),
      headers: { Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    check(response.ok, "Private deployment check returned HTTP " + response.status + ".");
    return response;
  };
  try {
    const login = await privateCall("/api/gridiron/connection", { action: "login", ownerKey: owner });
    cookie = login.headers.get("set-cookie")?.split(";")[0];
    check(cookie, "Private deployment check could not establish an owner session.");
    let workspace = await (await privateCall("/api/gridiron/workspace")).json();
    if (workspace.connected) {
      if (!workspace.preferences.paused) {
        const sync = await (await privateCall("/api/gridiron/workspace", { action: "sync" })).json();
        workspace = sync.workspace;
        if(sync.diagnostics&&workspace.snapshot?.players.filter(p=>p.teamId===workspace.snapshot.teamId).every(p=>p.projected===null))console.log("Projection coverage check: "+JSON.stringify(sync.diagnostics));
        check(!sync.error, "Live league import failed: " + (sync.error || "unknown"));
        check(workspace.snapshot, "Live league import produced no snapshot.");
      }
      if (workspace.snapshot) {
        const s = workspace.snapshot, mine = s.players.filter(p => p.teamId === s.teamId);
        check(s.leagueId === 10309566 && s.teamId === 25 && s.slots.length > 0, "Imported league identity or slots did not match this private app.");
        check(!JSON.stringify(workspace).includes('"espnS2"') && !JSON.stringify(workspace).includes('"envelope"'), "Private API exposed a credential field.");
        console.log("Live league verified: " + JSON.stringify({ season: s.season, week: s.week, schedulerSeen: !!workspace.health.heartbeat, schedulerAgeMinutes: workspace.health.heartbeat?Math.round((Date.now()-workspace.health.heartbeat)/60000):null, teams: s.teams.length, roster: mine.length, slots: s.slots.length, pool: s.players.length, withHistory: mine.filter(p => p.history.length).length, withSchedule: mine.filter(p => p.scheduleKnown).length, withProjection: mine.filter(p => p.projected !== null).length, warnings: s.warnings }));
      }
    } else console.log("No ESPN connection saved; secure first-run screen verified.");
  } finally {
    if (cookie) await privateCall("/api/gridiron/connection", { action: "logout" });
    cookie = undefined;
  }
  console.log("Deployment verified: " + origin + "/app");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Gridiron Edge\n\n[Open private workspace](" + origin + "/app)\n\nOwner access, live league import and scheduled monitoring are configured. Enable notifications on each device to receive alerts.\n");
}
main().catch(e => { console.error("Deployment stopped: " + e.message); process.exitCode = 1; });
