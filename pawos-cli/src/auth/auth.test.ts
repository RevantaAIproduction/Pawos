import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../cli";
import { apiConfig, configDirectory } from "../config";
import { AuthRejectedError, AuthRequiredError, AuthUnavailableError, SESSION_EXPIRED_NOTICE, SessionManager, exchangeCompletionUrl, parseCompletionUrl, type Session } from "../shared";
import { API, FakePawos, HANDOFF, MemoryKeyring, completionUrl, harness } from "../testing/harness";
import { CliSessionStore, KEYRING_ACCOUNT, KEYRING_SERVICE, SESSION_FILE_NAME, SessionStorageError, isInside, keyringServiceFor } from "./sessionStore";

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

describe("the authentication URL the user pastes", () => {
  const URL_OK = completionUrl();

  it("completion URL accepted: PawOS's own completion address with one handoff", () => {
    expect(parseCompletionUrl(URL_OK, API)).toEqual({ ok: true, handoff: HANDOFF });
    // Pasted with the whitespace a terminal adds around it.
    expect(parseCompletionUrl(`  ${URL_OK}\r\n`, API)).toEqual({ ok: true, handoff: HANDOFF });
  });

  it.each([
    ["another site", `https://evil.example/auth/device/complete?handoff=${HANDOFF}`],
    ["a look-alike host", `https://pawos.test.evil.example/auth/device/complete?handoff=${HANDOFF}`],
    ["a subdomain", `https://login.pawos.test/auth/device/complete?handoff=${HANDOFF}`],
    ["another port", `https://pawos.test:8443/auth/device/complete?handoff=${HANDOFF}`],
    ["plain http", `http://pawos.test/auth/device/complete?handoff=${HANDOFF}`],
    ["credentials in the address", `https://pawos.test@evil.example/auth/device/complete?handoff=${HANDOFF}`],
    ["a user name on the right host", `https://someone@pawos.test/auth/device/complete?handoff=${HANDOFF}`],
  ])("invalid host rejected: %s", (_name, pasted) => {
    const result = parseCompletionUrl(pasted, API);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("That address isn't from pawos.test. Copy the URL PawOS shows after you click Authorize.");
  });

  it.each([
    ["another page", `${API}/dashboard?handoff=${HANDOFF}`],
    ["a longer path", `${API}/auth/device/complete/extra?handoff=${HANDOFF}`],
    ["a trailing slash", `${API}/auth/device/complete/?handoff=${HANDOFF}`],
    ["path tricks", `${API}/auth/device/complete/../complete/x?handoff=${HANDOFF}`],
    ["the API route itself", `${API}/api/auth/device/exchange?handoff=${HANDOFF}`],
    ["the handoff in a fragment", `${API}/auth/device/complete#handoff=${HANDOFF}`],
    ["a fragment after it", `${API}/auth/device/complete?handoff=${HANDOFF}#x`],
  ])("invalid path rejected: %s", (_name, pasted) => {
    expect(parseCompletionUrl(pasted, API).ok).toBe(false);
  });

  it("the sign-in address pasted back by mistake gets its own explanation", () => {
    const result = parseCompletionUrl(`${API}/auth/device?challenge=${"c".repeat(43)}&client=cli`, API);
    expect(result).toEqual({ ok: false, reason: "That's the sign-in address. Open it in your browser, click Authorize, then paste the URL PawOS shows you." });
  });

  it.each([
    ["no parameters", `${API}/auth/device/complete`],
    ["an empty query", `${API}/auth/device/complete?`],
    ["another parameter only", `${API}/auth/device/complete?code=${HANDOFF}`],
  ])("missing handoff rejected: %s", (_name, pasted) => {
    expect(parseCompletionUrl(pasted, API)).toEqual({ ok: false, reason: "That URL is incomplete. Copy the whole URL PawOS shows, using its Copy URL button." });
  });

  it.each([
    ["the handoff twice", `${API}/auth/device/complete?handoff=${HANDOFF}&handoff=${HANDOFF}`],
    ["two different handoffs", `${API}/auth/device/complete?handoff=${HANDOFF}&handoff=${"x".repeat(43)}`],
    ["an extra parameter", `${API}/auth/device/complete?handoff=${HANDOFF}&next=https://evil.example`],
    ["an extra parameter first", `${API}/auth/device/complete?client=cli&handoff=${HANDOFF}`],
    ["an empty handoff", `${API}/auth/device/complete?handoff=`],
    ["a handoff that is too short", `${API}/auth/device/complete?handoff=abc`],
    ["a handoff that is too long", `${API}/auth/device/complete?handoff=${HANDOFF}extra`],
    ["a handoff with other characters", `${API}/auth/device/complete?handoff=${"h".repeat(42)}%2F`],
  ])("duplicated or ambiguous parameters rejected: %s", (_name, pasted) => {
    expect(parseCompletionUrl(pasted, API).ok).toBe(false);
  });

  it.each([[""], ["   "], ["not a url"], ["PAWOS-8F4K-92KD"], [HANDOFF], ["javascript:alert(1)"], ["file:///etc/passwd"], [`${URL_OK} and more`], [`${API}/auth/device/complete?handoff=${"h".repeat(20)}\n${"h".repeat(23)}`], ["x".repeat(600)], [null], [undefined], [42]])(
    "malformed URL rejected: %j",
    (pasted) => {
      expect(parseCompletionUrl(pasted, API).ok).toBe(false);
    }
  );

  it("a rejection never repeats what was pasted", () => {
    for (const pasted of [`https://evil.example/auth/device/complete?handoff=${HANDOFF}`, `${API}/auth/device/complete?handoff=${HANDOFF}&handoff=${HANDOFF}`, `${API}/x?handoff=${HANDOFF}`]) {
      const result = parseCompletionUrl(pasted, API);
      if (!result.ok) {
        expect(result.reason).not.toContain(HANDOFF);
        expect(result.reason).not.toContain("evil.example");
      }
    }
  });

  it("nothing is sent anywhere for a URL that fails these checks, and the URL is never fetched or opened", async () => {
    const server = new FakePawos();
    for (const pasted of [`https://evil.example/auth/device/complete?handoff=${HANDOFF}`, `${API}/auth/device/complete`, "not a url"]) {
      await expect(exchangeCompletionUrl(API, pasted, VERIFIER, "cli", server.fetch)).rejects.toBeInstanceOf(AuthRejectedError);
    }
    expect(server.calls).toHaveLength(0);
  });

  it("successful exchange: the handoff, the verifier and the client kind go to PawOS's exchange route — the pasted address itself is never requested", async () => {
    const server = new FakePawos();
    server.handoffs.set(HANDOFF, "valid");
    const result = await exchangeCompletionUrl(API, URL_OK, VERIFIER, "cli", server.fetch);
    expect(result).toMatchObject({ accessToken: "access-1.jwt.sig", refreshToken: "refresh-1", email: "alice@example.com" });
    expect(server.calls).toEqual([{ method: "POST", path: "/api/auth/device/exchange", body: { handoff: HANDOFF, verifier: VERIFIER, client: "cli" }, authorization: null }]);
  });

  it("expired handoff rejected", async () => {
    const server = new FakePawos();
    server.handoffs.set(HANDOFF, "expired");
    const error = await exchangeCompletionUrl(API, URL_OK, VERIFIER, "cli", server.fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthRejectedError);
    expect(error).toMatchObject({ code: "handoff_expired", message: "That authentication URL has expired. Start sign-in again." });
  });

  it("an unknown handoff is rejected", async () => {
    const error = await exchangeCompletionUrl(API, URL_OK, VERIFIER, "cli", new FakePawos().fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthRejectedError);
    expect(error).toMatchObject({ code: "invalid_handoff" });
  });

  it("reused handoff rejected: it is invalid after one exchange", async () => {
    const server = new FakePawos();
    server.handoffs.set(HANDOFF, "valid");
    await exchangeCompletionUrl(API, URL_OK, VERIFIER, "cli", server.fetch);
    await expect(exchangeCompletionUrl(API, URL_OK, VERIFIER, "cli", server.fetch)).rejects.toMatchObject({ code: "invalid_handoff" });
  });

  it.each([
    [429, { ok: false, code: "rate_limited", message: "Too many attempts. Wait a minute and try again." }, "Too many attempts. Wait a minute and try again."],
    [502, {}, "PawOS sign-in is unavailable right now. Please try again."],
    [200, { ok: true, session: { accessToken: "", refreshToken: "" } }, "PawOS sign-in is unavailable right now. Please try again."],
  ])("HTTP %i is PawOS being unavailable, not the URL being wrong", async (status, body, message) => {
    const error = await exchangeCompletionUrl(API, URL_OK, VERIFIER, "cli", async () => new Response(JSON.stringify(body), { status })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthUnavailableError);
    expect((error as Error).message).toBe(message);
  });

  it("a newer sign-in makes an older one's URL unusable here", async () => {
    const h = harness();
    h.server.handoffs.set(HANDOFF, "valid");
    const older = h.ctx.session.beginSignIn("cli");
    h.ctx.session.beginSignIn("cli");
    await expect(older.complete(URL_OK)).rejects.toThrow("restarted");
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
    const h = harness({ keyring: null, answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    await runCli(["login"], h.ctx);
    expect(h.output()).toContain("No system credential store is available, so the session is kept in a file only you can read:");
    expect(h.output()).toContain(path.join(h.directory, SESSION_FILE_NAME));
    h.cleanup();
  });

  it("the fallback file is in the user's configuration folder, never in the project", async () => {
    // PawOS's folder has (mis)been pointed inside the project the user is working in.
    const project = tempDirectory();
    const store = new CliSessionStore(null, path.join(project, ".pawos"), project);
    await expect(store.write(session())).rejects.toBeInstanceOf(SessionStorageError);
    expect(fs.existsSync(path.join(project, ".pawos"))).toBe(false); // nothing was written
    expect(await store.read()).toBeNull(); // and nothing is kept in memory as if signed in
    expect(store.storage).toBe("none");

    expect(isInside("C:\\Projects\\MyApp\\.pawos\\session.json", "C:\\Projects\\MyApp", "win32")).toBe(true);
    expect(isInside("c:/projects/myapp/x", "C:\\Projects\\MyApp", "win32")).toBe(true);
    expect(isInside("C:\\Projects\\MyApp2\\session.json", "C:\\Projects\\MyApp", "win32")).toBe(false);
    expect(isInside("C:\\Users\\dev\\AppData\\Roaming\\pawos\\session.json", "C:\\Projects\\MyApp", "win32")).toBe(false);
  });

  it("with a credential store, being inside the project doesn't matter: nothing is written to disk at all", async () => {
    const project = tempDirectory();
    const keyring = new MemoryKeyring();
    await new CliSessionStore(keyring, path.join(project, ".pawos"), project).write(session());
    expect(keyring.value).not.toBeNull();
    expect(fs.readdirSync(project)).toEqual([]);
  });

  it("sign-in fails, rather than storing the session unsafely", async () => {
    const h = harness({ keyring: null, answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    // The only place left is inside the project.
    const project = tempDirectory();
    const unsafe = new CliSessionStore(null, path.join(project, ".pawos"), project);
    h.ctx.store = unsafe;
    h.ctx.session = new SessionManager({ storage: unsafe, getApiBaseUrl: () => API, fetchImpl: h.server.fetch });
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.output()).toContain("PawOS couldn't store your session safely");
    expect(h.output()).not.toContain("Signed in as");
    expect(h.ctx.session.status).toBe("signedOut");
    expect(fs.readdirSync(project)).toEqual([]);
    h.cleanup();
  });

  it("a fallback folder that can't be written fails sign-in the same way", async () => {
    const blocked = path.join(tempDirectory(), "a-file");
    fs.writeFileSync(blocked, "not a folder");
    const store = new CliSessionStore(null, path.join(blocked, "pawos"));
    await expect(store.write(session())).rejects.toBeInstanceOf(SessionStorageError);
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
    const h = harness({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    await runCli([], h.ctx);
    await runCli(["status"], h.ctx);
    await runCli(["logout"], h.ctx);
    const verifier = String(h.server.calls.find((call) => call.path === "/api/auth/device/exchange")!.body?.verifier);
    const seen = h.raw() + JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    // The handoff was typed by the user (the scripted keyboard echoes it once); the CLI itself never prints it again.
    const printedByCli = seen.split(completionUrl()).join("");
    for (const secret of ["access-1", "refresh-1", "Bearer ", verifier, HANDOFF]) expect(printedByCli).not.toContain(secret);
    expect(spies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    h.cleanup();
  });

  it("errors never carry a token or a response body", async () => {
    const leaky = async () => new Response(JSON.stringify({ ok: false, detail: "refresh-1 access.jwt.sig", message: "" }), { status: 500 });
    const error = (await exchangeCompletionUrl(API, completionUrl(), VERIFIER, "cli", leaky).catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("PawOS sign-in is unavailable right now. Please try again.");
    expect(JSON.stringify(error) + error.message).not.toContain(VERIFIER);
    expect(error.message).not.toContain(HANDOFF);
  });

  it("the session is only ever sent to PawOS's own address", async () => {
    const h = harness({ signedIn: true, answers: [null] });
    await runCli([], h.ctx); // FakePawos throws on any other origin
    expect(h.server.calls.length).toBeGreaterThan(0);
    h.cleanup();
  });
});

describe("where the CLI connects", () => {
  it("talks to PawOS, or to the address in PAWOS_API_URL — https only", () => {
    expect(apiConfig({})).toEqual({ ok: true, config: { apiBaseUrl: "https://pawos.revantaai.com" } });
    expect(apiConfig({ PAWOS_API_URL: "http://localhost:3000/" })).toEqual({ ok: true, config: { apiBaseUrl: "http://localhost:3000" } });
    expect(apiConfig({ PAWOS_API_URL: "http://pawos.example.com" }).ok).toBe(false);
    expect(apiConfig({ PAWOS_API_URL: "https://user:pass@pawos.example.com" }).ok).toBe(false);
  });
});
