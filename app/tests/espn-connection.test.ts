import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { handleConnection } from "../src/lib/espn-connection.server";
import { encryptConnection, decryptConnection, randomToken, type ConnectionEnv } from "../src/lib/espn-security.server";
import { validateCredentials, verifyESPN } from "../src/lib/espn-provider.server";
const schema = await Bun.file(new URL("../migrations/0002_secure_espn.sql", import.meta.url)).text();
const input = { leagueId: 10309566, teamId: 25, season: 2026, swid: "{12345678-1234-1234-1234-123456789abc}", espnS2: "synthetic-cookie-value-for-tests" };
const endpoint = "https://example.test/api/gridiron/connection";
function fixture() {
  const db = new Database(":memory:"); db.exec(schema);
  const env: ConnectionEnv = { OWNER_ACCESS_KEY: randomToken(), CREDENTIAL_ENCRYPTION_KEY: randomToken(), DB: { prepare(sql: string) {
    let args: unknown[] = [];
    return { bind(...values: unknown[]) { args = values; return this; }, async first() { return db.query(sql).get(...args as []) ?? null; }, async run() { const result = db.query(sql).run(...args as []); return { success: true, meta: { changes: result.changes } }; } };
  } } as unknown as ConnectionEnv["DB"] };
  const calls: { url: string; options: RequestInit }[] = [];
  let upstreamStatus = 200;
  const transport = (async (url: RequestInfo | URL, options: RequestInit) => {
    calls.push({ url: String(url), options });
    return upstreamStatus === 200 ? Response.json({ id: input.leagueId, seasonId: 2026, settings: { name: "Test league" }, teams: [{ id: 25, name: "Test team" }] }) : new Response("Provider body must never be echoed: " + input.espnS2, { status: upstreamStatus });
  }) as typeof fetch;
  const request = (body?: Record<string, unknown>, token = "", headers: Record<string, string> = {}) => new Request(endpoint, { method: body ? "POST" : "GET", headers: { Origin: "https://example.test", "Content-Type": "application/json", Cookie: token, "CF-Connecting-IP": "192.0.2.1", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const call = (body?: Record<string, unknown>, token = "", headers?: Record<string, string>) => handleConnection(request(body, token, headers), env, transport);
  const login = async (token = "") => {
    const response = await call({ action: "login", ownerKey: env.OWNER_ACCESS_KEY }, token);
    expect(response.status).toBe(200);
    return response.headers.get("set-cookie")!.split(";")[0];
  };
  return { db, env, calls, request, call, login, transport, failProvider: (status: number) => { upstreamStatus = status; } };
}
describe("owner-only ESPN connection", () => {
  test("missing keys and missing schema fail closed", async () => {
    const f = fixture();
    const response = await handleConnection(f.request(), {});
    expect(await response.json()).toMatchObject({ ready: false, authenticated: false });
    expect((await handleConnection(f.request({ action: "save", ...input }), {})).status).toBe(503);
    f.db.exec("DROP TABLE ge_espn_connection");
    expect((await f.call()).status).toBe(503);
  });
  test("public status exposes no saved connection; all private actions require owner", async () => {
    const f = fixture();
    expect(await (await f.call()).json()).not.toHaveProperty("connection");
    for (const action of ["save", "test", "disconnect", "logout"]) expect((await f.call({ action, ...input, confirm: true })).status).toBe(401);
    expect(f.calls.length).toBe(0);
  });
  test("rejects cross-origin and non-JSON posts before using credentials", async () => {
    const f = fixture();
    expect((await f.call({ action: "login" }, "", { Origin: "https://evil.test" })).status).toBe(403);
    expect((await f.call({ action: "login" }, "", { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await f.call({ action: "login" }, "", { "Content-Type": "text/plain" })).status).toBe(415);
  });
  test("login is throttled and error responses do not contain input", async () => {
    const f = fixture();
    for (let i = 0; i < 6; i++) {
      const response = await f.call({ action: "login", ownerKey: "wrong-test-key" });
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("wrong-test-key");
    }
    const blocked = await f.call({ action: "login", ownerKey: f.env.OWNER_ACCESS_KEY });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("600");
  });
  test("secure sessions rotate, expire, and invalidate on owner-key changes", async () => {
    const f = fixture(), token = await f.login();
    const response = await f.call({ action: "login", ownerKey: f.env.OWNER_ACCESS_KEY }, token);
    const next = response.headers.get("set-cookie")!;
    for (const attribute of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=604800"]) expect(next).toContain(attribute);
    expect(await (await f.call(undefined, token)).json()).toMatchObject({ authenticated: false });
    expect(await (await f.call(undefined, next.split(";")[0])).json()).toMatchObject({ authenticated: true });
    f.env.OWNER_ACCESS_KEY = randomToken();
    expect(await (await f.call(undefined, next.split(";")[0])).json()).toMatchObject({ authenticated: false });
    const fresh = await f.login();
    f.db.exec("UPDATE ge_owner_sessions SET expires_at = 1");
    expect(await (await f.call(undefined, fresh)).json()).toMatchObject({ authenticated: false });
  });
  test("verifies only a fixed read endpoint and stores no plaintext cookies", async () => {
    const f = fixture(), token = await f.login();
    const response = await f.call({ action: "save", ...input, consent: true, revision: null }, token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const text = await response.text();
    expect(text).toContain("Test team");
    expect(text).not.toContain(input.espnS2); expect(text).not.toContain(input.swid);
    const row = f.db.query("SELECT * FROM ge_espn_connection").get();
    expect(JSON.stringify(row)).not.toContain(input.espnS2); expect(JSON.stringify(row)).not.toContain(input.swid);
    expect(f.calls[0].url).toBe("https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/10309566?view=mSettings&view=mTeam");
    expect(f.calls[0].options.method).toBe("GET"); expect(f.calls[0].options.redirect).toBe("manual"); expect(f.calls[0].options.signal).toBeDefined();
    expect(await (await f.call()).json()).not.toHaveProperty("connection");
    f.db.close();
  });
  test("invalid credentials and missing consent never reach ESPN", async () => {
    const f = fixture(), token = await f.login();
    expect((await f.call({ action: "save", ...input }, token)).status).toBe(400);
    expect((await f.call({ action: "save", ...input, espnS2: "bad; injected=value", consent: true }, token)).status).toBe(400);
    expect((await f.call({ action: "save", ...input, swid: "invalid", consent: true }, token)).status).toBe(400);
    expect(f.calls.length).toBe(0);
  });
  test("failed replacement preserves previous connection and never echoes ESPN bodies", async () => {
    const f = fixture(), token = await f.login();
    const first = await (await f.call({ action: "save", ...input, consent: true }, token)).json();
    const before = f.db.query("SELECT * FROM ge_espn_connection").get();
    f.failProvider(403);
    const response = await f.call({ action: "save", ...input, espnS2: "another-synthetic-cookie", consent: true, revision: first.connection.revision }, token);
    expect(response.status).toBe(422); expect(await response.text()).not.toContain(input.espnS2);
    expect(f.db.query("SELECT * FROM ge_espn_connection").get()).toEqual(before);
  });
  test("tests saved cookies, rejects stale changes, requires delete confirmation", async () => {
    const f = fixture(), token = await f.login();
    const first = await (await f.call({ action: "save", ...input, consent: true }, token)).json();
    expect((await f.call({ action: "disconnect", confirm: true, revision: "stale" }, token)).status).toBe(409);
    const verified = await (await f.call({ action: "test", revision: first.connection.revision }, token)).json();
    expect(verified.connection.revision).not.toBe(first.connection.revision);
    expect((await f.call({ action: "disconnect", revision: verified.connection.revision }, token)).status).toBe(400);
    expect((await f.call({ action: "disconnect", confirm: true, revision: verified.connection.revision }, token)).status).toBe(200);
    expect(f.db.query("SELECT * FROM ge_espn_connection").get()).toBeNull();
  });
  test("logout revokes session and clears cookie", async () => {
    const f = fixture(), token = await f.login();
    const response = await f.call({ action: "logout" }, token);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await f.call({ action: "test" }, token)).status).toBe(401);
  });
  test("bounds request bodies", async () => {
    const f = fixture();
    expect((await f.call({ action: "login", ownerKey: "x".repeat(13000) })).status).toBe(413);
  });
});
test("AES-GCM uses unique nonces and rejects altered ciphertext or changed keys", async () => {
  const key = randomToken(), a = await encryptConnection(key, input), b = await encryptConnection(key, input);
  expect(a).not.toBe(b); expect(await decryptConnection(key, a)).toEqual(input);
  await expect(decryptConnection(randomToken(), a)).rejects.toThrow("cannot be unlocked");
  const envelope = JSON.parse(a); envelope.ciphertext = (envelope.ciphertext[0] === "A" ? "B" : "A") + envelope.ciphertext.slice(1);
  await expect(decryptConnection(key, JSON.stringify(envelope))).rejects.toThrow("cannot be unlocked");
});
test("provider validation rejects header injection and mismatched data", async () => {
  expect(validateCredentials(input)).toEqual(input);
  expect(() => validateCredentials({ ...input, espnS2: "value\\r\\nCookie: injected" })).toThrow();
  expect(() => validateCredentials({ ...input, leagueId: "https://evil.test" })).toThrow();
  await expect(verifyESPN(input, (async () => Response.json({ id: 1, teams: [] })) as typeof fetch)).rejects.toThrow("did not match");
  await expect(verifyESPN(input, (async () => { throw new Error(input.espnS2); }) as typeof fetch)).rejects.toThrow("Cookie validity could not be checked");
  await expect(verifyESPN(input, (async () => new Response("x".repeat(20), { headers: { "Content-Type": "application/json", "Content-Length": "99999999" } })) as typeof fetch)).rejects.toThrow("too large");
});
