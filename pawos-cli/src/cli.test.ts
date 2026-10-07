import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Every attempt to start another program while a command runs is recorded here. The commands in
// this file get their Git answers from the harness, so the list must stay empty: in particular,
// signing in must never launch a browser.
const launched = vi.hoisted(() => ({ programs: [] as string[] }));
vi.mock("child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("child_process")>();
  const record = <T extends (...args: never[]) => unknown>(name: string, run: T): T =>
    ((...args: Parameters<T>) => {
      launched.programs.push(`${name} ${String(args[0])}`);
      return run(...args);
    }) as T;
  return { ...real, spawn: record("spawn", real.spawn as never), exec: record("exec", real.exec as never), execFile: record("execFile", real.execFile as never) };
});

import { COMMANDS, runCli } from "./cli";
import { VERSION } from "./config";
import { ALICE, API, HANDOFF, LIVE_TERMINAL, STATIC_TERMINAL, completionUrl, harness } from "./testing/harness";

/** The `pawos` command: its subcommands, and signing in from the terminal. */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  launched.programs.length = 0;
});

const ESC = String.fromCharCode(27);
const exchanges = (h: ReturnType<typeof harness>) => h.server.calls.filter((call) => call.path === "/api/auth/device/exchange");

describe("pawos version", () => {
  it("prints the version from package.json — the only place it is written — without signing in", async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { version: string };
    expect(VERSION).toBe(packageJson.version);
    const h = start();
    h.ctx.version = VERSION;
    expect(await runCli(["version"], h.ctx)).toBe(0);
    expect(h.output()).toBe(`PawOS v${packageJson.version}\n`);
    expect(h.server.calls).toHaveLength(0); // no network, no authentication
    expect(h.prompter.prompts).toHaveLength(0);
  });

  it("is installed as the `pawos` command of the `pawos` package", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { name: string; bin: Record<string, string> };
    expect(packageJson.name).toBe("pawos");
    expect(Object.keys(packageJson.bin)).toEqual(["pawos"]);
  });

  it("no other file states a version", () => {
    const sources = fs.readdirSync(__dirname, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts") && !file.includes("testing") && !file.endsWith(".test.ts"));
    for (const file of sources) expect(fs.readFileSync(path.join(__dirname, file), "utf8")).not.toMatch(/["'`]\d+\.\d+\.\d+["'`]/);
  });
});

describe("command routing", () => {
  it.each([["--version"], ["-v"], ["-V"]])("%s is the version too", async (flag) => {
    const h = start();
    expect(await runCli([flag], h.ctx)).toBe(0);
    expect(h.output()).toBe("PawOS v0.1.0\n");
  });

  it("help lists exactly the commands that exist", async () => {
    const h = start();
    expect(await runCli(["help"], h.ctx)).toBe(0);
    for (const command of COMMANDS.filter((name) => name !== "help")) expect(h.output()).toContain(`pawos ${command}`);
    // It says where code changes are made, and never claims to edit the files on this computer.
    expect(h.output()).toContain("your connected GitHub project, not in the files on this computer.");
    expect(h.output()).toContain("Open PawOS, from any folder");
  });

  it("an unknown command is an error, never a task", async () => {
    const h = start({ signedIn: true });
    expect(await runCli(["fix the login bug"], h.ctx)).toBe(2);
    expect(h.output()).toContain("Unknown command");
    expect(h.server.calls).toHaveLength(0);
  });

  it("an unknown command can't write to the terminal with control characters", async () => {
    const h = start();
    await runCli([`${ESC}[2Jevil${String.fromCharCode(7)}`], h.ctx);
    expect(h.raw()).not.toContain(ESC);
    expect(h.raw()).not.toContain(String.fromCharCode(7));
  });

  it.each([["login"], ["logout"], ["status"]])("pawos %s takes no arguments", async (command) => {
    const h = start({ signedIn: true });
    expect(await runCli([command, "extra"], h.ctx)).toBe(2);
    expect(h.server.calls).toHaveLength(0);
  });

  it("pawos with no arguments opens the PawOS workspace", async () => {
    const h = start({ signedIn: true, answers: [null] });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("AI Developer Workspace");
    expect(h.output()).toContain("What would you like to work on?");
  });
});

describe("the authentication URL is printed", () => {
  it("pawos login shows the sign-in URL and asks for the authentication URL", async () => {
    const h = start({ answers: [null] });
    expect(await runCli(["login"], h.ctx)).toBe(1); // the user left without signing in
    const [url] = h.signInUrls();
    expect(h.signInUrls()).toHaveLength(1);
    // The whole screen up to the prompt, exactly as the user sees it.
    expect(h.output().split("  Authentication URL:")[0]).toBe(
      ["", "  PawOS CLI", "", "  To sign in, open this URL in your browser:", "", url, "", "  After signing in, copy the authentication URL", "  shown by PawOS and paste it below.", "", ""].join("\n")
    );
    expect(h.prompter.prompts).toEqual(["  Authentication URL:\n  > "]);
  });

  it("the URL is PawOS's device sign-in page for the CLI: complete, never shortened, never behind a label", async () => {
    const h = start({ answers: [null] });
    await runCli(["login"], h.ctx);
    const url = new URL(h.signInUrls()[0]!);
    expect(url.origin + url.pathname).toBe("https://pawos.test/auth/device");
    expect(url.searchParams.get("client")).toBe("cli");
    expect(url.searchParams.get("challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...url.searchParams.keys()].sort()).toEqual(["challenge", "client"]);
    // Plain characters only: it pastes the same from CMD, PowerShell, VS Code, Terminal and Linux terminals.
    expect(h.signInUrls()[0]).toMatch(/^[A-Za-z0-9:/?&=._~-]+$/);
  });

  it("the URL is easy to copy: alone on its line, from the left edge, never broken or cut to the screen", async () => {
    for (const caps of [STATIC_TERMINAL, { ...LIVE_TERMINAL, columns: 40 }, { ...STATIC_TERMINAL, unicode: false }]) {
      const h = start({ answers: [null], caps });
      await runCli(["login"], h.ctx);
      const url = h.signInUrls()[0]!;
      expect(url.length).toBeGreaterThan(80); // longer than a narrow terminal is wide
      const lines = h.output().split("\n");
      const at = lines.indexOf(url); // the line is the URL and nothing else: no indent, no label, no trailing text
      expect(at).toBeGreaterThan(0);
      expect(lines[at - 1]).toBe("");
      expect(lines[at + 1]).toBe("");
      expect(h.raw()).toContain(url); // in one piece, with no newline or cursor movement inside it
    }
  });

  it("where the terminal supports links the URL is clickable too, and the text is still the full URL", async () => {
    const h = start({ answers: [null], caps: LIVE_TERMINAL });
    await runCli(["login"], h.ctx);
    const url = h.signInUrls()[0]!;
    expect(h.raw()).toContain(`${ESC}]8;;${url}${ESC}\\`);
    expect(h.output().split("\n")).toContain(url);
  });
});

describe("the browser is never launched automatically", () => {
  it("signing in starts no program at all: no browser, no opener", async () => {
    const h = start({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli(["login"], h.ctx)).toBe(0);
    expect(launched.programs).toEqual([]);
    expect(h.output()).not.toMatch(/Opening your browser|couldn't be opened/);

    const viaPawos = start({ answers: [completionUrl(), null] });
    viaPawos.server.handoffs.set(HANDOFF, "valid");
    await runCli([], viaPawos.ctx);
    expect(launched.programs).toEqual([]);
  });

  it("no part of the CLI can open a browser, and it never requests the pasted URL", () => {
    const sources = fs.readdirSync(__dirname, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.includes("testing"));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      const source = fs.readFileSync(path.join(__dirname, file), "utf8");
      expect(source).not.toMatch(/rundll32|xdg-open|FileProtocolHandler|openBrowser|PAWOS_NO_BROWSER/);
      // Git is the only program the CLI ever runs.
      if (source.includes("child_process")) expect(file.replace(/\\/g, "/")).toBe("git/localRepository.ts");
      // The CLI's own files make no network request of their own: every request goes through the shared client.
      expect(source).not.toMatch(/\bfetch\(/);
    }
  });
});

describe("pasting the authentication URL", () => {
  it("waits for the paste: nothing is sent to PawOS until the user answers", async () => {
    const h = start({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    const callsWhenAsked: number[] = [];
    const ask = h.prompter.ask.bind(h.prompter);
    h.prompter.ask = async (prompt) => {
      if (prompt.includes("Authentication URL")) callsWhenAsked.push(h.server.calls.length);
      return ask(prompt);
    };
    expect(await runCli(["login"], h.ctx)).toBe(0);
    expect(callsWhenAsked).toEqual([0]); // still waiting: no request had been made
    expect(h.server.calls[0]!.path).toBe("/api/auth/device/exchange"); // the first request comes only after the paste
  });

  it("completion URL accepted: its handoff is exchanged with this CLI's verifier and client kind", async () => {
    const { createHash } = await import("crypto");
    const h = start({ answers: [`  ${completionUrl()}  `, null] });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli(["login"], h.ctx)).toBe(0);
    expect(exchanges(h)).toHaveLength(1);
    const body = exchanges(h)[0]!.body!;
    expect(body.handoff).toBe(HANDOFF);
    expect(body.client).toBe("cli");
    expect(Object.keys(body).sort()).toEqual(["client", "handoff", "verifier"]);
    // The verifier is the secret behind the challenge in the URL that was printed.
    expect(new URL(h.signInUrls()[0]!).searchParams.get("challenge")).toBe(createHash("sha256").update(String(body.verifier)).digest("base64url"));
    // The pasted address is read, not visited: the only request is the exchange.
    expect(h.server.calls.some((call) => call.path === "/auth/device/complete")).toBe(false);
  });

  it.each([
    ["invalid host rejected", `https://evil.example/auth/device/complete?handoff=${HANDOFF}`, "That address isn't from pawos.test."],
    ["invalid path rejected", `${API}/dashboard?handoff=${HANDOFF}`, "That isn't the authentication URL."],
    ["missing handoff rejected", `${API}/auth/device/complete`, "That URL is incomplete."],
    ["duplicated handoff rejected", `${API}/auth/device/complete?handoff=${HANDOFF}&handoff=${HANDOFF}`, "That isn't the authentication URL."],
    ["malformed URL rejected", "not a url at all", "That isn't the authentication URL."],
    ["an old-style code rejected", "PAWOS-8F4K-92KD", "That isn't the authentication URL."],
  ])("%s, before anything is sent — and the user can paste again", async (_name, pasted, message) => {
    const h = start({ answers: [pasted, completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli(["login"], h.ctx)).toBe(0);
    expect(h.output()).toContain(message);
    expect(exchanges(h)).toHaveLength(1); // only the good one was ever sent
    expect(h.signInUrls()).toHaveLength(1); // the same sign-in: the address is not reissued
  });

  it("the sign-in URL pasted back by mistake is explained", async () => {
    const h = start({ answers: [null] });
    await runCli(["login"], h.ctx);
    const again = start({ answers: [h.signInUrls()[0]!.replace("pawos.test", "pawos.test"), null] });
    await runCli(["login"], again.ctx);
    expect(again.output()).toContain("That's the sign-in address.");
    expect(exchanges(again)).toHaveLength(0);
  });

  it("expired handoff rejected, with PawOS's reason", async () => {
    const h = start({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "expired");
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.output()).toContain("That authentication URL has expired. Start sign-in again.");
    expect(h.output()).toContain("Run pawos login to try again.");
    expect(h.ctx.session.status).toBe("signedOut");
    expect(h.keyring!.value).toBeNull();
  });

  it("reused handoff rejected: the same URL signs in once", async () => {
    const h = start({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli(["login"], h.ctx)).toBe(0);
    const second = start({ answers: [completionUrl(), null] });
    // The same PawOS, where that handoff has already been used.
    second.ctx.session = new (await import("./shared")).SessionManager({ storage: second.store, getApiBaseUrl: () => API, fetchImpl: h.server.fetch });
    expect(await runCli(["login"], second.ctx)).toBe(1);
    expect(second.output()).toContain("isn't valid or has already been used");
    expect(second.keyring!.value).toBeNull();
  });

  it("gives up after three pastes that aren't the URL, having sent nothing", async () => {
    const h = start({ answers: ["a", "b", "c", completionUrl()] });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.server.calls).toHaveLength(0);
    expect(h.output()).toContain("too many attempts");
  });

  it("leaving the prompt empty, Ctrl+C or the end of input cancels sign-in and stores nothing", async () => {
    for (const answers of [[""], [null], []]) {
      const h = start({ answers });
      expect(await runCli(["login"], h.ctx)).toBe(1);
      expect(h.output()).toContain("Sign-in cancelled.");
      expect(h.server.calls).toHaveLength(0);
      expect(h.keyring!.value).toBeNull();
    }
  });

  it("PawOS being unreachable is said plainly", async () => {
    const h = start({ answers: [completionUrl()] });
    h.ctx.session = new (await import("./shared")).SessionManager({
      storage: h.store,
      getApiBaseUrl: () => API,
      fetchImpl: async () => {
        throw new Error("getaddrinfo ENOTFOUND pawos.test");
      },
    });
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.output()).toContain("PawOS couldn't be reached. Check your connection and try again.");
    expect(h.output()).not.toContain("ENOTFOUND");
  });

  it("a misconfigured PAWOS_API_URL stops before any address is printed", async () => {
    const h = start({ apiProblem: "PAWOS_API_URL must be a valid https address." });
    expect(await runCli([], h.ctx)).toBe(2);
    expect(h.output()).toContain("PAWOS_API_URL must be a valid https address.");
    expect(h.signInUrls()).toHaveLength(0);
  });
});

describe("after a successful exchange", () => {
  it("account identity displayed: \"Signed in as <email>\"", async () => {
    const h = start({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    await runCli(["login"], h.ctx);
    expect(h.output()).toContain(`✓ Signed in as ${ALICE.email}`);
    expect(h.ctx.session.status).toBe("signedIn");
  });

  it("the session is kept in the credential store: the refresh token and the email, nothing else", async () => {
    const h = start({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    await runCli(["login"], h.ctx);
    expect(JSON.parse(h.keyring!.value!)).toEqual({ refreshToken: "refresh-1", email: ALICE.email });
    expect(fs.readdirSync(h.directory)).toEqual([]);
  });

  it("no secrets printed: not the handoff, the verifier, a token or a key — only what the user typed is echoed", async () => {
    const h = start({ answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    await runCli([], h.ctx);
    await runCli(["status"], h.ctx);
    const verifier = String(exchanges(h)[0]!.body?.verifier);
    // Take away the one line the user typed (the scripted keyboard echoes it): what is left is what the CLI printed.
    const printed = h.raw().split(completionUrl()).join("");
    for (const secret of [HANDOFF, verifier, "access-1", "refresh-1", "Bearer ", "apikey", "service_role"]) expect(printed).not.toContain(secret);
    expect(h.signInUrls()[0]).not.toMatch(/token|secret|key|verifier|session|handoff/i);
  });

  it("a rejected paste is never echoed back by the CLI", async () => {
    const bad = `https://evil.example/auth/device/complete?handoff=${"s".repeat(43)}`;
    const h = start({ answers: [bad, null] });
    await runCli(["login"], h.ctx);
    const printed = h.raw().split(bad).join("");
    expect(printed).not.toContain("s".repeat(43));
    expect(printed).not.toContain("evil.example");
  });
});

describe("logout", () => {
  it("removes the session from the credential store, ends it on PawOS, and exits normally", async () => {
    const h = start({ signedIn: true });
    expect(await runCli(["logout"], h.ctx)).toBe(0);
    expect(h.output()).toBe("Signed out of PawOS on this computer.\n");
    expect(h.keyring!.value).toBeNull();
    expect(fs.existsSync(path.join(h.directory, "session.json"))).toBe(false);
    const logout = h.server.calls.find((call) => call.path === "/api/auth/device/logout")!;
    expect(logout.authorization).toMatch(/^Bearer access-/);
    expect(h.server.validAccess.size).toBe(0);
    expect(h.output()).not.toMatch(/access-|refresh-/);
    expect(h.prompter.prompts).toHaveLength(0); // it does not open the workspace
  });

  it("still signs out locally when PawOS can't be reached", async () => {
    const h = start({ signedIn: true });
    h.ctx.session = new (await import("./shared")).SessionManager({
      storage: h.store,
      getApiBaseUrl: () => API,
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    expect(await runCli(["logout"], h.ctx)).toBe(0);
    expect(h.keyring!.value).toBeNull();
  });

  it("says so when nobody was signed in", async () => {
    const h = start();
    expect(await runCli(["logout"], h.ctx)).toBe(0);
    expect(h.output()).toBe("You weren't signed in.\n");
    expect(h.server.calls).toHaveLength(0);
  });

  it("after logout, pawos asks for authentication again", async () => {
    const h = start({ signedIn: true, answers: [null] });
    await runCli(["logout"], h.ctx);
    expect(await runCli([], h.ctx)).toBe(1);
    expect(h.output()).toContain("To sign in, open this URL in your browser:");
    expect(h.output()).not.toContain("What would you like to work on?");
  });
});

describe("status", () => {
  it("is non-interactive: shows the account, where the session is kept, and that the folder matches PawOS", async () => {
    const h = start({ signedIn: true });
    expect(await runCli(["status"], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("PawOS v0.1.0");
    expect(output).toMatch(/Account\s+alice@example\.com · Paw Pro/);
    expect(output).toMatch(/Session\s+system credential store/);
    expect(output).toMatch(/Folder\s+acme\/site/);
    expect(output).toMatch(/PawOS\s+acme\/site \(main\)/);
    expect(output).toMatch(/Match\s+yes/);
    expect(h.prompter.prompts).toHaveLength(0);
  });

  it("shows a mismatch and changes nothing", async () => {
    const h = start({ signedIn: true, local: { kind: "github", fullName: "acme/app", remote: "origin" } });
    expect(await runCli(["status"], h.ctx)).toBe(0);
    expect(h.output()).toMatch(/Match\s+no/);
    expect(h.server.calls.filter((call) => call.method === "PUT")).toHaveLength(0);
  });

  it("signed out: says so, exits non-zero, and does not start sign-in", async () => {
    const h = start({ local: { kind: "notGit" } });
    expect(await runCli(["status"], h.ctx)).toBe(1);
    expect(h.output()).toMatch(/Account\s+not signed in/);
    expect(h.output()).toMatch(/Folder\s+not a Git repository/);
    expect(h.output()).toContain("Run pawos login to sign in.");
    expect(h.server.calls).toHaveLength(0);
    expect(h.signInUrls()).toHaveLength(0);
  });

  it("an expired session is reported, not hidden", async () => {
    const h = start({ signedIn: true });
    h.server.validRefresh.clear(); // PawOS will not renew it
    expect(await runCli(["status"], h.ctx)).toBe(1);
    expect(h.output()).toContain("Your PawOS session has expired. Sign in again.");
    expect(h.keyring!.value).toBeNull();
  });

  it("never prints a token", async () => {
    const h = start({ signedIn: true });
    await runCli(["status"], h.ctx);
    expect(h.output()).not.toMatch(/refresh-\d|access-\d|Bearer/);
  });
});
