import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../../../../lib/account/testing/fakeBackend";
import type { AccountContext } from "../../../../../../lib/account/accountContext";

/**
 * Bitbucket Cloud OAuth: the web-started flow end to end (start → callback → vault), the desktop
 * relay path through the same callback URL, and the token-exchange endpoint the desktop app uses.
 * Bitbucket itself is a fake `fetch`; no real credentials.
 */
const state = vi.hoisted(() => ({ backend: null as unknown as FakeBackend, session: null as User | null, cookie: undefined as string | undefined }));

vi.mock("../../../../../../lib/account/accountContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../../../lib/account/accountContext")>();
  return {
    ...original,
    getAccountContext: async (): Promise<AccountContext | null> => (state.session ? original.resolveAccountContext(state.backend.client(state.session.id), state.session) : null),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (state.cookie ? { name, value: state.cookie } : undefined) }) }));

import { GET as callback } from "./route";
import { POST as startConnect } from "../../../../dashboard/integrations/[connectorId]/route";
import { POST as exchange } from "../../../../connectivity/oauth/exchange/route";

const HOST = "pawos.revantaai.com";
const CALLBACK = `https://${HOST}/api/connectors/bitbucket/oauth/callback`;
const callbackRequest = (query: Record<string, string>) => new Request(`${CALLBACK}?${new URLSearchParams(query)}`, { headers: { host: HOST, "x-forwarded-proto": "https" } });
const startRequest = () => new Request(`https://${HOST}/api/dashboard/integrations/bitbucket`, { method: "POST", headers: { host: HOST, origin: `https://${HOST}` } });
const bitbucket = { params: Promise.resolve({ connectorId: "bitbucket" }) };

let fetchMock: ReturnType<typeof vi.fn>;
let proUser: User;
let goUser: User;

beforeEach(() => {
  process.env.BITBUCKET_CLIENT_ID = "bb-key";
  process.env.BITBUCKET_CLIENT_SECRET = "bb-secret";
  state.backend = new FakeBackend();
  state.cookie = undefined;
  // Bitbucket is Team / Enterprise only: the connecting account is a Team member.
  proUser = state.backend.addUser("team-user");
  state.backend.joinOrganization("team-user", { id: "org-1", name: "Acme", tier: "team" }, "member");
  goUser = state.backend.addUser("go-user");
  state.session = proUser;
  vi.spyOn(console, "error").mockImplementation(() => {});

  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://bitbucket.org/site/oauth2/access_token") {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("code") === "bad-code") return new Response(JSON.stringify({ error: "invalid_grant", error_description: "The specified code is not valid." }), { status: 400 });
      return new Response(JSON.stringify({ access_token: "bb-access", refresh_token: "bb-refresh", expires_in: 7200, scopes: "account repository pullrequest:write", token_type: "bearer" }), { status: 200 });
    }
    if (url === "https://api.bitbucket.org/2.0/user") return new Response(JSON.stringify({ username: "octo", display_name: "Octo Cat" }), { status: 200 });
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.BITBUCKET_CLIENT_ID;
  delete process.env.BITBUCKET_CLIENT_SECRET;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Starts a web flow as the current session and returns the state Bitbucket would echo back. */
async function start(): Promise<{ state: string; authorizeUrl: URL }> {
  const response = await startConnect(startRequest(), bitbucket);
  expect(response.status).toBe(200);
  const body = await response.json();
  const authorizeUrl = new URL(body.connect.url);
  const setCookie = response.headers.get("set-cookie") ?? "";
  state.cookie = decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("="));
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/Path=\/api;/i);
  return { state: authorizeUrl.searchParams.get("state") ?? "", authorizeUrl };
}

