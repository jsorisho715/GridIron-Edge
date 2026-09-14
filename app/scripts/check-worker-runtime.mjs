import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Uses the workerd version shipped with our pinned Wrangler. No production
// bindings or network calls: the upstream is a local, synthetic ESPN response.
export async function checkWorkerRuntime(wranglerPackage) {
  const require = createRequire(wranglerPackage);
  const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(require.resolve("miniflare")).href);
  const dir = mkdtempSync(join(tmpdir(), "gridiron-runtime-"));
  let runtime;
  try {
    const entry = join(dir, "check.ts"), bundle = join(dir, "check.js");
    writeFileSync(entry, `
      import { verifyESPN } from ${JSON.stringify(resolve("src/lib/espn-provider.server.ts"))};
      export default { async fetch() {
        try {
          return Response.json(await verifyESPN({ leagueId: 10309566, teamId: 25,
            season: 2026, swid: "{12345678-1234-1234-1234-123456789abc}",
            espnS2: "synthetic-runtime-cookie" }));
        } catch (error) {
          return Response.json({ code: error.code, error: error.message }, { status: error.status || 500 });
        }
      } };
    `);
    const buildEnv = { ...process.env };
    for (const name of ["OWNER_ACCESS_KEY", "CREDENTIAL_ENCRYPTION_KEY", "CLOUDFLARE_API_TOKEN"]) delete buildEnv[name];
    const build = spawnSync("bun", ["build", entry, "--target=browser", "--outfile", bundle], {
      env: buildEnv, encoding: "utf8", timeout: 30000,
    });
    assert.equal(build.status, 0, "Could not build the Worker runtime regression check.");
    let upstreamStatus = 200, calls = 0;
    runtime = new Miniflare(convertV4MiniflareOptions({
      cf: false, modules: true, compatibilityDate: "2026-09-14",
      script: readFileSync(bundle, "utf8"),
      outboundService: async (request) => {
        calls++;
        assert.equal(request.url, "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/10309566?view=mSettings&view=mTeam");
        assert.equal(request.method, "GET");
        assert.equal(request.headers.get("cookie"), "SWID={12345678-1234-1234-1234-123456789abc}; espn_s2=synthetic-runtime-cookie");
        if (upstreamStatus === 302) return new Response(null, { status: 302, headers: { Location: "https://untrusted.example/" } });
        if (upstreamStatus !== 200) return new Response(null, { status: upstreamStatus });
        return Response.json({ id: 10309566, seasonId: 2026,
          settings: { name: "Runtime test league" }, teams: [{ id: 25, name: "Runtime test team" }] });
      },
    }));
    const success = await runtime.dispatchFetch("https://runtime.test/");
    assert.equal(success.status, 200, "ESPN request must work in workerd, not just Bun mocks.");
    assert.equal((await success.json()).teamName, "Runtime test team");
    assert.equal(calls, 1);
    for (const [status, code, expectedStatus] of [[302, "espn_redirect", 502], [401, "espn_auth", 422], [403, "espn_forbidden", 422]]) {
      upstreamStatus = status;
      const before = calls;
      const response = await runtime.dispatchFetch("https://runtime.test/");
      assert.equal(response.status, expectedStatus);
      assert.equal((await response.json()).code, code);
      assert.equal(calls, before + 1, "Never follow a redirect or retry authentication automatically.");
    }
    console.log("Worker runtime checks passed: ESPN requests, redirect refusal, and access errors.");
  } finally {
    if (runtime) await runtime.dispose();
    rmSync(dir, { recursive: true, force: true });
  }
}
