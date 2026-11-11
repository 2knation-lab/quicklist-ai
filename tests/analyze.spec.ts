import { test, expect } from "@playwright/test";
import { createAnalyzeHandler } from "../lib/analyze";
import { demoProposal } from "../lib/listing";

// These values are test fixtures. No request leaves this process.
const env = {
  OPENAI_API_KEY: "test-provider-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
};
const photo = "data:image/jpeg;base64,YQ==";
function request(
  body = JSON.stringify({ photos: [photo] }),
  token = "user-token",
) {
  return new Request("http://local.test/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
}
function services(
  options: {
    authenticated?: boolean;
    quota?: boolean;
    quotaUnavailable?: boolean;
    providerUnavailable?: boolean;
    proposal?: unknown;
  } = {},
) {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      headers: new Headers(init?.headers),
      body: String(init?.body || ""),
    });
    if (url.endsWith("/auth/v1/user"))
      return options.authenticated === false
        ? Response.json({ message: "Invalid token" }, { status: 401 })
        : Response.json({ id: "test-user", aud: "authenticated" });
    if (url.endsWith("/rest/v1/rpc/reserve_ai_analysis"))
      return options.quotaUnavailable
        ? Response.json(
            { message: "Missing function", code: "PGRST202" },
            { status: 404 },
          )
        : Response.json(options.quota ?? true);
    if (url === "https://api.openai.com/v1/chat/completions")
      return options.providerUnavailable
        ? Response.json({ error: "Unavailable" }, { status: 500 })
        : Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify(options.proposal ?? demoProposal),
                },
              },
            ],
          });
    throw new Error(`Unexpected network request: ${url}`);
  };
  return { calls, handler: createAnalyzeHandler(env, transport), transport };
}

test("authenticated analysis reserves usage under the user's token before calling AI", async () => {
  const { calls, handler } = services();
  const response = await handler(request());
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toEqual({ mode: "ai", proposal: demoProposal });
  expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
    "/auth/v1/user",
    "/rest/v1/rpc/reserve_ai_analysis",
    "/v1/chat/completions",
  ]);
  expect(calls[1].headers.get("authorization")).toBe("Bearer user-token");
  expect(calls[2].headers.get("authorization")).toBe(
    "Bearer test-provider-key",
  );
  const payload = JSON.parse(calls[2].body);
  expect(payload.messages[1].content[1].image_url.url).toBe(photo);
  expect(JSON.stringify(result)).not.toContain(env.OPENAI_API_KEY);
});

test("missing or expired sessions cannot consume quota or invoke AI", async () => {
  const { calls, handler } = services({ authenticated: false });
  expect((await handler(request(undefined, ""))).status).toBe(401);
  expect(calls).toHaveLength(0);
  expect((await handler(request())).status).toBe(401);
  expect(calls).toHaveLength(1);
});

test("missing Supabase configuration refuses live analysis", async () => {
  const { calls, transport } = services();
  const response = await createAnalyzeHandler(
    { OPENAI_API_KEY: "test" },
    transport,
  )(request());
  expect(response.status).toBe(503);
  expect(calls).toHaveLength(0);
});

test("invalid photo requests are rejected before quota or AI calls", async () => {
  for (const body of [
    "not-json",
    "null",
    "{}",
    '{"photos":[]}',
    JSON.stringify({ photos: Array(5).fill(photo) }),
    JSON.stringify({ photos: ["https://example.test/photo.jpg"] }),
  ]) {
    const { calls, handler } = services();
    expect((await handler(request(body))).status).toBe(400);
    expect(calls).toHaveLength(1);
  }
});

test("oversized payloads are rejected without consuming AI usage", async () => {
  const { calls, handler } = services();
  expect((await handler(request("x".repeat(4_000_001)))).status).toBe(413);
  expect(calls).toHaveLength(1);
});

test("exhausted daily quota blocks paid analysis", async () => {
  const { calls, handler } = services({ quota: false });
  const response = await handler(request());
  expect(response.status).toBe(429);
  expect((await response.json()).error).toContain("Daily AI limit");
  expect(calls).toHaveLength(2);
});

test("missing quota migration fails closed", async () => {
  const { calls, handler } = services({ quotaUnavailable: true });
  expect((await handler(request())).status).toBe(503);
  expect(calls).toHaveLength(2);
});

test("provider and invalid proposal errors never fall back to demo mode", async () => {
  for (const options of [
    { providerUnavailable: true },
    { proposal: { title: "Incomplete" } },
  ]) {
    const { handler } = services(options);
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error:
        "Analysis could not complete. Try again or write the draft manually.",
    });
  }
});

test("credential-free demo does not make external requests", async () => {
  const { calls, transport } = services();
  const response = await createAnalyzeHandler({}, transport)(request());
  expect((await response.json()).mode).toBe("demo");
  expect(calls).toHaveLength(0);
});
