import { createRemoteJWKSet, jwtVerify } from "jose";
interface Env {
  ANALYSIS_BACKEND_URL: string;
  ANALYSIS_SERVICE_TOKEN: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}
// Cloudflare Pages Functions: authenticate every request before forwarding.
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers });
  if (
    !env.ACCESS_TEAM_DOMAIN ||
    !env.ACCESS_AUD ||
    !env.ANALYSIS_BACKEND_URL ||
    !env.ANALYSIS_SERVICE_TOKEN
  )
    return fail(503, "분석 게이트웨이 설정이 필요합니다.");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))
    return fail(503, "접근 인증 설정 오류");
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return fail(401, "Cloudflare Access 로그인이 필요합니다.");
  try {
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    await jwtVerify(
      jwt,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      { issuer, audience: env.ACCESS_AUD, requiredClaims: ["exp", "sub"] },
    );
  } catch {
    return fail(401, "접근 인증이 유효하지 않습니다.");
  }
  const path = new URL(request.url).pathname;
  if (
    !(
      (request.method === "POST" && path === "/api/analysis") ||
      (request.method === "GET" &&
        /^\/api\/analysis\/[0-9a-f-]{36}$/.test(path))
    )
  )
    return fail(404, "지원하지 않는 경로입니다.");
  if (
    request.method === "POST" &&
    Number(request.headers.get("Content-Length") || "0") > 128
  )
    return fail(413, "요청이 너무 큽니다.");
  let body: string | undefined;
  if (request.method === "POST") {
    // Streaming cap also protects chunked requests without Content-Length.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128) {
        await reader.cancel();
        return fail(413, "요청이 너무 큽니다.");
      }
      chunks.push(value);
    }
    body = new TextDecoder().decode(
      Uint8Array.from(chunks.flatMap((c) => [...c])),
    );
  }
  try {
    const backend = new URL(env.ANALYSIS_BACKEND_URL);
    if (
      backend.protocol !== "https:" ||
      backend.username ||
      backend.password ||
      backend.pathname !== "/"
    )
      return fail(503, "백엔드 URL 설정 오류");
    const response = await fetch(new URL(path, backend), {
      method: request.method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${env.ANALYSIS_SERVICE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body,
    });
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return fail(502, "분석 서버에 연결하지 못했습니다.");
  }
};
