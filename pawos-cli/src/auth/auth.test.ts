import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../cli";
import { apiConfig, configDirectory } from "../config";
import { AuthRejectedError, AuthRequiredError, AuthUnavailableError, SESSION_EXPIRED_NOTICE, SessionManager, exchangeLoginCode, looksLikeLoginCode, type Session } from "../shared";
import { API, FakePawos, MemoryKeyring, harness } from "../testing/harness";
import { openerFor } from "./openBrowser";
import { CliSessionStore, KEYRING_ACCOUNT, KEYRING_SERVICE, SESSION_FILE_NAME, keyringServiceFor } from "./sessionStore";

/** Signing in with a one-time code, and where the CLI keeps the session afterwards. */
const directories: string[] = [];
const tempDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pawos-cli-auth-"));
  directories.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const VERIFIER = "v".repeat(64);
const session = (overrides: Partial<Session> = {}): Session => ({ accessToken: "access.jwt.sig", refreshToken: "refresh-1", expiresAt: Math.floor(Date.now() / 1000) + 3600, email: "alice@example.com", ...overrides });

describe("one-time code handling", () => {
  it.each([["PAWOS-8F4K-92KD"], ["pawos-8f4k-92kd"], ["8F4K92KD"], [" PAWOS 8F4K 92KD "], ["8f4k-92kd"]])("recognises a code typed as %s", (code) => {
    expect(looksLikeLoginCode(code)).toBe(true);
  });

  it.each([[""], ["PAWOS"], ["PAWOS-8F4K"], ["PAWOS-8F4K-92KD-EXTRA"], ["https://pawos.test/auth/device"], ["eyJhbGciOiJIUzI1NiJ9.e30.sig"]])("rejects %s before anything is sent", async (code) => {
    expect(looksLikeLoginCode(code)).toBe(false);
    const server = new FakePawos();
    await expect(exchangeLoginCode(API, code, VERIFIER, server.fetch)).rejects.toBeInstanceOf(AuthRejectedError);
    expect(server.calls).toHaveLength(0);
  });

  it("successful exchange: the code and the verifier go to PawOS, a session comes back", async () => {
    const server = new FakePawos();
    server.codes.set("8F4K92KD", "valid");
    const result = await exchangeLoginCode(API, "PAWOS-8F4K-92KD", VERIFIER, server.fetch);
    expect(result).toMatchObject({ accessToken: "access-1.jwt.sig", refreshToken: "refresh-1", email: "alice@example.com" });
    expect(server.calls).toEqual([{ method: "POST", path: "/api/auth/device/exchange", body: { code: "PAWOS-8F4K-92KD", verifier: VERIFIER }, authorization: null }]);
  });

  it("expired code", async () => {
    const server = new FakePawos();
    server.codes.set("8F4K92KD", "expired");
    const error = await exchangeLoginCode(API, "PAWOS-8F4K-92KD", VERIFIER, server.fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthRejectedError);
    expect(error).toMatchObject({ code: "code_expired", message: "That code has expired. Start sign-in again." });
  });

  it("invalid code", async () => {
    const error = await exchangeLoginCode(API, "PAWOS-ZZZZ-ZZZZ", VERIFIER, new FakePawos().fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthRejectedError);
    expect(error).toMatchObject({ code: "invalid_code" });
  });

  it("the code is single-use", async () => {
    const server = new FakePawos();
    server.codes.set("8F4K92KD", "valid");
    await exchangeLoginCode(API, "PAWOS-8F4K-92KD", VERIFIER, server.fetch);
    await expect(exchangeLoginCode(API, "PAWOS-8F4K-92KD", VERIFIER, server.fetch)).rejects.toMatchObject({ code: "invalid_code" });
  });

  it.each([
    [429, { ok: false, code: "rate_limited", message: "Too many attempts. Wait a minute and try again." }, "Too many attempts. Wait a minute and try again."],
    [502, {}, "PawOS sign-in is unavailable right now. Please try again."],
    [200, { ok: true, session: { accessToken: "", refreshToken: "" } }, "PawOS sign-in is unavailable right now. Please try again."],
  ])("HTTP %i is PawOS being unavailable, not the code being wrong", async (status, body, message) => {
    const error = await exchangeLoginCode(API, "PAWOS-8F4K-92KD", VERIFIER, async () => new Response(JSON.stringify(body), { status })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthUnavailableError);
    expect((error as Error).message).toBe(message);
  });

  it("a newer sign-in makes an older one's code unusable here", async () => {
    const h = harness();
    h.server.codes.set("8F4K92KD", "valid");
    const older = h.ctx.session.beginSignIn("cli");
    h.ctx.session.beginSignIn("cli");
    await expect(older.complete("PAWOS-8F4K-92KD")).rejects.toThrow("restarted");
    expect(h.server.calls).toHaveLength(0);
    h.cleanup();
  });
});

