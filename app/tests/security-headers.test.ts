import { expect, test } from "bun:test";
import { applySecurityHeaders } from "../src/lib/security-headers.server";

test("prevents embedding the private app and preserves the response", async () => {
  const response = applySecurityHeaders(new Response("ok", { status: 201 }));
  expect(response.status).toBe(201);
  expect(await response.text()).toBe("ok");
  expect(response.headers.get("content-security-policy")).toContain(
    "frame-src 'none'; frame-ancestors 'none'; object-src 'none';",
  );
  expect(response.headers.get("content-security-policy")).toContain("connect-src 'self';");
});