describe("starting a Bitbucket connection from the web", () => {
  it("sends the browser to Bitbucket's authorize endpoint with the registered callback and a fresh state", async () => {
    const { authorizeUrl, state: oauthState } = await start();

    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe("https://bitbucket.org/site/oauth2/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("bb-key");
    expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(CALLBACK);
    expect(oauthState).toMatch(/^web\.[0-9a-f]{48}$/);
    expect(authorizeUrl.toString()).not.toContain("bb-secret");
  });

  it("is refused for a signed-out caller, a plan without Bitbucket, and a server with no consumer configured", async () => {
    state.session = null;
    expect((await startConnect(startRequest(), bitbucket)).status).toBe(401);

    state.session = goUser;
    expect((await startConnect(startRequest(), bitbucket)).status).toBe(403);

    // Pro and Pro Max don't include Bitbucket — only Team and Enterprise do.
    state.session = state.backend.addUser("pro-user", { subscription: { active: true, tier: "pro" } });
    expect((await startConnect(startRequest(), bitbucket)).status).toBe(403);
    state.session = state.backend.addUser("promax-user", { subscription: { active: true, tier: "proMax", proMaxVariant: "20x" } });
    expect((await startConnect(startRequest(), bitbucket)).status).toBe(403);
    state.session = state.backend.addUser("ent-user");
    state.backend.joinOrganization("ent-user", { id: "org-2", name: "Big", tier: "enterprise" }, "member");
    expect((await startConnect(startRequest(), bitbucket)).status).not.toBe(403);

    state.session = proUser;
    delete process.env.BITBUCKET_CLIENT_SECRET;
    expect((await startConnect(startRequest(), bitbucket)).status).toBe(503);
  });
});

describe("GET /api/connectors/bitbucket/oauth/callback — web flow", () => {
  it("exchanges the code, stores access and refresh tokens in the vault, and returns to Integrations", async () => {
    const { state: oauthState } = await start();
    const response = await callback(callbackRequest({ code: "good-code", state: oauthState }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://${HOST}/dashboard/integrations?integration=bitbucket&status=connected`);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://bitbucket.org/site/oauth2/access_token");
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("bb-key:bb-secret").toString("base64")}`);
    const sent = new URLSearchParams(String(tokenInit.body));
    expect(Object.fromEntries(sent)).toEqual({ grant_type: "authorization_code", code: "good-code", redirect_uri: CALLBACK });

    expect(state.backend.tables.connectivity_credentials).toEqual([
      expect.objectContaining({ user_id: "team-user", connector_id: "bitbucket", auth_method: "oauth2", secret: "bb-access", refresh_token: "bb-refresh", expires_at: expect.any(String) }),
    ]);
    expect(state.backend.tables.connectivity_connections).toEqual([
      expect.objectContaining({ user_id: "team-user", connector_id: "bitbucket", status: "connected", metadata: { accountName: "Octo Cat", username: "octo" } }),
    ]);
  });

  it("never puts a token in the redirect, and clears the state cookie", async () => {
    const { state: oauthState } = await start();
    const response = await callback(callbackRequest({ code: "good-code", state: oauthState }));

    expect(response.headers.get("location")).not.toMatch(/bb-access|bb-refresh|good-code/);
    expect(response.headers.get("set-cookie")).toMatch(/pawos_connector_oauth=;.*Max-Age=0/i);
  });

  it("reconnecting replaces the stored credential instead of adding a second one", async () => {
    for (let i = 0; i < 2; i++) {
      const { state: oauthState } = await start();
      await callback(callbackRequest({ code: "good-code", state: oauthState }));
    }
    expect(state.backend.tables.connectivity_credentials).toHaveLength(1);
    expect(state.backend.tables.connectivity_connections).toHaveLength(1);
  });

  it.each([
    ["Bitbucket reports an error", { error: "access_denied", error_description: "The user denied access" }, "denied"],
    ["the code is missing", {}, "failed"],
    ["Bitbucket rejects the code", { code: "bad-code" }, "failed"],
  ])("stores nothing and reports it when %s", async (_label, query, status) => {
    const { state: oauthState } = await start();
    const response = await callback(callbackRequest({ ...query, state: oauthState }));

    expect(response.headers.get("location")).toBe(`https://${HOST}/dashboard/integrations?integration=bitbucket&status=${status}`);
    expect(response.headers.get("location")).not.toContain("denied access"); // provider text is never echoed
    expect(state.backend.tables.connectivity_credentials).toHaveLength(0);
  });

  it("rejects a state this browser was never given (forged or replayed callback)", async () => {
    await start();
    const forged = await callback(callbackRequest({ code: "good-code", state: "web.attacker-chosen" }));
    expect(forged.headers.get("location")).toContain("status=expired");

    state.cookie = undefined; // no cookie at all
    const noCookie = await callback(callbackRequest({ code: "good-code", state: "web.anything" }));
    expect(noCookie.headers.get("location")).toContain("status=expired");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.backend.tables.connectivity_credentials).toHaveLength(0);
  });

  it("requires a signed-in session and the entitlement at callback time too", async () => {
    const { state: oauthState } = await start();
    state.session = null;
    expect((await callback(callbackRequest({ code: "good-code", state: oauthState }))).headers.get("location")).toBe(`https://${HOST}/login`);

    state.session = goUser; // same browser cookie, but an account without Bitbucket
    expect((await callback(callbackRequest({ code: "good-code", state: oauthState }))).headers.get("location")).toContain("status=not_entitled");
    expect(state.backend.tables.connectivity_credentials).toHaveLength(0);
  });
});

describe("GET /api/connectors/bitbucket/oauth/callback — desktop flow", () => {
  it("relays a desktop-started flow to the desktop app's local listener without exchanging anything", async () => {
    const response = await callback(callbackRequest({ code: "desktop-code", state: "0b5e2a4c-desktop-request-id" }));
    const html = await response.text();

    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("http://127.0.0.1:51900/callback?code=desktop-code&amp;state=0b5e2a4c-desktop-request-id");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.backend.tables.connectivity_credentials).toHaveLength(0);
  });

  it("relays a provider error for a desktop flow", async () => {
    const html = await (await callback(callbackRequest({ error: "access_denied", state: "desktop-id" }))).text();
    expect(html).toContain("Sign-in failed: access_denied");
  });
});

