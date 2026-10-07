import { describe, expect, it, vi } from "vitest";
import type { ConfigResult, PawosConfig } from "../config";
import { resolveConfig } from "../config";
import { AuthManager, AuthRequiredError, SESSION_EXPIRED_NOTICE } from "./authManager";
import { challengeFor, createPkcePair } from "./pkce";
import { SESSION_SECRET_KEY, SessionStore, type SecretStore } from "./sessionStore";
import { buildAuthorizeUrl, type FetchLike, type Session } from "./supabaseAuth";

/** Sign-in: PKCE in the browser, the session in SecretStorage, refreshed when it runs out. */
const CONFIG: PawosConfig = { apiBaseUrl: "https://pawos.test", supabaseUrl: "https://project.supabase.test", supabaseAnonKey: "anon-public-key" };
const REDIRECT = "vscode://revantaai.pawos/auth-callback";
const NOW = 1_800_000_000_000;

class MemorySecrets implements SecretStore {
  values = new Map<string, string>();
  async get(key: string) {
    return this.values.get(key);
  }
  async store(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
}

const session = (overrides: Partial<Session> = {}): Session => ({ accessToken: "access-1", refreshToken: "refresh-1", expiresAt: NOW / 1000 + 3600, email: "dev@example.com", ...overrides });

const tokenResponse = (accessToken: string, refreshToken: string) =>
  new Response(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_in: 3600, user: { email: "dev@example.com" } }), { status: 200 });

function setup(options: { stored?: Session; fetchImpl?: FetchLike; config?: ConfigResult; now?: () => number } = {}) {
  const secrets = new MemorySecrets();
  if (options.stored) secrets.values.set(SESSION_SECRET_KEY, JSON.stringify(options.stored));
  const opened: string[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init: init ?? {} });
    return (options.fetchImpl ?? (async () => tokenResponse("access-2", "refresh-2")))(url, init);
  };
  const auth = new AuthManager({
    store: new SessionStore(secrets),
    getConfig: () => options.config ?? { ok: true, config: CONFIG },
    openExternal: async (url) => {
      opened.push(url);
      return true;
    },
    redirectUri: REDIRECT,
    fetchImpl,
    now: options.now ?? (() => NOW),
    createPair: () => ({ verifier: "the-verifier", challenge: "the-challenge" }),
    signInTimeoutMs: 50,
  });
  return { auth, secrets, opened, calls };
}

describe("PKCE", () => {
  it("makes an S256 challenge from a random verifier of a valid length", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toBe(challengeFor(a.verifier));
    // RFC 7636 appendix B.
    expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("the browser address carries the challenge and the return address — never the verifier or a key", () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, "github", REDIRECT, "the-challenge"));
    expect(url.origin + url.pathname).toBe("https://project.supabase.test/auth/v1/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({ provider: "github", redirect_to: REDIRECT, code_challenge: "the-challenge", code_challenge_method: "s256" });
    expect(url.toString()).not.toContain("anon-public-key");
  });
});

describe("settings", () => {
  it("needs the PawOS Supabase URL and public key before sign-in is offered", () => {
    expect(resolveConfig({ apiBaseUrl: "https://pawos.revantaai.com", supabaseUrl: "", supabaseAnonKey: "" }).ok).toBe(false);
    expect(resolveConfig({ apiBaseUrl: "https://pawos.revantaai.com/", supabaseUrl: "https://p.supabase.co", supabaseAnonKey: " key " })).toEqual({
      ok: true,
      config: { apiBaseUrl: "https://pawos.revantaai.com", supabaseUrl: "https://p.supabase.co", supabaseAnonKey: "key" },
    });
  });

  it("only talks https (a local development server aside), and never to an address with credentials in it", () => {
    const base = { supabaseUrl: "https://p.supabase.co", supabaseAnonKey: "key" };
    expect(resolveConfig({ ...base, apiBaseUrl: "http://pawos.revantaai.com" }).ok).toBe(false);
    expect(resolveConfig({ ...base, apiBaseUrl: "https://user:pass@pawos.revantaai.com" }).ok).toBe(false);
    expect(resolveConfig({ ...base, apiBaseUrl: "not a url" }).ok).toBe(false);
    expect(resolveConfig({ ...base, apiBaseUrl: "http://localhost:3000" }).ok).toBe(true);
  });
});

