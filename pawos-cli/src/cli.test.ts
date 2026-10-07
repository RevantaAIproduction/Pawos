import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { COMMANDS, runCli } from "./cli";
import { VERSION } from "./config";
import { ALICE, harness } from "./testing/harness";

/** The `pawos` command: its subcommands, and what happens when it starts. */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const VALID_CODE = "PAWOS-8F4K-92KD";

describe("pawos version", () => {
  it("prints the version from package.json — the only place it is written", async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { version: string; name: string; bin: Record<string, string> };
    expect(VERSION).toBe(packageJson.version);
    const h = start();
    h.ctx.version = VERSION;
    expect(await runCli(["version"], h.ctx)).toBe(0);
    expect(h.output()).toBe(`PawOS v${packageJson.version}\n`);
    expect(h.server.calls).toHaveLength(0); // no network, no sign-in
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
    expect(h.output()).toContain("PawOS works on your connected GitHub project.");
  });

  it("an unknown command is an error, never a task", async () => {
    const h = start({ signedIn: true });
    expect(await runCli(["fix the login bug"], h.ctx)).toBe(2);
    expect(h.output()).toContain("Unknown command");
    expect(h.server.calls).toHaveLength(0);
  });

  it("an unknown command can't write to the terminal with control characters", async () => {
    const h = start();
    await runCli(["\u001b[2Jevil\u0007"], h.ctx);
    expect(h.raw()).not.toMatch(/[\u0007\u001b]/);
  });

  it.each([["login"], ["logout"], ["status"]])("pawos %s takes no arguments", async (command) => {
    const h = start({ signedIn: true });
    expect(await runCli([command, "extra"], h.ctx)).toBe(2);
    expect(h.server.calls).toHaveLength(0);
  });

  it("pawos with no arguments opens the interactive session", async () => {
    const h = start({ signedIn: true, answers: [null] });
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("PawOS");
    expect(output).toContain("AI Developer OS");
    expect(output).toContain("What would you like PawOS to do?");
  });
});

