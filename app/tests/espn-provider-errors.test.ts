import { expect, test } from "bun:test";
import { verifyESPN } from "../src/lib/espn-provider.server";
import { SafeError } from "../src/lib/espn-security.server";

const input = { leagueId: 10309566, teamId: 25, season: 2026,
  swid: "{12345678-1234-1234-1234-123456789abc}", espnS2: "synthetic-sensitive-cookie" };

test("provider errors distinguish timeout, transport and unreadable data without exposing cookies", async () => {
  const cases: [typeof fetch, number, string][] = [
    [(async () => { throw new DOMException(input.espnS2, "TimeoutError"); }) as typeof fetch, 504, "espn_timeout"],
    [(async () => { throw new TypeError(input.espnS2); }) as typeof fetch, 502, "espn_network"],
    [(async () => new Response(input.espnS2, { headers: { "Content-Type": "application/json" } })) as typeof fetch, 502, "espn_response"],
    [(async () => new Response(null, { status: 401 })) as typeof fetch, 422, "espn_auth"],
    [(async () => new Response(null, { status: 403 })) as typeof fetch, 422, "espn_forbidden"],
  ];
  for (const [transport, status, code] of cases) {
    try { await verifyESPN(input, transport); throw new Error("Expected verification to fail"); }
    catch (error) {
      expect(error).toBeInstanceOf(SafeError);
      expect(error).toMatchObject({ status, code });
      expect((error as Error).message).not.toContain(input.espnS2);
    }
  }
});

test("redirects are refused without a second request or disclosure of the destination", async () => {
  let calls = 0, cancelled = false;
  const transport = (async (_url, options) => {
    calls++;
    expect(options?.redirect).toBe("manual");
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: 302, headers: { Location: "https://untrusted.example/?cookie=" + input.espnS2 },
    });
  }) as typeof fetch;
  await expect(verifyESPN(input, transport)).rejects.toMatchObject({ code: "espn_redirect" });
  expect(calls).toBe(1);
  expect(cancelled).toBe(true);
});
