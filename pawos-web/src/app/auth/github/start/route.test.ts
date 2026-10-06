import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /auth/github/start with the real Supabase server client (only the cookie jar and the network
 * are fakes): it must send the browser to Supabase's GitHub authorize URL with a PKCE challenge,
 * keep the verifier in a cookie — never in the URL — and leave /auth/callback able to finish the
 * exchange with that cookie, exactly as it does for the /login button.
 */
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0 || value === "") jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));

import { GET as start } from "./route";
import { GET as callback } from "../../callback/route";

const HOST = "pawos.revantaai.com";
const SUPABASE = "https://project-ref.supabase.co";
const request = (path: string) => new Request(`http://localhost:3000${path}`, { headers: { host: HOST, "x-forwarded-proto": "https" } });
const verifierCookie = () => [...jar].find(([name]) => name.endsWith("-code-verifier"));
// The cookie holds the verifier JSON-encoded, optionally base64url-prefixed (@supabase/ssr's cookie encoding).
const decode = (value: string) => JSON.parse(value.startsWith("base64-") ? Buffer.from(value.slice(7), "base64url").toString("utf-8") : value) as string;

beforeEach(() => {
  jar.clear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  // supabase-js refuses to construct a client on a Node without a global WebSocket (Node 20); these
  // tests never open one.
  if (typeof globalThis.WebSocket === "undefined") vi.stubGlobal("WebSocket", class {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /auth/github/start", () => {
  it("sends a signed-out browser to Supabase's GitHub authorize URL, returning through /auth/callback", async () => {
    const response = await start(request("/auth/github/start"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe(`${SUPABASE}/auth/v1/authorize`);
    expect(location.searchParams.get("provider")).toBe("github");
    expect(location.searchParams.get("redirect_to")).toBe(`https://${HOST}/auth/callback`);
  });

  it("uses PKCE: the challenge goes in the URL, the verifier stays in a cookie", async () => {
    const response = await start(request("/auth/github/start"));
    const location = new URL(response.headers.get("location")!);

    const cookie = verifierCookie();
    expect(cookie).toBeDefined();
    const verifier = decode(cookie![1]);
    expect(location.searchParams.get("code_challenge_method")).toBe("s256");
    expect(location.searchParams.get("code_challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(location.toString()).not.toContain(verifier);
  });

  it("starts a fresh PKCE pair on every visit", async () => {
    const first = new URL((await start(request("/auth/github/start"))).headers.get("location")!);
    const second = new URL((await start(request("/auth/github/start"))).headers.get("location")!);
    expect(second.searchParams.get("code_challenge")).not.toBe(first.searchParams.get("code_challenge"));
  });

  it("ignores query parameters it is given (no caller-chosen redirect)", async () => {
    const response = await start(request("/auth/github/start?redirect_to=https://evil.example&next=//evil.example&marketplace_listing_plan_id=1"));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("redirect_to")).toBe(`https://${HOST}/auth/callback`);
    expect(location.toString()).not.toContain("evil.example");
  });

  it("lets /auth/callback finish the sign-in with the stored verifier", async () => {
    await start(request("/auth/github/start"));
    const verifier = decode(verifierCookie()![1]);

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith(`${SUPABASE}/auth/v1/token`)) throw new Error(`Unexpected fetch in test: ${url}`);
      const body = JSON.parse(String(init?.body)) as { auth_code?: string; code_verifier?: string };
      if (body.auth_code !== "code-from-supabase" || body.code_verifier !== verifier) {
        return new Response(JSON.stringify({ error: "invalid_grant", error_description: "bad code verifier" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const now = Math.floor(Date.now() / 1000);
      const user = { id: "user-1", aud: "authenticated", email: "octo@example.com", app_metadata: { provider: "github" }, user_metadata: {}, created_at: new Date().toISOString() };
      return new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await callback(request("/auth/callback?code=code-from-supabase"));

    expect(response.headers.get("location")).toBe(`https://${HOST}/dashboard`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...jar.keys()].some((name) => name.endsWith("-auth-token"))).toBe(true);
    expect(verifierCookie()).toBeUndefined();
  });

  it("falls back to /login with a message when Supabase isn't configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const response = await start(request("/auth/github/start"));
    const location = new URL(response.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe(`https://${HOST}/login`);
    expect(location.searchParams.get("error")).toBeTruthy();
  });
});
