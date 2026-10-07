import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { FakeBackend } from "./testing/fakeBackend";

/**
 * Signing in to the PawOS Web API with `Authorization: Bearer <Supabase access token>` — the way a
 * non-browser client of the same account (an editor extension) authenticates — next to the session
 * cookie PawOS Web itself uses. These tests run the real getAccountContext() and the real
 * createBearerClient(); only Supabase itself (the auth server and the database) and the incoming
 * request are stand-ins.
 */
const state = vi.hoisted(() => ({
  backend: null as unknown as FakeBackend,
  /** The incoming request's headers. */
  headers: {} as Record<string, string>,
  /** The user the session cookie belongs to, if the request has one. */
  cookieUser: null as User | null,
  /** Supabase's auth server: which user each genuine access token belongs to. */
  tokens: new Map<string, User>(),
  /** Every bearer client created: what it was built with. */
  bearerClients: [] as { url: string; key: string; options: { auth?: Record<string, unknown>; global?: { headers?: Record<string, string> } } }[],
  cookieClientsCreated: 0,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(state.headers),
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

// The bearer client, as supabase-js builds it: its database calls carry the Authorization header
// it was created with, so the database sees that token's user (or nobody, for a token Supabase
// doesn't recognise) — never a user named anywhere else in the request.
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: { auth?: Record<string, unknown>; global?: { headers?: Record<string, string> } }) => {
    state.bearerClients.push({ url, key, options });
    const sent = (options.global?.headers?.Authorization ?? "").replace(/^Bearer /, "");
    const owner = state.tokens.get(sent) ?? null;
    return {
      ...state.backend.client(owner?.id ?? null),
      auth: { getUser: async (jwt?: string) => ({ data: { user: (jwt ? state.tokens.get(jwt) : owner) ?? null }, error: null }) },
    } as unknown as SupabaseClient;
  },
}));

// The cookie client: unchanged code path, with the session cookie's user.
vi.mock("../supabase/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("../supabase/server")>();
  return {
    ...original,
    createClient: async () => {
      state.cookieClientsCreated += 1;
      return {
        ...state.backend.client(state.cookieUser?.id ?? null),
        auth: { getUser: async () => ({ data: { user: state.cookieUser }, error: null }) },
      } as unknown as SupabaseClient;
    },
  };
});

import { bearerTokenFrom, getAccountContext } from "./accountContext";
import { requireAccount } from "./api";
import { GET as getCapabilities } from "../../app/api/web/capabilities/route";
import { GET as getRepository } from "../../app/api/web/github/repository/route";