describe("startup without authentication", () => {
  it("opens the browser to PawOS and asks for the code — never for a password or a token", async () => {
    const h = start({ answers: [VALID_CODE, null] });
    h.server.codes.set("8F4K92KD", "valid");
    expect(await runCli([], h.ctx)).toBe(0);

    expect(h.opened).toHaveLength(1);
    const opened = new URL(h.opened[0]!);
    expect(opened.origin + opened.pathname).toBe("https://pawos.test/auth/device");
    expect(opened.searchParams.get("client")).toBe("cli");
    expect(opened.searchParams.get("challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const output = h.output();
    expect(output).toContain("PawOS Authentication");
    expect(output).toContain("Opening your browser");
    expect(output).toContain("Paste authentication code:");
    expect(output).not.toMatch(/password|access token|supabase/i);
    // Then straight into the session, signed in.
    expect(output).toContain(`Signed in  ${ALICE.email} · Paw Pro`);
    expect(output).toContain("What would you like PawOS to do?");
  });

  it("prints the address too, for when the browser can't be opened", async () => {
    const h = start({ answers: [VALID_CODE, null], browserOpens: false });
    h.server.codes.set("8F4K92KD", "valid");
    await runCli([], h.ctx);
    expect(h.output()).toContain("Your browser couldn't be opened. Visit:");
    expect(h.output()).toContain(h.opened[0]!);
  });

  it("stops, signed out, if the user doesn't finish signing in", async () => {
    const h = start({ answers: [null] });
    expect(await runCli([], h.ctx)).toBe(1);
    expect(h.output()).toContain("Sign-in cancelled.");
    expect(h.output()).not.toContain("What would you like PawOS to do?");
    expect(h.keyring!.value).toBeNull();
  });
});

describe("authentication success", () => {
  it("pawos login exchanges the pasted code and keeps the session in the credential store", async () => {
    const h = start({ answers: ["  pawos-8f4k-92kd "] });
    h.server.codes.set("8F4K92KD", "valid");
    expect(await runCli(["login"], h.ctx)).toBe(0);

    const exchange = h.server.calls.find((call) => call.path === "/api/auth/device/exchange")!;
    expect(exchange.body?.code).toBe("pawos-8f4k-92kd");
    expect(String(exchange.body?.verifier)).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(h.output()).toContain(`Signed in  ${ALICE.email}`);
    expect(h.ctx.session.status).toBe("signedIn");
    expect(JSON.parse(h.keyring!.value!)).toEqual({ refreshToken: "refresh-1", email: ALICE.email });
  });

  it("the verifier sent matches the challenge the browser was given, and never appears in the address", async () => {
    const { createHash } = await import("crypto");
    const h = start({ answers: [VALID_CODE] });
    h.server.codes.set("8F4K92KD", "valid");
    await runCli(["login"], h.ctx);
    const verifier = String(h.server.calls.find((call) => call.path === "/api/auth/device/exchange")!.body?.verifier);
    expect(new URL(h.opened[0]!).searchParams.get("challenge")).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(h.opened[0]).not.toContain(verifier);
    expect(h.output()).not.toContain(verifier);
  });

  it("a mistyped code is caught before it is sent, and the user can try again", async () => {
    const h = start({ answers: ["hello", "PAWOS-8F4K", VALID_CODE] });
    h.server.codes.set("8F4K92KD", "valid");
    expect(await runCli(["login"], h.ctx)).toBe(0);
    expect(h.server.calls.filter((call) => call.path === "/api/auth/device/exchange")).toHaveLength(1);
    expect(h.output().match(/That doesn't look like a PawOS code/g)).toHaveLength(2);
  });
});

describe("authentication failure", () => {
  it("an invalid code is refused with PawOS's reason, and nothing is stored", async () => {
    const h = start({ answers: ["PAWOS-ZZZZ-ZZZZ"] });
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.output()).toContain("That code isn't valid.");
    expect(h.output()).toContain("Run pawos login to try again.");
    expect(h.ctx.session.status).toBe("signedOut");
    expect(h.keyring!.value).toBeNull();
  });

  it("an expired code says so", async () => {
    const h = start({ answers: [VALID_CODE] });
    h.server.codes.set("8F4K92KD", "expired");
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.output()).toContain("That code has expired. Start sign-in again.");
  });

  it("a code works once", async () => {
    const first = start({ answers: [VALID_CODE] });
    first.server.codes.set("8F4K92KD", "valid");
    expect(await runCli(["login"], first.ctx)).toBe(0);
    first.prompter.prompts.length = 0;
    // The same code again, against the same PawOS: refused.
    const again = await first.ctx.session.beginSignIn("cli").complete(VALID_CODE).then(() => "accepted", (error: Error) => error.message);
    expect(again).toContain("isn't valid");
  });

  it("gives up after three mistyped codes", async () => {
    const h = start({ answers: ["a", "b", "c", VALID_CODE] });
    h.server.codes.set("8F4K92KD", "valid");
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.server.calls).toHaveLength(0);
    expect(h.output()).toContain("too many attempts");
  });

  it("PawOS being unreachable is said plainly", async () => {
    const h = start({ answers: [VALID_CODE] });
    h.ctx.session = new (await import("./shared")).SessionManager({
      storage: h.store,
      getApiBaseUrl: () => "https://pawos.test",
      fetchImpl: async () => {
        throw new Error("getaddrinfo ENOTFOUND pawos.test");
      },
    });
    expect(await runCli(["login"], h.ctx)).toBe(1);
    expect(h.output()).toContain("PawOS couldn't be reached. Check your connection and try again.");
    expect(h.output()).not.toContain("ENOTFOUND");
  });

  it("a misconfigured PAWOS_API_URL stops before anything is opened", async () => {
    const h = start({ apiProblem: "PAWOS_API_URL must be a valid https address." });
    expect(await runCli([], h.ctx)).toBe(2);
    expect(h.output()).toContain("PAWOS_API_URL must be a valid https address.");
    expect(h.opened).toHaveLength(0);
  });
});

describe("logout", () => {
  it("removes the session from the credential store and ends it on PawOS", async () => {
    const h = start({ signedIn: true });
    expect(await runCli(["logout"], h.ctx)).toBe(0);
    expect(h.output()).toBe("Signed out of PawOS on this computer.\n");
    expect(h.keyring!.value).toBeNull();
    expect(fs.existsSync(path.join(h.directory, "session.json"))).toBe(false);
    const logout = h.server.calls.find((call) => call.path === "/api/auth/device/logout")!;
    expect(logout.authorization).toMatch(/^Bearer access-/);
    expect(h.server.validAccess.size).toBe(0);
  });

  it("still signs out locally when PawOS can't be reached", async () => {
    const h = start({ signedIn: true });
    h.ctx.session = new (await import("./shared")).SessionManager({
      storage: h.store,
      getApiBaseUrl: () => "https://pawos.test",
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
});

describe("status", () => {
  it("shows the account, where the session is kept, and that the folder matches PawOS", async () => {
    const h = start({ signedIn: true });
    expect(await runCli(["status"], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("PawOS v0.1.0");
    expect(output).toMatch(/Account\s+alice@example\.com · Paw Pro/);
    expect(output).toMatch(/Session\s+system credential store/);
    expect(output).toMatch(/Folder\s+acme\/site/);
    expect(output).toMatch(/PawOS\s+acme\/site \(main\)/);
    expect(output).toMatch(/Match\s+yes/);
  });

  it("shows a mismatch and changes nothing", async () => {
    const h = start({ signedIn: true, local: { kind: "github", fullName: "acme/app", remote: "origin" } });
    expect(await runCli(["status"], h.ctx)).toBe(0);
    expect(h.output()).toMatch(/Match\s+no/);
    expect(h.server.calls.filter((call) => call.method === "PUT")).toHaveLength(0);
  });

  it("signed out: says so, and exits non-zero", async () => {
    const h = start({ local: { kind: "notGit" } });
    expect(await runCli(["status"], h.ctx)).toBe(1);
    expect(h.output()).toMatch(/Account\s+not signed in/);
    expect(h.output()).toMatch(/Folder\s+not a Git repository/);
    expect(h.output()).toContain("Run pawos login to sign in.");
    expect(h.server.calls).toHaveLength(0);
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
