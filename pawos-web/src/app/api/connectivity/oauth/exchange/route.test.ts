import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: supabase.getUser } }) }));

import { POST } from "./route";
import { isPawosRedirectUri } from "../../../../../lib/connectivityOAuthRedirects";

/**
 * The token exchange is the one place connector client secrets are used. It must only do the two
 * things the apps need — redeem a code for a PawOS redirect address, refresh a token — and never
 * forward anything else to a provider with the secret attached. The provider is a fake `fetch`.
 */
const exchange = (body: unknown) =>
  POST(new Request("https://pawos.revantaai.com/api/connectivity/oauth/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const SLACK_REDIRECT = "https://pawos.revantaai.com/api/connectors/slack/callback";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.SLACK_CLIENT_ID = "slack-id";
  process.env.SLACK_CLIENT_SECRET = "slack-secret";
  process.env.BITBUCKET_CLIENT_ID = "bb-key";
  process.env.BITBUCKET_CLIENT_SECRET = "bb-secret";
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "a b" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/connectivity/oauth/exchange", () => {
  it("redeems an authorization code for a PawOS redirect address", async () => {
    const response = await exchange({ connectorId: "slack", grant_type: "authorization_code", code: "abc", redirect_uri: SLACK_REDIRECT, code_verifier: "verifier" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ access_token: "access", refresh_token: "refresh" });
    const sent = new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(Object.fromEntries(sent)).toEqual({
      grant_type: "authorization_code",
      client_id: "slack-id",
      client_secret: "slack-secret",
      code: "abc",
      redirect_uri: SLACK_REDIRECT,
      code_verifier: "verifier",
    });
  });

  it("refreshes a token", async () => {
    const response = await exchange({ connectorId: "bitbucket", grant_type: "refresh_token", refresh_token: "old-refresh" });
    expect(response.status).toBe(200);
    const sent = new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(Object.fromEntries(sent)).toEqual({ grant_type: "refresh_token", refresh_token: "old-refresh" });
  });

  it.each(["client_credentials", "password", "urn:ietf:params:oauth:grant-type:device_code", "urn:ietf:params:oauth:grant-type:jwt-bearer", "urn:bitbucket:oauth2:jwt"])(
    "refuses the %s grant without contacting the provider",
    async (grantType) => {
      const response = await exchange({ connectorId: "bitbucket", grant_type: grantType, code: "abc", redirect_uri: SLACK_REDIRECT });
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    "https://attacker.example/callback",
    "https://pawos.revantaai.com.attacker.example/api/connectors/slack/callback",
    "https://pawos.revantaai.com/api/connectors/github/callback", // another connector's address
    "https://pawos.revantaai.com/api/connectors/slack/callback?next=https://attacker.example",
    "http://pawos.revantaai.com/api/connectors/slack/callback",
    "http://localhost:3000/callback",
    "javascript:alert(1)",
  ])("refuses to redeem a code for %s", async (redirectUri) => {
    const response = await exchange({ connectorId: "slack", grant_type: "authorization_code", code: "abc", redirect_uri: redirectUri });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses mixed or malformed requests", async () => {
    const cases = [
      { connectorId: "slack", grant_type: "authorization_code", redirect_uri: SLACK_REDIRECT }, // no code
      { connectorId: "slack", grant_type: "authorization_code", code: "abc" }, // no redirect
      { connectorId: "slack", grant_type: "authorization_code", code: "abc", redirect_uri: SLACK_REDIRECT, refresh_token: "x" },
      { connectorId: "slack", grant_type: "refresh_token" },
      { connectorId: "slack", grant_type: "refresh_token", refresh_token: "x", code: "abc" },
      { connectorId: "slack", grant_type: "refresh_token", refresh_token: { $ne: "" } },
      { connectorId: "slack", grant_type: "refresh_token", refresh_token: "x".repeat(5000) },
      { connectorId: "not-a-connector", grant_type: "refresh_token", refresh_token: "x" },
    ];
    for (const body of cases) {
      const response = await exchange(body);
      expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns only the token fields, never the provider's raw response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, access_token: "access", id_token: "id", authed_user: { access_token: "user-token" }, team: { id: "T1" } }), { status: 200 }));
    const response = await exchange({ connectorId: "slack", grant_type: "authorization_code", code: "abc", redirect_uri: SLACK_REDIRECT });
    expect(Object.keys(await response.json()).sort()).toEqual(["access_token"]);
  });
});

describe("POST /api/connectivity/oauth/exchange — PawOS session", () => {
  const withSession = (body: unknown, token: string) =>
    POST(
      new Request("https://pawos.revantaai.com/api/connectivity/oauth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
    );
  const refresh = { connectorId: "bitbucket", grant_type: "refresh_token", refresh_token: "old-refresh" };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.CONNECTIVITY_EXCHANGE_REQUIRE_SESSION;
    supabase.getUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("still serves PawOS Desktop 1.0.2, which sends no session", async () => {
    expect((await exchange(refresh)).status).toBe(200);
    expect(supabase.getUser).not.toHaveBeenCalled();
  });

  it("accepts a request with a valid session (PawOS Desktop 1.0.3 and later)", async () => {
    expect((await withSession(refresh, "good-token")).status).toBe(200);
    expect(supabase.getUser).toHaveBeenCalledWith("good-token");
  });

  it("refuses a request that presents an invalid or expired session, without contacting the provider", async () => {
    supabase.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT" } });
    expect((await withSession(refresh, "forged-token")).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses requests without a session once the requirement is switched on", async () => {
    process.env.CONNECTIVITY_EXCHANGE_REQUIRE_SESSION = "true";
    expect((await exchange(refresh)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await withSession(refresh, "good-token")).status).toBe(200);
  });
});

describe("isPawosRedirectUri", () => {
  it("accepts the addresses the apps use", () => {
    expect(isPawosRedirectUri("microsoft", "pawos://connectivity-oauth-callback")).toBe(true);
    expect(isPawosRedirectUri("googleWorkspace", "http://127.0.0.1:53124")).toBe(true);
    expect(isPawosRedirectUri("github", "https://pawos.revantaai.com/api/connectivity/oauth/callback/github")).toBe(true);
    expect(isPawosRedirectUri("bitbucket", "https://pawos.revantaai.com/api/connectors/bitbucket/oauth/callback")).toBe(true);
    expect(isPawosRedirectUri("gitlab", "https://pawos.revantaai.com/auth/gitlab/callback")).toBe(true);
    for (const id of ["jira", "linear", "slack", "vercel", "netlify", "railway"]) {
      expect(isPawosRedirectUri(id, `https://pawos.revantaai.com/api/connectors/${id}/callback`), id).toBe(true);
    }
  });

  it("refuses everything else", () => {
    expect(isPawosRedirectUri("slack", "https://pawos.revantaai.com/auth/gitlab/callback")).toBe(false);
    expect(isPawosRedirectUri("slack", "http://127.0.0.1")).toBe(false);
    expect(isPawosRedirectUri("slack", "http://127.0.0.1.attacker.example:8080")).toBe(false);
    expect(isPawosRedirectUri("slack", "pawos://something-else")).toBe(false);
    expect(isPawosRedirectUri("slack", "not a url")).toBe(false);
  });
});
