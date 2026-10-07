import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing a PawOS client (CLI, VS Code) in through the browser: the one-time code, its exchange for
 * a session, and renewing / ending that session. Supabase is a stand-in throughout.
 */
const state = vi.hoisted(() => ({
  cookieUserId: null as string | null,
  users: new Map<string, { email: string | null }>(),
  generated: [] as { type: string; email: string }[],
  verified: [] as { token_hash: string; type: string }[],
  /** Which account Supabase's one-time link signs in — normally the one it was generated for. */
  verifyAs: null as string | null,
  anonClients: [] as { url: string; key: string }[],
}));

vi.mock("../supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.cookieUserId ? { id: state.cookieUserId, email: state.users.get(state.cookieUserId)?.email } : null } }) } }),
}));

vi.mock("../supabase/server-admin", () => ({
  createSupabaseClient: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const user = state.users.get(id);
          return user ? { data: { user: { id, email: user.email } }, error: null } : { data: { user: null }, error: { message: "not found" } };
        },
        generateLink: async (input: { type: string; email: string }) => {
          state.generated.push(input);
          return { data: { properties: { hashed_token: `hash-for-${input.email}` } }, error: null };
        },
      },
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string) => {
    state.anonClients.push({ url, key });
    return {
      auth: {
        verifyOtp: async (input: { token_hash: string; type: string }) => {
          state.verified.push(input);
          const email = input.token_hash.replace("hash-for-", "");
          const id = state.verifyAs ?? [...state.users].find(([, user]) => user.email === email)?.[0] ?? "nobody";
          return { data: { session: { access_token: `access-of-${id}`, refresh_token: `refresh-of-${id}`, expires_at: 1_900_000_000, expires_in: 3600, user: { id, email } } }, error: null };
        },
      },
    };
  },
}));

import { DEVICE_CODE_TTL_MS, allowExchangeAttempt, consumeDeviceCode, issueDeviceCode, normaliseDeviceCode, resetDeviceAuthForTests } from "./deviceAuth";
import { POST as authorize } from "../../app/api/auth/device/authorize/route";
import { POST as exchange } from "../../app/api/auth/device/exchange/route";
import { POST as refresh } from "../../app/api/auth/device/refresh/route";
import { POST as logout } from "../../app/api/auth/device/logout/route";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const VERIFIER = "v".repeat(64);
const OTHER_VERIFIER = "w".repeat(64);
const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const CHALLENGE = challengeOf(VERIFIER);
const NOW = 1_800_000_000_000;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://pawos.test${path}`, { method: "POST", headers: { "Content-Type": "application/json", host: "pawos.test", ...headers }, body: JSON.stringify(body) });
const fromBrowser = { origin: "https://pawos.test" };

