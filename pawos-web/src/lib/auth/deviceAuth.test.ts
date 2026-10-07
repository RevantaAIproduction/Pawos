import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing a PawOS client (CLI, VS Code) in through the browser: the one-time handoff and the
 * completion address that carries it, its exchange for a session, and renewing / ending that
 * session. Supabase is a stand-in throughout.
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

import { DEVICE_HANDOFF_TTL_MS, allowExchangeAttempt, consumeDeviceHandoff, issueDeviceHandoff, resetDeviceAuthForTests } from "./deviceAuth";
import { DEVICE_COMPLETION_PATH, deviceAuthLoginPath, deviceAuthPath, deviceCompletionUrl } from "./deviceAuthLinks";
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
const UNKNOWN_HANDOFF = "Z".repeat(43);

const post = (route: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://pawos.test${route}`, { method: "POST", headers: { "Content-Type": "application/json", host: "pawos.test", ...headers }, body: JSON.stringify(body) });
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

describe("the one-time handoff", () => {
  it("is random, unguessable, and carries nothing about the account or a session", () => {
    const { handoff, expiresInSeconds } = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW);
    expect(handoff).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits
    expect(expiresInSeconds).toBe(300);
    expect(handoff).not.toContain(ALICE.slice(0, 8));
    expect(handoff).not.toContain(CHALLENGE);
    expect(issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW).handoff).not.toBe(handoff);
  });

  it("works once, for the client that holds the verifier", () => {
    const { handoff } = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceHandoff(handoff, VERIFIER, "cli", NOW + 1000)).toEqual({ ok: true, userId: ALICE, client: "cli" });
    expect(consumeDeviceHandoff(handoff, VERIFIER, "cli", NOW + 2000)).toEqual({ ok: false, reason: "invalid" }); // already used
  });

  it("is short-lived: after five minutes it is refused, and said to be expired", () => {
    expect(DEVICE_HANDOFF_TTL_MS).toBe(5 * 60 * 1000);
    const { handoff } = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceHandoff(handoff, VERIFIER, "cli", NOW + DEVICE_HANDOFF_TTL_MS)).toEqual({ ok: false, reason: "expired" });
    expect(consumeDeviceHandoff(handoff, VERIFIER, "cli", NOW)).toEqual({ ok: false, reason: "invalid" }); // and gone
  });

  it.each([[UNKNOWN_HANDOFF], ["PAWOS-8F4K-92KD"], ["not a handoff"], [""], [null], [12345678], [`${"a".repeat(43)}extra`], [["a".repeat(43)]]])("an unknown or malformed handoff is refused: %s", (handoff) => {
    issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceHandoff(handoff, VERIFIER, "cli", NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("is bound to the original sign-in request: without that client's verifier it is useless, and trying uses it up", () => {
    const { handoff } = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW);
    expect(consumeDeviceHandoff(handoff, OTHER_VERIFIER, "cli", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(consumeDeviceHandoff(handoff, VERIFIER, "cli", NOW)).toEqual({ ok: false, reason: "invalid" }); // burned by the wrong attempt
    for (const verifier of ["", "short", null, 1, "has spaces ".repeat(6)]) {
      const fresh = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW).handoff;
      expect(consumeDeviceHandoff(fresh, verifier, "cli", NOW).ok).toBe(false);
    }
  });

  it("is bound to the intended client: a handoff issued for the CLI is refused from anything else", () => {
    const forCli = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW).handoff;
    expect(consumeDeviceHandoff(forCli, VERIFIER, "vscode", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(consumeDeviceHandoff(forCli, VERIFIER, "cli", NOW)).toEqual({ ok: false, reason: "invalid" }); // and used up
    for (const client of [undefined, null, "", "desktop", "CLI"]) {
      const fresh = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW).handoff;
      expect(consumeDeviceHandoff(fresh, VERIFIER, client, NOW).ok).toBe(false);
    }
    const forVsCode = issueDeviceHandoff(ALICE, CHALLENGE, "vscode", NOW).handoff;
    expect(consumeDeviceHandoff(forVsCode, VERIFIER, "vscode", NOW)).toEqual({ ok: true, userId: ALICE, client: "vscode" });
  });

  it("an account holds only a few pending handoffs; asking again retires the oldest", () => {
    const handoffs = Array.from({ length: 6 }, (_, index) => issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW + index).handoff);
    const bob = issueDeviceHandoff(BOB, CHALLENGE, "cli", NOW).handoff;
    expect(consumeDeviceHandoff(handoffs[0], VERIFIER, "cli", NOW + 10).ok).toBe(false);
    expect(consumeDeviceHandoff(handoffs[5], VERIFIER, "cli", NOW + 10)).toMatchObject({ ok: true, userId: ALICE });
    expect(consumeDeviceHandoff(bob, VERIFIER, "cli", NOW + 10)).toMatchObject({ ok: true, userId: BOB });
  });

  it("limits exchange attempts per caller", () => {
    for (let attempt = 0; attempt < 10; attempt++) expect(allowExchangeAttempt("203.0.113.9", NOW)).toBe(true);
    expect(allowExchangeAttempt("203.0.113.9", NOW)).toBe(false);
    expect(allowExchangeAttempt("203.0.113.10", NOW)).toBe(true);
    expect(allowExchangeAttempt("203.0.113.9", NOW + 61_000)).toBe(true);
  });
});