const user = (id: string, email: string): User => ({ id, email, user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" }) as User;
const ALICE = user("11111111-1111-4111-8111-111111111111", "alice@example.com");
const BOB = user("22222222-2222-4222-8222-222222222222", "bob@example.com");
// Shaped like Supabase access tokens (three base64url segments); the values mean nothing.
const ALICE_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.c2lnbmF0dXJlLWFsaWNl";
const BOB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJib2IifQ.c2lnbmF0dXJlLWJvYg";
const UNKNOWN_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub2JvZHkifQ.bm90LWEtcmVhbC1zaWduYXR1cmU";

beforeEach(() => {
  state.backend = new FakeBackend();
  state.backend.users.set(ALICE.id, { email: ALICE.email, subscription: { active: true, tier: "pro" } });
  state.backend.users.set(BOB.id, { email: BOB.email });
  state.headers = {};
  state.cookieUser = null;
  state.tokens = new Map([
    [ALICE_TOKEN, ALICE],
    [BOB_TOKEN, BOB],
  ]);
  state.bearerClients = [];
  state.cookieClientsCreated = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-public-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("the session cookie (PawOS Web) still signs a request in, unchanged", () => {
  it("resolves the cookie's account and never builds a bearer client", async () => {
    state.cookieUser = ALICE;
    const account = await getAccountContext();
    expect(account?.user.id).toBe(ALICE.id);
    expect(account?.tier).toBe("pro");
    expect(state.cookieClientsCreated).toBe(1);
    expect(state.bearerClients).toHaveLength(0);
  });

  it("a request with neither a cookie session nor an Authorization header is signed out (401)", async () => {
    expect(await getAccountContext()).toBeNull();
    const guard = await requireAccount();
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(401);
      expect(await guard.response.json()).toEqual({ ok: false, code: "not_authenticated", message: "Sign in to continue." });
    }
  });
});

describe("Authorization: Bearer <Supabase access token>", () => {
  it("signs in the token's own user, with the same account the cookie session resolves to", async () => {
    state.cookieUser = ALICE;
    const viaCookie = await getAccountContext();

    state.cookieUser = null;
    state.headers = bearer(ALICE_TOKEN);
    const viaBearer = await getAccountContext();

    expect(viaBearer?.user.id).toBe(ALICE.id);
    const comparable = (account: typeof viaBearer) => account && { ...account, supabase: undefined };
    expect(comparable(viaBearer)).toEqual(comparable(viaCookie));
    expect(state.cookieClientsCreated).toBe(1); // the bearer request never touched the cookie client
  });

  it("builds its database client from the public anon key and that token only — no service role, nothing persisted", async () => {
    state.headers = bearer(ALICE_TOKEN);
    await getAccountContext();
    expect(state.bearerClients).toHaveLength(1);
    const [{ url, key, options }] = state.bearerClients;
    expect(url).toBe("https://project.supabase.test");
    expect(key).toBe("anon-public-key");
    expect(options.global?.headers).toEqual({ Authorization: `Bearer ${ALICE_TOKEN}` });
    expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    expect(JSON.stringify(state.bearerClients)).not.toContain("service-role-secret");
  });

  it("rejects a token Supabase doesn't recognise (401), even when a valid session cookie came with it", async () => {
    state.cookieUser = ALICE;
    state.headers = bearer(UNKNOWN_TOKEN);
    expect(await getAccountContext()).toBeNull();
    const guard = await requireAccount();
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
    expect(state.cookieClientsCreated).toBe(0); // no fallback to the cookie
  });

  it.each([
    ["no scheme", ALICE_TOKEN],
    ["Basic scheme", `Basic ${ALICE_TOKEN}`],
    ["lower-case scheme", `bearer ${ALICE_TOKEN}`],
    ["Bearer with no token", "Bearer"],
    ["Bearer with an empty token", "Bearer "],
    ["two spaces", `Bearer  ${ALICE_TOKEN}`],
    ["two tokens", `Bearer ${ALICE_TOKEN} ${BOB_TOKEN}`],
    ["two credentials", `Bearer ${ALICE_TOKEN}, Bearer ${BOB_TOKEN}`],
    ["a token that isn't a JWT", "Bearer not-a-jwt"],
    ["a JWT with a missing segment", "Bearer aaa.bbb"],
    ["characters outside base64url", "Bearer aaa.b+b/b=.ccc"],
    ["an empty header", ""],
    ["an oversized header", `Bearer ${"a".repeat(9000)}.b.c`],
  ])("rejects a malformed Authorization header: %s", async (_name, authorization) => {
    state.cookieUser = ALICE; // a cookie must not rescue a malformed header
    state.headers = { authorization };
    expect(bearerTokenFrom(authorization)).toBeNull();
    expect(await getAccountContext()).toBeNull();
    const guard = await requireAccount();
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
    // Nothing was asked of Supabase with it, and the cookie was not consulted.
    expect(state.bearerClients).toHaveLength(0);
    expect(state.cookieClientsCreated).toBe(0);
  });

  it("accepts exactly `Bearer <token>` and nothing around it", () => {
    expect(bearerTokenFrom(`Bearer ${ALICE_TOKEN}`)).toBe(ALICE_TOKEN);
    // HTTP itself strips whitespace around a header value, so these never arrive; refused anyway.
    expect(bearerTokenFrom(`Bearer ${ALICE_TOKEN} `)).toBeNull();
    expect(bearerTokenFrom(` Bearer ${ALICE_TOKEN}`)).toBeNull();
    expect(bearerTokenFrom(`Bearer ${ALICE_TOKEN}\n`)).toBeNull();
  });

  it("cannot be pointed at another account: only the verified token decides who the request is", async () => {
    // Bob's genuine token, with everything else in the request claiming to be Alice.
    state.cookieUser = ALICE;
    state.headers = { ...bearer(BOB_TOKEN), "x-user-id": ALICE.id, "x-pawos-user": ALICE.id, cookie: `user_id=${ALICE.id}` };
    const account = await getAccountContext();
    expect(account?.user.id).toBe(BOB.id);
    expect(account?.tier).toBe("go"); // Bob's plan, not Alice's Pro

    // And the database client it carries is Bob's: Alice's rows are not his to read.
    state.backend.tables.web_chats.push({ id: "chat-alice", user_id: ALICE.id, title: "Alice's chat", updated_at: "2026-10-01T00:00:00Z" });
    const { data } = await account!.supabase.from("web_chats").select("id").eq("user_id", ALICE.id);
    expect(data ?? []).toEqual([]);
  });

  it("never writes the token to the log", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    state.headers = bearer(ALICE_TOKEN);
    await getAccountContext();
    state.headers = bearer(UNKNOWN_TOKEN);
    await getAccountContext();
    state.headers = { authorization: `Basic ${ALICE_TOKEN}` };
    await getAccountContext();
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    for (const token of [ALICE_TOKEN, UNKNOWN_TOKEN]) expect(logged).not.toContain(token);
    for (const spy of spies) spy.mockRestore();
  });
});

describe("GET /api/web/capabilities with a bearer token", () => {
  it("returns exactly what the same account gets through its PawOS Web session", async () => {
    state.cookieUser = ALICE;
    const viaCookie = await getCapabilities();
    expect(viaCookie.status).toBe(200);
    const cookieBody = await viaCookie.json();

    state.cookieUser = null;
    state.headers = bearer(ALICE_TOKEN);
    const viaBearer = await getCapabilities();
    expect(viaBearer.status).toBe(200);
    const bearerBody = await viaBearer.json();

    expect(bearerBody).toEqual(cookieBody);
    expect(bearerBody.ok).toBe(true);
    expect(bearerBody.plan).toEqual({ tier: "pro", label: "Paw Pro" });
    expect(bearerBody.capabilities.find((c: { id: string }) => c.id === "web.codeChanges").status).toBe("available");
    expect(bearerBody.capabilities.find((c: { id: string }) => c.id === "web.fileUpload").status).toBe("available");
  });

  it("answers for the token's account, plan and limits — a different token is a different account", async () => {
    state.headers = bearer(BOB_TOKEN);
    const body = await (await getCapabilities()).json();
    expect(body.plan.tier).toBe("go");
    expect(body.limits.webMessageLimit).toBe(4);
    expect(body.capabilities.find((c: { id: string }) => c.id === "web.fileUpload").status).toBe("locked");
  });

  it("is 401 without a token, with an unknown token and with a malformed header", async () => {
    for (const headers of [{}, bearer(UNKNOWN_TOKEN), { authorization: `Token ${ALICE_TOKEN}` }]) {
      state.headers = headers;
      const response = await getCapabilities();
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe("not_authenticated");
    }
  });
});

describe("the other Web routes see the same account through a bearer token", () => {
  it("GET /api/web/github/repository reports the token account's own readiness", async () => {
    state.headers = bearer(ALICE_TOKEN);
    const response = await getRepository();
    expect(response.status).toBe(200);
    expect((await response.json()).readiness).toEqual({ state: "githubNotConnected" });

    state.backend.addConnection(ALICE.id, "github");
    expect((await (await getRepository()).json()).readiness).toEqual({ state: "noRepository" });

    // Bob has no GitHub connection of his own; Alice's is not his.
    state.headers = bearer(BOB_TOKEN);
    expect((await (await getRepository()).json()).readiness).toEqual({ state: "githubNotConnected" });
  });
});