beforeEach(() => {
  resetDeviceAuthForTests();
  state.cookieUserId = null;
  state.users = new Map([
    [ALICE, { email: "alice@example.com" }],
    [BOB, { email: "bob@example.com" }],
  ]);
  state.generated = [];
  state.verified = [];
  state.verifyAs = null;
  state.anonClients = [];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-public-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("one-time code handling", () => {
  it("is short, readable, and carries nothing about the account or a session", () => {
    const { code, expiresInSeconds } = issueDeviceCode(ALICE, CHALLENGE, "cli", NOW);
    expect(code).toMatch(/^PAWOS-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(expiresInSeconds).toBe(300);
    expect(code).not.toContain(ALICE.slice(0, 8));
    expect(issueDeviceCode(ALICE, CHALLENGE, "cli", NOW).code).not.toBe(code);
  });

  it("works once, for the client that holds the verifier", () => {
    const { code } = issueDeviceCode(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceCode(code, VERIFIER, NOW + 1000)).toEqual({ ok: true, userId: ALICE, client: "cli" });
    expect(consumeDeviceCode(code, VERIFIER, NOW + 2000)).toEqual({ ok: false, reason: "invalid" }); // already used
  });

  it("is accepted however it is typed", () => {
    const { code } = issueDeviceCode(ALICE, CHALLENGE, "vscode", NOW);
    const compact = code.replace(/^PAWOS-/, "").replace("-", "");
    expect(normaliseDeviceCode(code)).toBe(compact);
    expect(normaliseDeviceCode(`  ${code.toLowerCase()} `)).toBe(compact);
    expect(normaliseDeviceCode(compact)).toBe(compact);
    expect(normaliseDeviceCode(`${compact.slice(0, 4)} ${compact.slice(4)}`)).toBe(compact);
    expect(consumeDeviceCode(code.toLowerCase(), VERIFIER, NOW)).toMatchObject({ ok: true, client: "vscode" });
  });

  it("expired code: refused, and said to be expired", () => {
    const { code } = issueDeviceCode(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceCode(code, VERIFIER, NOW + DEVICE_CODE_TTL_MS)).toEqual({ ok: false, reason: "expired" });
    expect(consumeDeviceCode(code, VERIFIER, NOW)).toEqual({ ok: false, reason: "invalid" }); // and gone
  });

  it.each([["PAWOS-AAAA-AAAA"], ["PAWOS-0000-1111"], ["not a code"], [""], [null], [12345678], ["PAWOS-AAAA-AAAA-AAAA"]])("invalid code: %s", (code) => {
    issueDeviceCode(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceCode(code, VERIFIER, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("a code is useless without the verifier, and trying one uses the code up", () => {
    const { code } = issueDeviceCode(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceCode(code, OTHER_VERIFIER, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(consumeDeviceCode(code, VERIFIER, NOW)).toEqual({ ok: false, reason: "invalid" }); // burned by the wrong attempt
    const second = issueDeviceCode(ALICE, CHALLENGE, "cli", NOW).code;
    for (const verifier of ["", "short", null, 1, "has spaces ".repeat(6)]) expect(consumeDeviceCode(second, verifier, NOW).ok).toBe(false);
  });

  it("an account holds only a few pending codes; asking again retires the oldest", () => {
    const codes = Array.from({ length: 6 }, (_, index) => issueDeviceCode(ALICE, CHALLENGE, "cli", NOW + index).code);
    const bob = issueDeviceCode(BOB, CHALLENGE, "cli", NOW).code;
    expect(consumeDeviceCode(codes[0], VERIFIER, NOW + 10).ok).toBe(false);
    expect(consumeDeviceCode(codes[5], VERIFIER, NOW + 10)).toMatchObject({ ok: true, userId: ALICE });
    expect(consumeDeviceCode(bob, VERIFIER, NOW + 10)).toMatchObject({ ok: true, userId: BOB });
  });

  it("limits exchange attempts per caller", () => {
    for (let attempt = 0; attempt < 10; attempt++) expect(allowExchangeAttempt("203.0.113.9", NOW)).toBe(true);
    expect(allowExchangeAttempt("203.0.113.9", NOW)).toBe(false);
    expect(allowExchangeAttempt("203.0.113.10", NOW)).toBe(true);
    expect(allowExchangeAttempt("203.0.113.9", NOW + 61_000)).toBe(true);
  });
});

describe("POST /api/auth/device/authorize (the browser's Authorize button)", () => {
  it("gives a signed-in browser user a code", async () => {
    state.cookieUserId = ALICE;
    const response = await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, fromBrowser));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, expiresInSeconds: 300 });
    expect(consumeDeviceCode(body.code, VERIFIER)).toEqual({ ok: true, userId: ALICE, client: "cli" });
  });

  it("needs a PawOS Web session", async () => {
    const response = await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, fromBrowser));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("not_authenticated");
  });

  it("refuses a client that already holds a session: a bearer token cannot sign in more clients", async () => {
    state.cookieUserId = ALICE;
    const response = await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, { ...fromBrowser, authorization: "Bearer aaa.bbb.ccc" }));
    expect(response.status).toBe(403);
  });

  it.each([
    ["another site", { origin: "https://evil.example" }],
    ["no Origin at all (not a browser page)", {}],
    ["a malformed Origin", { origin: "null" }],
  ])("refuses a request that didn't come from a PawOS page: %s", async (_name, headers) => {
    state.cookieUserId = ALICE;
    const response = await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, headers));
    expect(response.status).toBe(403);
  });

  it.each([
    [{ challenge: "too-short", client: "cli" }],
    [{ challenge: CHALLENGE, client: "desktop" }],
    [{ challenge: CHALLENGE }],
    [{}],
  ])("refuses a request that isn't a real sign-in link: %j", async (body) => {
    state.cookieUserId = ALICE;
    expect((await authorize(post("/api/auth/device/authorize", body, fromBrowser))).status).toBe(400);
  });
});