describe("secure session storage", () => {
  it("keeps the session in the operating system's credential store, under the PawOS CLI's name", () => {
    expect(KEYRING_SERVICE).toBe("pawos-cli");
    expect(KEYRING_ACCOUNT).toBe("session");
  });

  it("a session for another PawOS address (a development server) has its own entry", () => {
    const real = "https://pawos.revantaai.com";
    expect(keyringServiceFor(real, real)).toBe("pawos-cli");
    expect(keyringServiceFor("http://localhost:3000", real)).toBe("pawos-cli:localhost:3000");
    expect(keyringServiceFor("https://staging.pawos.example", real)).toBe("pawos-cli:staging.pawos.example");
  });

  it("stores only the refresh token and the email — the access token is never written anywhere", async () => {
    const keyring = new MemoryKeyring();
    const directory = tempDirectory();
    const store = new CliSessionStore(keyring, directory);
    await store.write(session());
    expect(JSON.parse(keyring.value!)).toEqual({ refreshToken: "refresh-1", email: "alice@example.com" });
    expect(keyring.value).not.toContain("access.jwt.sig");
    expect(fs.readdirSync(directory)).toEqual([]); // nothing on disk at all
    expect(store.storage).toBe("keychain");
  });

  it("the access token lives in memory for one run; the next run starts without one", async () => {
    const keyring = new MemoryKeyring();
    const directory = tempDirectory();
    const first = new CliSessionStore(keyring, directory);
    await first.write(session());
    expect((await first.read())!.accessToken).toBe("access.jwt.sig");
    const nextRun = new CliSessionStore(keyring, directory);
    expect(await nextRun.read()).toEqual({ accessToken: "", refreshToken: "refresh-1", expiresAt: 0, email: "alice@example.com" });
  });

  it.each([["no credential store on this machine", null], ["a credential store that refuses", Object.assign(new MemoryKeyring(), { broken: true })]])("falls back to a file only the user can read: %s", async (_name, keyring) => {
    const directory = tempDirectory();
    const store = new CliSessionStore(keyring, directory);
    await store.write(session());
    const file = path.join(directory, SESSION_FILE_NAME);
    expect(store.storage).toBe("file");
    expect(store.filePath).toBe(file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ refreshToken: "refresh-1", email: "alice@example.com" });
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect((await new CliSessionStore(keyring, directory).read())?.refreshToken).toBe("refresh-1");
  });

  it("the CLI says so when it had to use the file", async () => {
    const h = harness({ keyring: null, answers: ["PAWOS-8F4K-92KD"] });
    h.server.codes.set("8F4K92KD", "valid");
    await runCli(["login"], h.ctx);
    expect(h.output()).toContain("No system credential store is available, so the session is kept in a file only you can read:");
    expect(h.output()).toContain(path.join(h.directory, SESSION_FILE_NAME));
    h.cleanup();
  });

  it("moving to the credential store removes the older file copy", async () => {
    const directory = tempDirectory();
    await new CliSessionStore(null, directory).write(session());
    expect(fs.existsSync(path.join(directory, SESSION_FILE_NAME))).toBe(true);
    await new CliSessionStore(new MemoryKeyring(), directory).write(session({ refreshToken: "refresh-2" }));
    expect(fs.existsSync(path.join(directory, SESSION_FILE_NAME))).toBe(false);
  });

  it("clearing removes it from everywhere", async () => {
    const keyring = new MemoryKeyring();
    const directory = tempDirectory();
    fs.writeFileSync(path.join(directory, SESSION_FILE_NAME), JSON.stringify({ refreshToken: "old", email: null }));
    const store = new CliSessionStore(keyring, directory);
    await store.write(session());
    await store.clear();
    expect(keyring.value).toBeNull();
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(await store.read()).toBeNull();
    expect(store.storage).toBe("none");
  });

  it.each([["not json"], ["{}"], ["null"], [JSON.stringify({ refreshToken: "" })], [JSON.stringify({ accessToken: "a" })]])("a damaged stored value is no session: %s", async (value) => {
    const keyring = new MemoryKeyring();
    keyring.value = value;
    expect(await new CliSessionStore(keyring, tempDirectory()).read()).toBeNull();
  });

  it("keeps its files in the user's own configuration folder on every platform", () => {
    expect(configDirectory({ APPDATA: "C:\\Users\\dev\\AppData\\Roaming" }, "win32", "C:\\Users\\dev")).toBe(path.join("C:\\Users\\dev\\AppData\\Roaming", "pawos"));
    expect(configDirectory({}, "darwin", "/Users/dev")).toBe(path.join("/Users/dev", "Library", "Application Support", "pawos"));
    expect(configDirectory({}, "linux", "/home/dev")).toBe(path.join("/home/dev", ".config", "pawos"));
    expect(configDirectory({ XDG_CONFIG_HOME: "/xdg" }, "linux", "/home/dev")).toBe(path.join("/xdg", "pawos"));
  });
});

