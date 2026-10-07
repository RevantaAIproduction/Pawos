import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { PawosClient } from "../api/pawosClient";
import { PawosController } from "../controller";
import { SESSION_SECRET_KEY, SessionStore, type SecretStore } from "./sessionStore";
import { SESSION_EXPIRED_NOTICE, SessionManager } from "../../../pawos-shared/src/auth/session";
import type { FetchLike } from "../../../pawos-shared/src/auth/types";
import { resolveApiConfig } from "../../../pawos-shared/src/config";

/**
 * The extension's sign-in today: the PawOS browser hand-off it shares with the PawOS CLI — open
 * PawOS in the browser, paste the one-time code — with the session kept in VS Code SecretStorage.
 */
const API = "https://pawos.test";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

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

function setup(respond: (path: string, body: Record<string, unknown>, authorization: string | null) => Response) {
  const secrets = new MemorySecrets();
  const calls: { path: string; body: Record<string, unknown>; authorization: string | null }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { path: new URL(url).pathname, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}, authorization: ((init?.headers ?? {}) as Record<string, string>).Authorization ?? null };
    calls.push(call);
    return respond(call.path, call.body, call.authorization);
  };
  const session = new SessionManager({ storage: new SessionStore(secrets), getApiBaseUrl: () => API, fetchImpl });
  return { session, secrets, calls, fetchImpl };
}

const HANDOFF = "h".repeat(43);
const COMPLETION_URL = `${API}/auth/device/complete?handoff=${HANDOFF}`;

const SESSION = { accessToken: "access-1.jwt.sig", refreshToken: "refresh-1", expiresAt: Math.floor(Date.now() / 1000) + 3600, email: "dev@example.com" };