describe("the completion address shown in the browser", () => {
  const deviceDir = path.join(__dirname, "..", "..", "app", "auth", "device");
  const component = fs.readFileSync(path.join(deviceDir, "DeviceAuthorize.tsx"), "utf8");
  const completePage = fs.readFileSync(path.join(deviceDir, "complete", "page.tsx"), "utf8");

  it("is <PawOS>/auth/device/complete?handoff=… and contains only the handoff", () => {
    const { handoff } = issueDeviceHandoff(ALICE, CHALLENGE, "cli", NOW);
    const url = new URL(deviceCompletionUrl("https://pawos.revantaai.com", handoff));
    expect(url.origin).toBe("https://pawos.revantaai.com");
    expect(url.pathname).toBe("/auth/device/complete");
    expect(DEVICE_COMPLETION_PATH).toBe("/auth/device/complete");
    expect([...url.searchParams.keys()]).toEqual(["handoff"]);
    expect(url.searchParams.get("handoff")).toBe(handoff);
    expect(url.hash).toBe("");
    expect(deviceCompletionUrl("https://pawos.revantaai.com/", handoff)).toBe(url.toString());
  });

  it("never carries a token, a key, the challenge or the verifier", async () => {
    state.cookieUserId = ALICE;
    const body = await (await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, fromBrowser))).json();
    const url = deviceCompletionUrl("https://pawos.revantaai.com", body.handoff);
    for (const secret of [CHALLENGE, VERIFIER, "access-of-", "refresh-of-", "service-role-secret", "anon-public-key", ALICE, "alice@example.com"]) expect(url).not.toContain(secret);
    // What Authorize returns is the handoff and its lifetime: no session, no account data.
    expect(Object.keys(body).sort()).toEqual(["expiresInSeconds", "handoff", "ok"]);
  });

  it("the page shows the address and a Copy URL button — the raw handoff is never shown on its own, and no code is", () => {
    expect(component).toContain("Authentication successful");
    expect(component).toContain("Return to {clientLabel}.");
    expect(component).toContain("Copy this URL");
    expect(component).toContain('"Copy URL"');
    expect(component).toContain("setCompletionUrl(deviceCompletionUrl(window.location.origin, data.handoff))");
    expect(component).toContain("navigator.clipboard.writeText(completionUrl)");
    expect(component).not.toMatch(/Copy Code|authentication code|data\.code|PAWOS-/);
    // The handoff goes into the address and nowhere else: not storage, not a cookie, not the page's own URL.
    expect(component).not.toMatch(/localStorage|sessionStorage|document\.cookie|history\.(push|replace)State|console\./);
  });

  it("opening the address in a browser does nothing: the page there never reads or uses the handoff", () => {
    const code = completePage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // the page's code, without its comments
    expect(code).toContain("export default function DeviceAuthCompletePage()"); // takes no props: no search params
    expect(code).not.toMatch(/searchParams|handoff|fetch\(|"use client"/);
    expect(completePage).toContain('referrer: "no-referrer"');
  });
});

describe("POST /api/auth/device/authorize (the browser's Authorize button)", () => {
  it("gives a signed-in browser user a handoff", async () => {
    state.cookieUserId = ALICE;
    const response = await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, fromBrowser));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, expiresInSeconds: 300 });
    expect(consumeDeviceHandoff(body.handoff, VERIFIER, "cli")).toEqual({ ok: true, userId: ALICE, client: "cli" });
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

