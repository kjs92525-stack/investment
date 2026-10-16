import { afterEach, expect, it, vi } from "vitest";
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(async () => ({})),
}));
import { jwtVerify } from "jose";
import { onRequest } from "../functions/api/[[path]]";
const env = {
  ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
  ACCESS_AUD: "aud",
  ANALYSIS_BACKEND_URL: "https://backend.example.com",
  ANALYSIS_SERVICE_TOKEN: "server-secret-only",
};
async function call(request: Request, settings = env) {
  return onRequest({ request, env: settings } as never) as Promise<Response>;
}
afterEach(() => vi.restoreAllMocks());
it("fails closed without config or Access JWT", async () => {
  expect((await call(new Request("https://app/api/analysis"))).status).toBe(
    401,
  );
  expect(
    (
      await call(new Request("https://app/api/analysis"), {
        ...env,
        ACCESS_AUD: "",
      })
    ).status,
  ).toBe(503);
});
it("rejects a forged Access JWT before backend calls", async () => {
  vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("forged"));
  const fetcher = vi.spyOn(globalThis, "fetch");
  expect(
    (
      await call(
        new Request("https://app/api/analysis", {
          headers: { "Cf-Access-Jwt-Assertion": "forged" },
        }),
      )
    ).status,
  ).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it("forwards only the service secret, strips cookies and forbids redirects", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response('{"id":"job"}', { status: 202 }));
  const response = await call(
    new Request("https://app/api/analysis", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": "signed", Cookie: "private" },
      body: '{"ticker":"AAPL"}',
    }),
  );
  expect(response.status).toBe(202);
  const options = fetcher.mock.calls[0][1]!;
  expect(options.headers).toEqual({
    Authorization: "Bearer server-secret-only",
    "Content-Type": "application/json",
  });
  expect(options.redirect).toBe("error");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("rejects arbitrary paths and oversized payloads", async () => {
  const headers = { "Cf-Access-Jwt-Assertion": "signed" };
  expect(
    (await call(new Request("https://app/api/orders", { headers }))).status,
  ).toBe(404);
  expect(
    (
      await call(
        new Request("https://app/api/analysis", {
          method: "POST",
          headers,
          body: "x".repeat(129),
        }),
      )
    ).status,
  ).toBe(413);
});
