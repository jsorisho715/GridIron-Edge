import type { D1Database } from "@cloudflare/workers-types";

export type ConnectionEnv = {
  DB?: D1Database;
  OWNER_ACCESS_KEY?: string;
  CREDENTIAL_ENCRYPTION_KEY?: string;
};
export class SafeError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const enc = new TextEncoder();
export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}
async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function keyedHash(secret: string, value: string) {
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyOwner(secret: string, candidate: string) {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode("owner:" + secret));
  return crypto.subtle.verify("HMAC", key, signature, enc.encode("owner:" + candidate));
}
function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function unbase64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function aesKey(hex: string) {
  const bytes = Uint8Array.from(hex.match(/.{2}/g)!, c => parseInt(c, 16));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const aad = enc.encode("gridiron-edge:owner:espn:v1");
export async function encryptConnection(secret: string, data: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, await aesKey(secret), enc.encode(JSON.stringify(data)));
  return JSON.stringify({ version: 1, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) });
}
export async function decryptConnection<T>(secret: string, value: string): Promise<T> {
  try {
    const envelope = JSON.parse(value);
    if (envelope.version !== 1) throw new Error();
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(envelope.iv), additionalData: aad }, await aesKey(secret), unbase64(envelope.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    throw new SafeError(409, "key_changed", "Saved credentials cannot be unlocked. Replace them to reconnect.");
  }
}
export function missingConfig(env: ConnectionEnv) {
  const missing: string[] = [];
  if (!env.OWNER_ACCESS_KEY || env.OWNER_ACCESS_KEY.length < 32 || env.OWNER_ACCESS_KEY.length > 256) missing.push("OWNER_ACCESS_KEY");
  if (!/^[a-fA-F0-9]{64}$/.test(env.CREDENTIAL_ENCRYPTION_KEY ?? "")) missing.push("CREDENTIAL_ENCRYPTION_KEY");
  if (!env.DB) missing.push("DATABASE");
  return missing;
}
export async function boundedText(response: Response, limit: number) {
  if (Number(response.headers.get("content-length") ?? 0) > limit) {
    await response.body?.cancel();
    throw new SafeError(413, "too_large", "The request or provider response is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > limit) throw new SafeError(413, "too_large", "The request or provider response is too large.");
      chunks.push(chunk.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