/** A signed-in browser user clicks Authorize; returns the handoff the page would put in the completion address. */
async function signIn(userId: string, client: "cli" | "vscode" = "cli"): Promise<string> {
  state.cookieUserId = userId;
  const body = await (await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client }, fromBrowser))).json();
  state.cookieUserId = null;
  return body.handoff as string;
}

describe("Use a different account", () => {
  const deviceDir = path.join(__dirname, "..", "..", "app", "auth", "device");
  const component = fs.readFileSync(path.join(deviceDir, "DeviceAuthorize.tsx"), "utf8");
  const page = fs.readFileSync(path.join(deviceDir, "page.tsx"), "utf8");

  it("an already signed-in browser is shown its account and Authorize, with no detour through login", async () => {
    // The page reads the signed-in user from the browser's own session and only redirects when there is none.
    expect(page).toContain("if (request && !signedIn) {");
    expect(page).toContain("email={email}");
    expect(component).toContain("is asking to use your PawOS account");
    expect(component).toContain("{email}");
    // And Authorize works for that account as it is: one click, one handoff, for the signed-in user.
    state.cookieUserId = ALICE;
    const response = await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, fromBrowser));
    expect(response.status).toBe(200);
    expect(consumeDeviceHandoff((await response.json()).handoff, VERIFIER, "cli")).toEqual({ ok: true, userId: ALICE, client: "cli" });
  });

  it("goes through the existing login page and comes back to the same pending sign-in", () => {
    expect(deviceAuthPath(CHALLENGE, "cli")).toBe(`/auth/device?challenge=${CHALLENGE}&client=cli`);
    const login = deviceAuthLoginPath(CHALLENGE, "vscode");
    expect(login.startsWith("/login?next=")).toBe(true);
    // What the login page receives as `next`: the same sign-in, same challenge, same client.
    const next = new URL(login, "https://pawos.test").searchParams.get("next")!;
    expect(next).toBe(`/auth/device?challenge=${CHALLENGE}&client=vscode`);
    // A same-origin path, as the login page and /auth/callback require of `next`.
    expect(next.startsWith("/")).toBe(true);
    expect(next.startsWith("//")).toBe(false);
  });

  it("is the same address a signed-out browser is sent to: one login flow, not a second one", () => {
    expect(page).toContain("redirect(deviceAuthLoginPath(request.challenge, request.client))");
    expect(component).toContain("window.location.assign(deviceAuthLoginPath(challenge, client))");
  });

  it("the address carries only the challenge and the client kind", () => {
    const next = new URL(new URL(deviceAuthLoginPath(CHALLENGE, "cli"), "https://pawos.test").searchParams.get("next")!, "https://pawos.test");
    expect([...next.searchParams.keys()].sort()).toEqual(["challenge", "client"]);
    expect(deviceAuthLoginPath(CHALLENGE, "cli")).not.toMatch(/token|handoff|session/i);
  });

  it("is offered beside Authorize, which stays the default for the current account", () => {
    expect(component).toContain("Use a different account");
    expect(component).toContain('"Authorize"');
    // In the markup, Authorize comes first (the label also appears earlier, in a comment).
    expect(component.indexOf('"Authorize"')).toBeLessThan(component.lastIndexOf("Use a different account"));
    // Offered on the confirm step only: once the completion address is on screen there is nothing to switch.
    const completionScreen = component.slice(component.indexOf("if (completionUrl) {"), component.indexOf('data-testid="device-auth-confirm"'));
    expect(completionScreen.length).toBeGreaterThan(100);
    expect(completionScreen).not.toContain("useDifferentAccount");
  });

  it("signs out this browser only: the account's CLI, VS Code and Desktop sessions stay signed in", () => {
    expect(component).toContain('auth.signOut({ scope: "local" })');
    expect(component).not.toContain("signOut()");
  });

  it("asks PawOS for nothing and handles no token: it never calls the authorize or exchange routes", () => {
    const body = component.slice(component.indexOf("const useDifferentAccount"), component.indexOf("const copy"));
    expect(body.length).toBeGreaterThan(100);
    expect(body).not.toContain("fetch(");
    expect(body).not.toMatch(/access_token|refresh_token|accessToken|refreshToken/);
  });

  it("after switching, the device is authorized as the account that signed in; the one left behind gets nothing", async () => {
    // Alice was signed in but chose another account; Bob signs in and authorizes the same pending sign-in.
    const handoff = await signIn(BOB);
    const response = await exchange(post("/api/auth/device/exchange", { handoff, verifier: VERIFIER, client: "cli" }));
    expect((await response.json()).session).toMatchObject({ accessToken: `access-of-${BOB}`, email: "bob@example.com" });
    expect(state.generated).toEqual([{ type: "magiclink", email: "bob@example.com" }]);
  });

  it("between signing out and signing in again, nobody can authorize", async () => {
    state.cookieUserId = null;
    expect((await authorize(post("/api/auth/device/authorize", { challenge: CHALLENGE, client: "cli" }, fromBrowser))).status).toBe(401);
  });
});