describe("signing in to the extension with the pasted authentication URL", () => {
  it("opens PawOS's own sign-in page for VS Code, carrying only a challenge", () => {
    const { session } = setup(() => json(404, {}));
    const pending = session.beginSignIn("vscode");
    const url = new URL(pending.url);
    expect(url.origin + url.pathname).toBe("https://pawos.test/auth/device");
    expect(url.searchParams.get("client")).toBe("vscode");
    expect(url.searchParams.get("challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...url.searchParams.keys()].sort()).toEqual(["challenge", "client"]);
    expect(session.status).toBe("signingIn");
  });

  it("exchanges the handoff in the pasted URL and stores the session in SecretStorage — and nowhere else", async () => {
    const { session, secrets, calls } = setup((path) => (path === "/api/auth/device/exchange" ? json(200, { ok: true, session: SESSION }) : json(404, {})));
    const pending = session.beginSignIn("vscode");
    await pending.complete(`  ${COMPLETION_URL}\n`);

    expect(session.status).toBe("signedIn");
    expect(session.email).toBe("dev@example.com");
    expect([...secrets.values.keys()]).toEqual([SESSION_SECRET_KEY]);
    expect(JSON.parse(secrets.values.get(SESSION_SECRET_KEY)!)).toEqual(SESSION);
    // The verifier that goes with the handoff is the one behind the challenge the browser was given.
    const verifier = String(calls[0]!.body.verifier);
    expect(new URL(pending.url).searchParams.get("challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(calls[0]!.body).toEqual({ handoff: HANDOFF, verifier, client: "vscode" });
  });

  it("a refused handoff leaves the extension signed out with nothing stored", async () => {
    const { session, secrets } = setup(() => json(400, { ok: false, code: "handoff_expired", message: "That authentication URL has expired. Start sign-in again." }));
    await expect(session.beginSignIn("vscode").complete(COMPLETION_URL)).rejects.toThrow("That authentication URL has expired. Start sign-in again.");
    expect(session.status).toBe("signedOut");
    expect(secrets.values.size).toBe(0);
  });

  it("the box only accepts PawOS's own completion address, and says why without sending anything", () => {
    const { session, calls } = setup(() => json(404, {}));
    const pending = session.beginSignIn("vscode");
    expect(pending.check(COMPLETION_URL)).toEqual({ ok: true, handoff: HANDOFF });
    for (const pasted of [
      `https://evil.example/auth/device/complete?handoff=${HANDOFF}`,
      `${API}/somewhere/else?handoff=${HANDOFF}`,
      `${API}/auth/device/complete`,
      `${API}/auth/device/complete?handoff=${HANDOFF}&handoff=${HANDOFF}`,
      "PAWOS-8F4K-92KD",
      pending.url,
    ]) {
      const checked = pending.check(pasted);
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.reason).not.toContain(HANDOFF); // the reason never repeats what was pasted
    }
    expect(calls).toHaveLength(0);
  });

  it("closing the box cancels the sign-in without disturbing an existing session", async () => {
    const { session, secrets } = setup(() => json(404, {}));
    secrets.values.set(SESSION_SECRET_KEY, JSON.stringify(SESSION));
    await session.initialize();
    session.beginSignIn("vscode").cancel();
    expect(session.status).toBe("signedIn");
    expect(secrets.values.size).toBe(1);
  });

  it("renews the session through PawOS, and API calls carry the renewed token", async () => {
    const { session, secrets, calls, fetchImpl } = setup((path, _body, authorization) => {
      if (path === "/api/auth/device/refresh") return json(200, { ok: true, session: { ...SESSION, accessToken: "access-2.jwt.sig", refreshToken: "refresh-2" } });
      if (path === "/api/web/capabilities") return authorization === "Bearer access-2.jwt.sig" ? json(200, { ok: true, plan: { tier: "pro", label: "Paw Pro" }, capabilities: [] }) : json(401, { ok: false });
      return json(404, {});
    });
    secrets.values.set(SESSION_SECRET_KEY, JSON.stringify({ ...SESSION, expiresAt: Math.floor(Date.now() / 1000) - 10 }));
    await session.initialize();
    const client = new PawosClient(() => API, (force) => session.getAccessToken(force), () => session.expire(), fetchImpl);
    expect((await client.getCapabilities()).plan.label).toBe("Paw Pro");
    expect(calls.map((call) => call.path)).toEqual(["/api/auth/device/refresh", "/api/web/capabilities"]);
    expect(calls[0]!.body).toEqual({ refreshToken: "refresh-1" });
    expect(JSON.parse(secrets.values.get(SESSION_SECRET_KEY)!)).toMatchObject({ accessToken: "access-2.jwt.sig", refreshToken: "refresh-2" });
  });

  it("a session PawOS won't renew is cleared from SecretStorage, with the reason shown", async () => {
    const { session, secrets } = setup(() => json(401, { ok: false, code: "session_expired" }));
    secrets.values.set(SESSION_SECRET_KEY, JSON.stringify({ ...SESSION, expiresAt: 1 }));
    await session.initialize();
    await expect(session.getAccessToken()).rejects.toThrow();
    expect(session.status).toBe("signedOut");
    expect(session.notice).toBe(SESSION_EXPIRED_NOTICE);
    expect(secrets.values.size).toBe(0);
  });

  it("needs no Supabase settings: PawOS's address is the only one it uses", () => {
    expect(resolveApiConfig(undefined, "setting")).toEqual({ ok: true, config: { apiBaseUrl: "https://pawos.revantaai.com" } });
    expect(resolveApiConfig("http://example.com", "The PawOS: Api Base Url setting")).toEqual({ ok: false, problem: "The PawOS: Api Base Url setting must be a valid https address." });
  });

  it("the sidebar's Sign In runs the hand-off, and shows why when it fails", async () => {
    const { session, fetchImpl } = setup(() => json(404, {}));
    const client = new PawosClient(() => API, (force) => session.getAccessToken(force), () => session.expire(), fetchImpl);
    let started = 0;
    const controller = new PawosController({
      auth: session,
      startSignIn: async () => {
        started += 1;
        throw new Error("That authentication URL isn't valid. Start sign-in again.");
      },
      client,
      getConfig: () => resolveApiConfig(API, "setting"),
      getWorkspaceRepository: () => null,
      confirm: async () => true,
      openExternal: async () => undefined,
    });
    await controller.signIn();
    expect(started).toBe(1);
    expect(controller.state).toMatchObject({ auth: "signedOut", error: "That authentication URL isn't valid. Start sign-in again." });
  });
});