describe("POST /api/connectivity/oauth/exchange — Bitbucket (used by the desktop OAuthManager)", () => {
  const exchangeRequest = (body: unknown) => new Request(`https://${HOST}/api/connectivity/oauth/exchange`, { method: "POST", body: JSON.stringify(body) });

  it("exchanges a code with HTTP Basic client authentication and returns the tokens and expiry", async () => {
    const response = await exchange(exchangeRequest({ connectorId: "bitbucket", grant_type: "authorization_code", code: "good-code", redirect_uri: CALLBACK }));

    expect(await response.json()).toEqual({ access_token: "bb-access", refresh_token: "bb-refresh", expires_in: 7200, scope: "account repository pullrequest:write" });
    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(String(init.body)).not.toContain("client_secret");
  });

  it("refreshes with the refresh token", async () => {
    await exchange(exchangeRequest({ connectorId: "bitbucket", grant_type: "refresh_token", refresh_token: "bb-refresh" }));
    expect(Object.fromEntries(new URLSearchParams(String(fetchMock.mock.calls[0][1].body)))).toEqual({ grant_type: "refresh_token", refresh_token: "bb-refresh" });
  });

  it("other providers still send their client credentials in the body", async () => {
    process.env.GITLAB_CLIENT_ID = "gl-id";
    process.env.GITLAB_CLIENT_SECRET = "gl-secret";
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "gl" }), { status: 200 }));
    await exchange(exchangeRequest({ connectorId: "gitlab", grant_type: "authorization_code", code: "c", redirect_uri: "https://pawos.revantaai.com/auth/gitlab/callback" }));

    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(String(init.body)).toContain("client_secret=gl-secret");
    delete process.env.GITLAB_CLIENT_ID;
    delete process.env.GITLAB_CLIENT_SECRET;
  });
});