describe("POST /api/auth/device/exchange (the client's paste)", () => {
  const send = (handoff: unknown, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    exchange(post("/api/auth/device/exchange", { handoff, verifier: VERIFIER, client: "cli", ...extra }, headers));

  it("successful exchange: a session of its own for the account that authorized, and nobody else's", async () => {
    const handoff = await signIn(ALICE);
    const response = await send(handoff);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, session: { accessToken: `access-of-${ALICE}`, refreshToken: `refresh-of-${ALICE}`, expiresAt: 1_900_000_000, email: "alice@example.com" } });
    expect(state.generated).toEqual([{ type: "magiclink", email: "alice@example.com" }]);
    expect(state.verified).toEqual([{ token_hash: "hash-for-alice@example.com", type: "magiclink" }]);
    // The session is redeemed with the public key; the service-role key never reaches that client.
    expect(state.anonClients).toEqual([{ url: "https://project.supabase.test", key: "anon-public-key" }]);
  });

  it("the handoff itself is not a token, and the response never contains it or the service-role key", async () => {
    const handoff = await signIn(ALICE);
    const text = await (await send(handoff)).text();
    expect(text).not.toContain("service-role-secret");
    expect(text).not.toContain(handoff);
  });

  it("reused handoff: invalid after exchange, useless from then on", async () => {
    const handoff = await signIn(ALICE);
    expect((await send(handoff)).status).toBe(200);
    const again = await send(handoff);
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ ok: false, code: "invalid_handoff" });
    expect(state.generated).toHaveLength(1);
  });

  it("an unknown handoff, a wrong verifier, a wrong client and missing fields mint nothing", async () => {
    const bodies: (handoff: string) => unknown[] = (handoff) => [
      { handoff: UNKNOWN_HANDOFF, verifier: VERIFIER, client: "cli" },
      { handoff, verifier: OTHER_VERIFIER, client: "cli" },
      { handoff, verifier: VERIFIER, client: "vscode" },
      { handoff, verifier: VERIFIER },
      { handoff, client: "cli" },
      { code: handoff, verifier: VERIFIER, client: "cli" },
      {},
      null,
    ];
    for (let index = 0; index < 8; index++) {
      resetDeviceAuthForTests(); // each attempt against a fresh, valid handoff
      const handoff = await signIn(ALICE);
      const response = await exchange(post("/api/auth/device/exchange", bodies(handoff)[index]));
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("invalid_handoff");
    }
    expect(state.generated).toHaveLength(0);
  });

  it("expired handoff", async () => {
    const handoff = await signIn(ALICE);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + DEVICE_HANDOFF_TTL_MS + 1000);
    const response = await send(handoff);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "handoff_expired", message: "That authentication URL has expired. Start sign-in again." });
  });

  it("never returns a session for a different account than the handoff named", async () => {
    const handoff = await signIn(ALICE);
    state.verifyAs = BOB; // Supabase answers with someone else's session
    const response = await send(handoff);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("access-of-");
  });

  it("an account without an email address is told so", async () => {
    state.users.set(ALICE, { email: null });
    const response = await send(await signIn(ALICE));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("account_unavailable");
  });

  it("slows down a caller guessing handoffs", async () => {
    const headers = { "x-forwarded-for": "198.51.100.7" };
    for (let attempt = 0; attempt < 10; attempt++) expect((await send(UNKNOWN_HANDOFF, {}, headers)).status).toBe(400);
    expect((await send(UNKNOWN_HANDOFF, {}, headers)).status).toBe(429);
  });

  it("no logging: neither the handoff nor anything secret reaches the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const handoff = await signIn(ALICE);
    await send(handoff);
    const failing = await signIn(ALICE);
    state.verifyAs = BOB;
    await send(failing);
    await send(UNKNOWN_HANDOFF);
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    for (const secret of [handoff, failing, UNKNOWN_HANDOFF, VERIFIER, "access-of-", "refresh-of-", "service-role-secret", "hash-for-"]) expect(logged).not.toContain(secret);
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