describe("token refresh", () => {
  it("a new run renews the access token through PawOS before its first request, and stores the new refresh token", async () => {
    const h = harness({ signedIn: true });
    await h.ctx.session.initialize();
    const token = await h.ctx.session.getAccessToken();
    expect(token).toBe("access-2.jwt.sig");
    expect(h.server.calls).toEqual([{ method: "POST", path: "/api/auth/device/refresh", body: { refreshToken: "refresh-1" }, authorization: null }]);
    expect(JSON.parse(h.keyring!.value!)).toEqual({ refreshToken: "refresh-2", email: "alice@example.com" });
    // Within the run the token is reused: no second refresh.
    expect(await h.ctx.session.getAccessToken()).toBe("access-2.jwt.sig");
    expect(h.server.calls).toHaveLength(1);
    h.cleanup();
  });

  it("two requests at once share one refresh", async () => {
    const h = harness({ signedIn: true });
    const [a, b] = await Promise.all([h.ctx.session.getAccessToken(), h.ctx.session.getAccessToken()]);
    expect(a).toBe(b);
    expect(h.server.calls.filter((call) => call.path === "/api/auth/device/refresh")).toHaveLength(1);
    h.cleanup();
  });

  it("a session PawOS won't renew is signed out, with the reason", async () => {
    const h = harness({ signedIn: true });
    h.server.validRefresh.clear();
    await h.ctx.session.initialize();
    await expect(h.ctx.session.getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(h.ctx.session.status).toBe("signedOut");
    expect(h.ctx.session.notice).toBe(SESSION_EXPIRED_NOTICE);
    expect(h.keyring!.value).toBeNull();
    h.cleanup();
  });

  it("PawOS being unreachable is not being signed out", async () => {
    const keyring = new MemoryKeyring();
    keyring.value = JSON.stringify({ refreshToken: "refresh-1", email: "alice@example.com" });
    const manager = new SessionManager({
      storage: new CliSessionStore(keyring, tempDirectory()),
      getApiBaseUrl: () => API,
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    await manager.initialize();
    await expect(manager.getAccessToken()).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(manager.status).toBe("signedIn");
    expect(keyring.value).not.toBeNull();
  });

  it("an API 401 gets one refresh and one retry", async () => {
    const h = harness({ signedIn: true });
    await h.ctx.client.getCapabilities();
    h.server.validAccess.clear(); // PawOS stops accepting the current token
    expect((await h.ctx.client.getCapabilities()).plan.label).toBe("Paw Pro");
    expect(h.server.calls.filter((call) => call.path === "/api/auth/device/refresh")).toHaveLength(2);
    h.cleanup();
  });
});

describe("no token logging", () => {
  it("a full sign-in, a task-less session and a sign-out put no token on the screen or in the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const h = harness({ answers: ["PAWOS-8F4K-92KD", null] });
    h.server.codes.set("8F4K92KD", "valid");
    await runCli([], h.ctx);
    await runCli(["status"], h.ctx);
    await runCli(["logout"], h.ctx);
    const verifier = String(h.server.calls.find((call) => call.path === "/api/auth/device/exchange")!.body?.verifier);
    const seen = h.raw() + JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    for (const secret of ["access-1", "refresh-1", "Bearer ", verifier]) expect(seen).not.toContain(secret);
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    h.cleanup();
  });

  it("errors never carry a token or a response body", async () => {
    const leaky = async () => new Response(JSON.stringify({ ok: false, detail: "refresh-1 access.jwt.sig", message: "" }), { status: 500 });
    const error = (await exchangeLoginCode(API, "PAWOS-8F4K-92KD", VERIFIER, leaky).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("PawOS sign-in is unavailable right now. Please try again.");
    expect(JSON.stringify(error)).not.toContain(VERIFIER);
  });

  it("the session is only ever sent to PawOS's own address", async () => {
    const h = harness({ signedIn: true, answers: [null] });
    await runCli([], h.ctx); // FakePawos throws on any other origin
    expect(h.server.calls.length).toBeGreaterThan(0);
    h.cleanup();
  });
});

describe("where the CLI connects and how it opens the browser", () => {
  it("talks to PawOS, or to the address in PAWOS_API_URL — https only", () => {
    expect(apiConfig({})).toEqual({ ok: true, config: { apiBaseUrl: "https://pawos.revantaai.com" } });
    expect(apiConfig({ PAWOS_API_URL: "http://localhost:3000/" })).toEqual({ ok: true, config: { apiBaseUrl: "http://localhost:3000" } });
    expect(apiConfig({ PAWOS_API_URL: "http://pawos.example.com" }).ok).toBe(false);
    expect(apiConfig({ PAWOS_API_URL: "https://user:pass@pawos.example.com" }).ok).toBe(false);
  });

  it("hands the address to the system's opener as one argument, never through a shell", () => {
    const url = "https://pawos.test/auth/device?challenge=abc&client=cli";
    expect(openerFor("win32", url)).toEqual({ command: "rundll32", args: ["url.dll,FileProtocolHandler", url] });
    expect(openerFor("darwin", url)).toEqual({ command: "open", args: [url] });
    expect(openerFor("linux", url)).toEqual({ command: "xdg-open", args: [url] });
  });
});
