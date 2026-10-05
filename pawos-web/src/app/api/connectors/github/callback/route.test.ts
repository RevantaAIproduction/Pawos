import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../../../lib/account/testing/fakeBackend";
import type { AccountContext } from "../../../../../lib/account/accountContext";

/**
 * Connecting GitHub from PawOS Web — e.g. from a phone, where there is no desktop app to finish
 * the flow. Same connector OAuth app, scopes, callback URL and credential store as the desktop app;
 * desktop-started flows through the same callback are still relayed unchanged. GitHub is a fake
 * `fetch`; no real credentials.
 */
const state = vi.hoisted(() => ({ backend: null as unknown as FakeBackend, session: null as User | null, cookie: undefined as string | undefined }));

vi.mock("../../../../../lib/account/accountContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../../lib/account/accountContext")>();
  return {
    ...original,
    getAccountContext: async (): Promise<AccountContext | null> => (state.session ? original.resolveAccountContext(state.backend.client(state.session.id), state.session) : null),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (state.cookie ? { name, value: state.cookie } : undefined) }) }));

import { GET as callback } from "./route";
import { GET as legacyCallback } from "../../../connectivity/oauth/callback/[provider]/route";
import { POST as startConnect } from "../../../dashboard/integrations/[connectorId]/route";

const HOST = "pawos.revantaai.com";
// The callback the GitHub connector OAuth app is registered with (CONNECTOR_GITHUB_CALLBACK_URL);
// GitHub refuses any other redirect_uri ("The redirect_uri is not associated with this application").
const CALLBACK = `https://${HOST}/api/connectors/github/callback`;
const callbackRequest = (query: Record<string, string>) => new Request(`${CALLBACK}?${new URLSearchParams(query)}`, { headers: { host: HOST, "x-forwarded-proto": "https" } });
const startRequest = () => new Request(`https://${HOST}/api/dashboard/integrations/github`, { method: "POST", headers: { host: HOST, origin: `https://${HOST}` } });
const github = { params: Promise.resolve({ connectorId: "github" }) };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.CONNECTOR_GITHUB_CLIENT_ID = "gh-connector-id";
  process.env.CONNECTOR_GITHUB_CLIENT_SECRET = "gh-connector-secret";
  state.backend = new FakeBackend();
  state.cookie = undefined;
  state.session = state.backend.addUser("pro-user", { subscription: { active: true, tier: "pro" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") return new Response(JSON.stringify({ access_token: "gho_from_web", token_type: "bearer", scope: "repo,read:org" }), { status: 200 });
    if (url === "https://api.github.com/user") return new Response(JSON.stringify({ login: "octocat", name: "The Octocat" }), { status: 200 });
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.CONNECTOR_GITHUB_CLIENT_ID;
  delete process.env.CONNECTOR_GITHUB_CLIENT_SECRET;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function start(): Promise<{ state: string; authorizeUrl: URL }> {
  const response = await startConnect(startRequest(), github);
  expect(response.status).toBe(200);
  const authorizeUrl = new URL((await response.json()).connect.url);
  state.cookie = decodeURIComponent((response.headers.get("set-cookie") ?? "").split(";")[0].split("=").slice(1).join("="));
  return { state: authorizeUrl.searchParams.get("state") ?? "", authorizeUrl };
}

describe("connecting GitHub from PawOS Web", () => {
  it("uses the connector OAuth app, its scopes and the hosted callback — never a loopback", async () => {
    const { authorizeUrl, state: oauthState } = await start();
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("gh-connector-id");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(CALLBACK);
    expect(authorizeUrl.searchParams.get("scope")).toBe("repo read:org");
    expect(oauthState).toMatch(/^web\./);
    expect(authorizeUrl.toString()).not.toMatch(/gh-connector-secret|127\.0\.0\.1|localhost/);
  });

  it("stores the token in the shared credential store and the connection for both apps; the token never reaches the browser", async () => {
    const { state: oauthState } = await start();
    const response = await callback(callbackRequest({ code: "good-code", state: oauthState }));
    expect(response.headers.get("location")).toBe(`https://${HOST}/dashboard/integrations?integration=github&status=connected`);
    expect(response.headers.get("location")).not.toContain("gho_from_web");
    expect(state.backend.tables.connectivity_credentials).toEqual([expect.objectContaining({ user_id: "pro-user", connector_id: "github", secret: "gho_from_web" })]);
    expect(state.backend.tables.connectivity_connections).toEqual([
      expect.objectContaining({ connector_id: "github", status: "connected", granted_permissions: ["readRepositories", "readPullRequests", "readIssues"], metadata: { accountName: "The Octocat", username: "octocat" } }),
    ]);
  });

  it("rejects a forged state", async () => {
    await start();
    const forged = await callback(callbackRequest({ code: "good-code", state: "web.forged" }));
    expect(forged.headers.get("location")).toContain("status=expired");
    expect(state.backend.tables.connectivity_credentials).toHaveLength(0);
  });

  it("still relays desktop-started GitHub flows to the desktop app unchanged", async () => {
    const html = await (await callback(callbackRequest({ code: "desktop-code", state: "desktop-request-id" }))).text();
    expect(html).toContain("http://127.0.0.1:51900/callback?code=desktop-code&amp;state=desktop-request-id");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the old /api/connectivity/oauth/callback/github path still relays flows from installed desktop versions", async () => {
    const request = new Request(`https://${HOST}/api/connectivity/oauth/callback/github?code=desktop-code&state=desktop-request-id`, { headers: { host: HOST } });
    expect(await (await legacyCallback(request, { params: Promise.resolve({ provider: "github" }) })).text()).toContain("http://127.0.0.1:51900/callback?code=desktop-code&amp;state=desktop-request-id");
  });
});