describe("POST /api/auth/device/exchange (the client's paste)", () => {
  const signIn = async (userId: string, client: "cli" | "vscode" = "cli") => {
    state.cookieUserId = userId;
    const body = await (await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client }, fromBrowser))).json();
    state.cookieUserId = null;
    return body.code as string;
  };

  it("successful exchange: a session of its own for the account that confirmed, and nobody else's", async () => {
    const code = await signIn(ALICE);
    const response = await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, session: { accessToken: `access-of-${ALICE}`, refreshToken: `refresh-of-${ALICE}`, expiresAt: 1_900_000_000, email: "alice@example.com" } });
    expect(state.generated).toEqual([{ type: "magiclink", email: "alice@example.com" }]);
    expect(state.verified).toEqual([{ token_hash: "hash-for-alice@example.com", type: "magiclink" }]);
    // The session is redeemed with the public key; the service-role key never reaches that client.
    expect(state.anonClients).toEqual([{ url: "https://project.supabase.test", key: "anon-public-key" }]);
  });

  it("the code itself is not a token, and the response never contains the service-role key", async () => {
    const code = await signIn(ALICE);
    const text = await (await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }))).text();
    expect(text).not.toContain("service-role-secret");
    expect(text).not.toContain(code);
  });

  it("is single-use: the same code cannot be exchanged twice", async () => {
    const code = await signIn(ALICE);
    expect((await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }))).status).toBe(200);
    const again = await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }));
    expect(again.status).toBe(400);
    expect((await again.json()).code).toBe("invalid_code");
    expect(state.generated).toHaveLength(1);
  });

  it("invalid code, wrong verifier and missing fields mint nothing", async () => {
    const code = await signIn(ALICE);
    for (const body of [{ code: "PAWOS-ZZZZ-ZZZZ", verifier: VERIFIER }, { code, verifier: OTHER_VERIFIER }, { code }, {}, null]) {
      const response = await exchange(post("/api/auth/device/exchange", body));
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_code");
    }
    expect(state.generated).toHaveLength(0);
  });

  it("expired code", async () => {
    const code = await signIn(ALICE);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + DEVICE_CODE_TTL_MS + 1000);
    const response = await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "code_expired", message: "That code has expired. Start sign-in again." });
  });

  it("never returns a session for a different account than the code named", async () => {
    const code = await signIn(ALICE);
    state.verifyAs = BOB; // Supabase answers with someone else's session
    const response = await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("access-of-");
  });

  it("an account without an email address is told so", async () => {
    state.users.set(ALICE, { email: null });
    const code = await signIn(ALICE);
    const response = await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("account_unavailable");
  });

  it("slows down a caller guessing codes", async () => {
    const headers = { "x-forwarded-for": "198.51.100.7" };
    for (let attempt = 0; attempt < 10; attempt++) expect((await exchange(post("/api/auth/device/exchange", { code: "PAWOS-AAAA-AAAA", verifier: VERIFIER }, headers))).status).toBe(400);
    expect((await exchange(post("/api/auth/device/exchange", { code: "PAWOS-AAAA-AAAA", verifier: VERIFIER }, headers))).status).toBe(429);
  });

  it("no token logging: nothing secret reaches the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const code = await signIn(ALICE);
    await exchange(post("/api/auth/device/exchange", { code, verifier: VERIFIER }));
    const failing = await signIn(ALICE);
    state.verifyAs = BOB;
    await exchange(post("/api/auth/device/exchange", { code: failing, verifier: VERIFIER }));
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    for (const secret of [code, failing, VERIFIER, "access-of-", "refresh-of-", "service-role-secret", "hash-for-"]) expect(logged).not.toContain(secret);
  });
});

describe("POST /api/auth/device/refresh (token refresh)", () => {
  const supabaseAnswers = (status: number, body: unknown) => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    });
    return calls;
  };

  it("renews the session through Supabase with the public key", async () => {
    const calls = supabaseAnswers(200, { access_token: "access-2", refresh_token: "refresh-2", expires_at: 1_900_000_500, user: { email: "alice@example.com" } });
    const response = await refresh(post("/api/auth/device/refresh", { refreshToken: "refresh-1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, session: { accessToken: "access-2", refreshToken: "refresh-2", expiresAt: 1_900_000_500, email: "alice@example.com" } });
    expect(calls[0].url).toBe("https://project.supabase.test/auth/v1/token?grant_type=refresh_token");
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe("anon-public-key");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refresh_token: "refresh-1" });
    expect(JSON.stringify(calls)).not.toContain("service-role-secret");
  });

  it("a refresh token Supabase won't renew is a 401 the client understands as signed out", async () => {
    supabaseAnswers(400, { error: "invalid_grant" });
    const response = await refresh(post("/api/auth/device/refresh", { refreshToken: "revoked" }));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("session_expired");
  });

  it("Supabase being down is not the session ending", async () => {
    supabaseAnswers(503, {});
    const response = await refresh(post("/api/auth/device/refresh", { refreshToken: "refresh-1" }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("unavailable");
  });

  it("no refresh token, no call", async () => {
    const calls = supabaseAnswers(200, {});
    expect((await refresh(post("/api/auth/device/refresh", {}))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe("POST /api/auth/device/logout", () => {
  it("ends only the session whose token it was sent", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    });
    const response = await logout(post("/api/auth/device/logout", {}, { authorization: "Bearer aaa.bbb.ccc" }));
    expect(await response.json()).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://project.supabase.test/auth/v1/logout?scope=local");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer aaa.bbb.ccc");
  });

  it("is harmless without a token", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", async () => {
      calls.push(1);
      return new Response(null, { status: 204 });
    });
    expect((await (await logout(post("/api/auth/device/logout", {}))).json()).ok).toBe(true);
    expect((await (await logout(post("/api/auth/device/logout", {}, { authorization: "Basic abc" }))).json()).ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
