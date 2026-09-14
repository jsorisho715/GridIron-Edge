import { boundedText, decryptConnection, encryptConnection, keyedHash, missingConfig, randomToken, SafeError, verifyOwner, type ConnectionEnv } from "./espn-security.server";
import { validateCredentials, verifyESPN, type ESPNInput } from "./espn-provider.server";
type Stored = { envelope: string; metadata: string; revision: string };
const cookieName = "__Host-ge_owner";
const sessionSeconds = 7 * 24 * 60 * 60;
const cookie = (value: string, seconds: number) => cookieName + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + seconds;
function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private", "Pragma": "no-cache", "Vary": "Cookie", ...extra } });
}
async function sessionHash(request: Request, env: ConnectionEnv) {
  const token = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? keyedHash(env.OWNER_ACCESS_KEY!, "session:" + token) : "";
}
async function authorized(request: Request, env: ConnectionEnv) {
  const hash = await sessionHash(request, env);
  if (!hash) return false;
  return !!await env.DB!.prepare("SELECT hash FROM ge_owner_sessions WHERE hash = ? AND expires_at > ?").bind(hash, Date.now()).first();
}
async function limit(env: ConnectionEnv, key: string, max: number, windowMs: number) {
  const now = Date.now(), window = Math.floor(now / windowMs);
  const hash = await keyedHash(env.OWNER_ACCESS_KEY!, "rate:" + key + ":" + window);
  const row = await env.DB!.prepare("INSERT INTO ge_connection_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count").bind(hash, (window + 1) * windowMs).first<{ count: number }>();
  if (!row || row.count > max) throw new SafeError(429, "rate_limited", "Too many attempts. Wait ten minutes before trying again.");
}
async function stored(env: ConnectionEnv) {
  return env.DB!.prepare("SELECT envelope, metadata, revision FROM ge_espn_connection WHERE id = 1").first<Stored>();
}
function publicConnection(row: Stored | null) {
  return row ? { ...JSON.parse(row.metadata), revision: row.revision } : null;
}
function checkRevision(body: Record<string, unknown>, current: Stored | null) {
  if ((body.revision ?? null) !== (current?.revision ?? null)) throw new SafeError(409, "changed", "This connection changed in another tab. Refresh before trying again.");
}
export async function handleConnection(request: Request, env: ConnectionEnv, transport: typeof fetch = fetch): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (!["GET", "POST"].includes(request.method)) return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
    if (request.method === "POST") {
      if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new SafeError(403, "origin", "Open the connection screen directly to continue.");
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new SafeError(415, "content_type", "Use the secure connection form.");
    }
    const missing = missingConfig(env);
    if (missing.length) return json({ ready: false, authenticated: false, missing, error: request.method === "POST" ? "Secure hosting setup is incomplete. No credentials were saved." : undefined }, request.method === "GET" ? 200 : 503);
    // Fail closed until the additive deployment migration is present.
    await env.DB!.prepare("SELECT id FROM ge_espn_connection LIMIT 1").first();
    const isOwner = await authorized(request, env);
    if (request.method === "GET") return json({ ready: true, authenticated: isOwner, connection: isOwner ? publicConnection(await stored(env)) : undefined, dashboardMode: "sample" });
    let body: Record<string, unknown>;
    try {
      const raw = await boundedText(new Response(request.body), 12288);
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof SafeError) throw error;
      throw new SafeError(400, "invalid_request", "The form could not be read. Please try again.");
    }
    if (body.action === "login") {
      await env.DB!.prepare("DELETE FROM ge_connection_limits WHERE expires_at < ?").bind(Date.now()).run();
      await limit(env, "login:global", 60, 600000);
      await limit(env, "login:" + (request.headers.get("cf-connecting-ip") ?? "unknown"), 6, 600000);
      if (typeof body.ownerKey !== "string" || body.ownerKey.length > 256 || !await verifyOwner(env.OWNER_ACCESS_KEY!, body.ownerKey)) throw new SafeError(401, "owner_key", "The owner key was not accepted.");
      await env.DB!.prepare("DELETE FROM ge_connection_limits WHERE expires_at < ?").bind(Date.now()).run();
      await env.DB!.prepare("DELETE FROM ge_owner_sessions WHERE expires_at < ?").bind(Date.now()).run();
      const token = randomToken();
      const hash = await keyedHash(env.OWNER_ACCESS_KEY!, "session:" + token);
      await env.DB!.prepare("INSERT INTO ge_owner_sessions (hash, expires_at) VALUES (?, ?)").bind(hash, Date.now() + sessionSeconds * 1000).run();
      const previous = await sessionHash(request, env);
      if (previous) await env.DB!.prepare("DELETE FROM ge_owner_sessions WHERE hash = ?").bind(previous).run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie(token, sessionSeconds) });
    }
    if (!isOwner) throw new SafeError(401, "locked", "Unlock the owner workspace before managing connections.");
    if (body.action === "logout") {
      await env.DB!.prepare("DELETE FROM ge_owner_sessions WHERE hash = ?").bind(await sessionHash(request, env)).run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (!["save", "test", "disconnect"].includes(String(body.action))) throw new SafeError(400, "action", "Unknown connection action.");
    const current = await stored(env);
    checkRevision(body, current);
    if (body.action === "disconnect") {
      if (body.confirm !== true) throw new SafeError(400, "confirm", "Confirm deletion of the saved ESPN credentials.");
      if (current) {
        const result = await env.DB!.prepare("DELETE FROM ge_espn_connection WHERE id = 1 AND revision = ?").bind(current.revision).run();
        if (!result.meta.changes) throw new SafeError(409, "changed", "The connection changed. Refresh before deleting.");
      }
      return json({ ok: true, connection: null });
    }
    await limit(env, "espn:owner", 6, 600000);
    if (body.action === "save" && body.consent !== true) throw new SafeError(400, "consent", "Confirm the read-only ESPN check before continuing.");
    if (body.action === "test" && !current) throw new SafeError(409, "not_connected", "Save a connection first.");
    const input = body.action === "save" ? validateCredentials(body) : await decryptConnection<ESPNInput>(env.CREDENTIAL_ENCRYPTION_KEY!, current!.envelope);
    const metadata = await verifyESPN(input, transport);
    const envelope = body.action === "save" ? await encryptConnection(env.CREDENTIAL_ENCRYPTION_KEY!, input) : current!.envelope;
    const revision = randomToken();
    const result = current
      ? await env.DB!.prepare("UPDATE ge_espn_connection SET envelope = ?, metadata = ?, revision = ? WHERE id = 1 AND revision = ?").bind(envelope, JSON.stringify(metadata), revision, current.revision).run()
      : await env.DB!.prepare("INSERT INTO ge_espn_connection (id, envelope, metadata, revision) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(envelope, JSON.stringify(metadata), revision).run();
    if (!result.meta.changes) throw new SafeError(409, "changed", "The connection changed in another tab. Refresh and try again.");
    return json({ ok: true, connection: { ...metadata, revision } });
  } catch (error) {
    if (error instanceof SafeError) return json({ error: error.message, code: error.code }, error.status, error.status === 429 ? { "Retry-After": "600" } : {});
    // Never log requests, cookie values, provider bodies or database errors.
    return json({ error: "Secure storage is temporarily unavailable. No connection change was confirmed.", code: "storage_unavailable" }, 503);
  }
}