describe("authentication state", () => {
  it("starts signed out, and signed in when an earlier window left a session", async () => {
    const fresh = setup();
    await fresh.auth.initialize();
    expect(fresh.auth.status).toBe("signedOut");

    const returning = setup({ stored: session() });
    await returning.auth.initialize();
    expect(returning.auth.status).toBe("signedIn");
    expect(returning.auth.email).toBe("dev@example.com");
  });

  it("signs in through the browser: opens the authorize address, exchanges the code with the verifier, stores the session", async () => {
    const { auth, secrets, opened, calls } = setup({ fetchImpl: async () => tokenResponse("access-new", "refresh-new") });
    const states: string[] = [];
    auth.onDidChange(() => states.push(auth.status));

    const signingIn = auth.signIn("github");
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(new URL(opened[0]!).searchParams.get("code_challenge")).toBe("the-challenge");
    expect(opened[0]).not.toContain("the-verifier");
    auth.handleCallback(new URLSearchParams("code=one-time-code"));
    await signingIn;

    expect(states).toEqual(["signingIn", "signedIn"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://project.supabase.test/auth/v1/token?grant_type=pkce");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ auth_code: "one-time-code", code_verifier: "the-verifier" });
    expect((calls[0]!.init.headers as Record<string, string>).apikey).toBe("anon-public-key");
    expect(JSON.parse(secrets.values.get(SESSION_SECRET_KEY)!)).toMatchObject({ accessToken: "access-new", refreshToken: "refresh-new", email: "dev@example.com" });
  });

  it("stays signed out when sign-in is cancelled, refused, or never finished", async () => {
    const cancelled = setup();
    const a = cancelled.auth.signIn("google");
    await vi.waitFor(() => expect(cancelled.opened).toHaveLength(1));
    cancelled.auth.handleCallback(new URLSearchParams("error=access_denied&error_description=The+user+denied+access"));
    await expect(a).rejects.toThrow("The user denied access");
    expect(cancelled.auth.status).toBe("signedOut");

    const refused = setup({ fetchImpl: async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) });
    const b = refused.auth.signIn("github");
    await vi.waitFor(() => expect(refused.opened).toHaveLength(1));
    refused.auth.handleCallback(new URLSearchParams("code=spent"));
    await expect(b).rejects.toThrow();
    expect(refused.auth.status).toBe("signedOut");
    expect(refused.secrets.values.size).toBe(0);

    const abandoned = setup();
    await expect(abandoned.auth.signIn("github")).rejects.toThrow("wasn't completed");
    expect(abandoned.auth.status).toBe("signedOut");
  });

  it("ignores a callback nobody asked for", async () => {
    const { auth, calls, secrets } = setup();
    auth.handleCallback(new URLSearchParams("code=planted-by-a-link"));
    expect(auth.status).toBe("signedOut");
    expect(calls).toHaveLength(0);
    expect(secrets.values.size).toBe(0);
  });

  it("does not offer sign-in until the settings are there", async () => {
    const { auth, opened } = setup({ config: { ok: false, problem: "Sign-in isn't set up yet." } });
    await expect(auth.signIn("github")).rejects.toThrow("isn't set up");
    expect(opened).toHaveLength(0);
  });
});

describe("SecretStorage token handling", () => {
  it("keeps the session under one SecretStorage key and nowhere else", async () => {
    const secrets = new MemorySecrets();
    const store = new SessionStore(secrets);
    await store.write(session());
    expect([...secrets.values.keys()]).toEqual([SESSION_SECRET_KEY]);
    expect(await store.read()).toEqual(session());
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it("treats a damaged or incomplete stored value as no session", async () => {
    const secrets = new MemorySecrets();
    const store = new SessionStore(secrets);
    for (const bad of ["not json", "null", "{}", JSON.stringify({ accessToken: "a" }), JSON.stringify({ accessToken: "", refreshToken: "r", expiresAt: 1 })]) {
      secrets.values.set(SESSION_SECRET_KEY, bad);
      expect(await store.read()).toBeNull();
    }
  });

  it("hands out the stored access token while it is current, without calling Supabase", async () => {
    const { auth, calls } = setup({ stored: session() });
    expect(await auth.getAccessToken()).toBe("access-1");
    expect(calls).toHaveLength(0);
  });

  it("refreshes a token that is about to expire, once, and stores the new session", async () => {
    const { auth, calls, secrets } = setup({ stored: session({ expiresAt: NOW / 1000 + 30 }) });
    await auth.initialize();
    const [first, second] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);
    expect(first).toBe("access-2");
    expect(second).toBe("access-2");
    expect(calls).toHaveLength(1); // two callers, one refresh
    expect(calls[0]!.url).toBe("https://project.supabase.test/auth/v1/token?grant_type=refresh_token");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ refresh_token: "refresh-1" });
    expect(JSON.parse(secrets.values.get(SESSION_SECRET_KEY)!)).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-2" });
  });

  it("an expired session Supabase won't renew signs the user out and says why", async () => {
    const { auth, secrets } = setup({ stored: session({ expiresAt: NOW / 1000 - 10 }), fetchImpl: async () => new Response("{}", { status: 400 }) });
    await auth.initialize();
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(auth.status).toBe("signedOut");
    expect(auth.notice).toBe(SESSION_EXPIRED_NOTICE);
    expect(secrets.values.size).toBe(0);
  });

  it("keeps using a still-valid token when Supabase can't be reached, and keeps the session", async () => {
    const offline: FetchLike = async () => {
      throw new Error("offline");
    };
    const soon = setup({ stored: session({ expiresAt: NOW / 1000 + 30 }), fetchImpl: offline });
    expect(await soon.auth.getAccessToken()).toBe("access-1");
    const gone = setup({ stored: session({ expiresAt: NOW / 1000 - 10 }), fetchImpl: offline });
    await expect(gone.auth.getAccessToken()).rejects.not.toBeInstanceOf(AuthRequiredError);
    expect(gone.secrets.values.size).toBe(1); // being offline is not being signed out
  });

  it("with no session there is no token", async () => {
    const { auth } = setup();
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("signing out removes the session from SecretStorage and ends it on the server", async () => {
    const { auth, secrets, calls } = setup({ stored: session(), fetchImpl: async () => new Response(null, { status: 204 }) });
    await auth.initialize();
    await auth.signOut();
    expect(auth.status).toBe("signedOut");
    expect(auth.notice).toBeNull();
    expect(secrets.values.size).toBe(0);
    expect(calls[0]!.url).toBe("https://project.supabase.test/auth/v1/logout?scope=local");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
  });
});
