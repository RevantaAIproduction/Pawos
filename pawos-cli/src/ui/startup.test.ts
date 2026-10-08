import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { QUESTION } from "../commands/interactive";
import { ALICE, CAPABILITIES, HANDOFF, LIVE_TERMINAL, STATIC_TERMINAL, completionUrl, harness, reply, stripAnsi } from "../testing/harness";
import { INTRO_FRAME_MS, StartupIntro, WORDMARK, firstName, greeting, introFrames, timeOfDay } from "./intro";
import { plain } from "./terminal";

/**
 * The start of a PawOS session: the wordmark coming online, the greeting, and where the user is.
 * The animation is one line, drawn in place, once; a terminal that can't redraw gets no frames.
 */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const ESC = String.fromCharCode(27);
const RULE = "─".repeat(40);
const at = (hour: number, minute = 0) => new Date(2026, 9, 8, hour, minute, 0);
const HOME = "C:\\Users\\APPLE";
const NOT_GIT = { kind: "notGit" } as const;
const greetingLine = (text: string) => text.split("\n")[4];

/** Runs `pawos` while moving the animation's frames along, as the clock would. */
async function runAnimated(h: ReturnType<typeof harness>, args: string[] = []): Promise<number> {
  let code: number | null = null;
  const running = runCli(args, h.ctx).then((result) => (code = result));
  for (let turn = 0; turn < 400 && code === null; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
    h.timers.tick();
  }
  return running;
}

describe("greeting", () => {
  it("morning greeting with the user's first name", async () => {
    const h = start({ signedIn: true, answers: [null], now: at(9) });
    await runCli([], h.ctx);
    expect(greetingLine(h.output())).toBe("  Good morning, Alice.");
  });

  it("afternoon greeting", async () => {
    const h = start({ signedIn: true, answers: [null], now: at(14, 30) });
    await runCli([], h.ctx);
    expect(greetingLine(h.output())).toBe("  Good afternoon, Alice.");
  });

  it("evening greeting", async () => {
    const h = start({ signedIn: true, answers: [null], now: at(20) });
    await runCli([], h.ctx);
    expect(greetingLine(h.output())).toBe("  Good evening, Alice.");
  });

  it("follows the clock on this computer through the day", () => {
    expect([0, 4, 5, 11, 12, 17, 18, 23].map((hour) => timeOfDay(at(hour)))).toEqual(["Good evening", "Good evening", "Good morning", "Good morning", "Good afternoon", "Good afternoon", "Good evening", "Good evening"]);
  });

  it("missing display name: Welcome back.", async () => {
    for (const name of [null, "", "   "]) {
      const h = start({ signedIn: true, answers: [null] });
      h.server.name = name;
      expect(await runCli([], h.ctx)).toBe(0);
      expect(greetingLine(h.output())).toBe("  Welcome back.");
    }
  });

  it("a name lookup that fails or is malformed never prevents startup", async () => {
    for (const body of [{ plan: ALICE.plan, capabilities: CAPABILITIES }, { plan: ALICE.plan, user: null, capabilities: CAPABILITIES }, { plan: ALICE.plan, user: "Alice", capabilities: CAPABILITIES }, { plan: ALICE.plan, user: { name: 42 }, capabilities: CAPABILITIES }, { plan: ALICE.plan, user: { name: { first: "Alice" } }, capabilities: CAPABILITIES }]) {
      const h = start({ signedIn: true, answers: ["hello", null], cwd: HOME, local: NOT_GIT });
      h.server.capabilitiesAnswer = reply(body);
      expect(await runCli([], h.ctx)).toBe(0);
      expect(greetingLine(h.output())).toBe("  Welcome back.");
      expect(h.output()).toContain(QUESTION);
      expect(h.server.chats()).toHaveLength(1); // and it is fully usable
    }
  });

  it("uses only a first name — never an email address, a link or an identifier", () => {
    expect(firstName("Tharun Esta")).toBe("Tharun");
    expect(firstName("  José  María ")).toBe("José");
    expect(firstName("O'Neil")).toBe("O'Neil");
    expect(firstName("Anne-Marie Dupont")).toBe("Anne-Marie");
    for (const not of ["alice@example.com", "alice@example.com Smith", "https://evil.example", "user_12345", "8f3a2c1e-77aa", "x".repeat(31), "", null, undefined, 7, {}]) expect(firstName(not)).toBeNull();
    expect(greeting("alice@example.com", at(9))).toBe("Welcome back.");
    expect(greeting("Tharun", at(9))).toBe("Good morning, Tharun.");
  });

  it("a name can't inject control sequences into the terminal", async () => {
    const h = start({ signedIn: true, answers: [null] });
    h.server.name = `Al${ESC}[2Jice Example`;
    await runCli([], h.ctx);
    expect(h.raw()).not.toContain(ESC);
    expect(greetingLine(h.output())).toBe("  Welcome back."); // what is left is not a name
  });

  it("asks PawOS nothing extra for the name: it comes with the account's capabilities", async () => {
    const h = start({ signedIn: true, answers: [null] });
    await runCli([], h.ctx);
    const paths = h.server.calls.filter((call) => !call.path.startsWith("/api/auth/device/")).map((call) => `${call.method} ${call.path}`);
    expect(paths.sort()).toEqual(["GET /api/web/capabilities", "GET /api/web/github/repository"]);
  });
});

describe("startup order and project context", () => {
  it("non-Git directory: title, greeting, folder, rule, question, prompt", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.output()).toBe(["", "  PawOS v0.1.0", "  AI Developer Workspace", "", "  Good morning, Alice.", "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n"));
    expect(h.prompter.prompts).toEqual(["  > "]); // the > is the real input prompt
  });

  it("Git directory without a GitHub remote: folder and branch", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "/home/dev/notes", branch: "drafts", local: { kind: "noRemote" } });
    await runCli([], h.ctx);
    expect(h.output().split("\n").slice(0, 9)).toEqual(["", "  PawOS v0.1.0", "  AI Developer Workspace", "", "  Good morning, Alice.", "", "  /home/dev/notes", "  Git: drafts", ""]);
    expect(h.output()).not.toContain("Repository:");
  });

  it("Git + GitHub repository: folder, branch and repository", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "C:\\Users\\APPLE\\Downloads\\PawOS", branch: "main", local: { kind: "github", fullName: "RevantaAIproduction/Pawos", remote: "origin" } });
    h.server.readiness = { state: "ready", repository: { fullName: "RevantaAIproduction/Pawos", defaultBranch: "main" }, scope: "full" };
    h.server.name = "Tharun Esta";
    await runCli([], h.ctx);
    expect(h.output().split("\n").slice(0, 13)).toEqual(["", "  PawOS v0.1.0", "  AI Developer Workspace", "", "  Good morning, Tharun.", "", "  C:\\Users\\APPLE\\Downloads\\PawOS", "  Git: main", "  Repository: RevantaAIproduction/Pawos", "", `  ${RULE}`, "", `  ${QUESTION}`]);
  });

  it("a detached HEAD has no Git line", async () => {
    const h = start({ signedIn: true, answers: [null], branch: null });
    await runCli([], h.ctx);
    expect(h.output()).not.toContain("Git:");
    expect(h.output()).toContain("  Repository: acme/site");
  });

  it("signed-out startup: sign-in first, then the same greeting and workspace", async () => {
    const h = start({ answers: [completionUrl(), null], cwd: HOME, local: NOT_GIT });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output.slice(output.indexOf("  ✓ Signed in as"))).toBe(["  ✓ Signed in as alice@example.com", "", "  PawOS v0.1.0", "  AI Developer Workspace", "", "  Good morning, Alice.", "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n"));
  });

  it("a session that has ended: sign in again, then the header — shown once", async () => {
    const h = start({ signedIn: true, answers: [completionUrl(), null] });
    h.server.validRefresh.clear();
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output().split("AI Developer Workspace").length - 1).toBe(1);
    expect(h.output()).toContain("Good morning, Alice.");
  });

  it("the header shows no email address, token or other account detail", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true });
    await runAnimated(h);
    const screen = h.raw();
    for (const secret of [ALICE.email, "@", "access-", "refresh-", "Bearer", ".jwt.", "Paw Pro", "Example"]) expect(stripAnsi(screen).slice(0, stripAnsi(screen).indexOf(RULE))).not.toContain(secret);
  });
});

describe("the wordmark animation", () => {
  const frames = introFrames("0.1.0", true).map((frame) => plain([frame]));

  it("is the PawOS wordmark itself: it builds letter by letter and settles into the header line", () => {
    expect(frames.slice(0, 5)).toEqual(["  P····", "  Pa···", "  Paw··", "  PawO·", "  PawOS"]);
    expect(frames.slice(5, 10).every((frame) => frame === "  PawOS")).toBe(true); // the highlight passing: same letters
    expect(frames.at(-1)).toBe("  PawOS v0.1.0");
    // One line each, nothing but the wordmark, its dots and the version: no logo, no art, no emoji.
    for (const frame of frames) expect(frame).toMatch(/^ {2}[PawOS·]{5}( v0\.1\.0)?$/);
    expect(introFrames("0.1.0", false).map((frame) => plain([frame]))[0]).toBe("  P....");
  });

  it("lights one letter at a time", () => {
    const lit = introFrames("0.1.0", true).map((frame) => frame.filter((part) => part.tone === "accent").map((part) => part.text).join(""));
    expect(lit.slice(0, 10)).toEqual([...WORDMARK, ...WORDMARK]);
    expect(lit.slice(10)).toEqual(["", "", ""]);
  });

  it("lasts about a second", () => {
    const duration = (frames.length - 1) * INTRO_FRAME_MS;
    expect(duration).toBeGreaterThanOrEqual(700);
    expect(duration).toBeLessThanOrEqual(1200);
  });

  it("the version comes from the running build, not from the animation", () => {
    expect(plain([introFrames("9.8.7", true).at(-1)!])).toBe("  PawOS v9.8.7");
  });

  it("animation enabled in an interactive terminal: frames are drawn in place, then the clean header", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true, cwd: HOME, local: NOT_GIT });
    expect(await runAnimated(h)).toBe(0);
    const raw = h.raw();
    const seen = stripAnsi(raw);
    for (const frame of ["  P····", "  Pa···", "  Paw··", "  PawO·"]) expect(seen).toContain(frame);
    // What is left on screen once the frames have been erased is exactly the static startup.
    expect(seen.slice(seen.lastIndexOf("  PawOS v0.1.0"))).toBe(["  PawOS v0.1.0", "  AI Developer Workspace", "", "  Good morning, Alice.", "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n"));
    expect(seen.split("AI Developer Workspace").length - 1).toBe(1);
  });

  it("writes only its own line: no screen clear, no jump, and the cursor never moves up more than one line", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true });
    await runAnimated(h);
    const raw = h.raw();
    for (const forbidden of [`${ESC}[2J`, `${ESC}[H`, `${ESC}c`, `${ESC}[3J`]) expect(raw).not.toContain(forbidden);
    const intro = raw.slice(0, raw.indexOf("AI Developer Workspace"));
    const ups = [...intro.matchAll(/\[(\d+)A/g)].map((match) => Number(match[1]));
    expect(ups.length).toBeGreaterThan(5);
    expect(Math.max(...ups)).toBe(1);
    expect(intro.split(`${ESC}[?25l`).length - 1).toBe(1); // cursor hidden once…
    expect(intro.split(`${ESC}[?25h`).length - 1).toBe(1); // …and given back before the header
  });

  it("runs once: no timer is left behind, and nothing animates the header afterwards", async () => {
    const h = start({ signedIn: true, answers: ["/help", null], caps: LIVE_TERMINAL, intro: true });
    await runAnimated(h);
    expect(h.timers.active).toBe(0);
    const seen = stripAnsi(h.raw());
    expect(seen.split("  P····").length - 1).toBe(1);
  });

  it("does not interfere with the prompt: the question and the > come after the animation has ended", async () => {
    const h = start({ signedIn: true, answers: ["hello", null], caps: LIVE_TERMINAL, intro: true, cwd: HOME, local: NOT_GIT });
    expect(await runAnimated(h)).toBe(0);
    const raw = h.raw();
    expect(raw.indexOf(QUESTION)).toBeGreaterThan(raw.lastIndexOf("P····"));
    expect(raw.indexOf(QUESTION)).toBeGreaterThan(raw.indexOf(`${ESC}[?25h`));
    expect(h.server.chats()).toHaveLength(1);
  });

  it("non-TTY: no frames at all — a script or a test sees only the static header", async () => {
    const h = start({ signedIn: true, answers: [null], caps: STATIC_TERMINAL, intro: true, cwd: HOME, local: NOT_GIT });
    expect(await runCli([], h.ctx)).toBe(0); // nothing has to move any timer along
    expect(h.raw()).not.toContain(ESC);
    expect(h.raw()).not.toContain("·");
    expect(h.timers.active + h.timers.cleared).toBe(0);
    expect(h.output().split("\n").slice(0, 5)).toEqual(["", "  PawOS v0.1.0", "  AI Developer Workspace", "", "  Good morning, Alice."]);
  });

  it("fallback: with the animation unavailable the startup is the same, on any kind of terminal", async () => {
    const outputs = [];
    for (const options of [{ caps: STATIC_TERMINAL }, { caps: { ...LIVE_TERMINAL, color: false, hyperlinks: false } }, { caps: { ...LIVE_TERMINAL, color: false, hyperlinks: false }, intro: true }]) {
      const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT, ...options });
      expect(await runAnimated(h)).toBe(0);
      const seen = stripAnsi(h.raw());
      outputs.push(seen.slice(seen.lastIndexOf("  PawOS v0.1.0")));
    }
    expect(outputs[1]).toBe(outputs[0]);
    expect(outputs[2]).toBe(outputs[0]);
  });

  it("plain ASCII terminals get an ASCII wordmark and header", async () => {
    const h = start({ signedIn: true, answers: [null], caps: { ...LIVE_TERMINAL, unicode: false }, intro: true });
    await runAnimated(h);
    expect(stripAnsi(h.raw())).toMatch(/^[\x20-\x7e\r\n]*$/);
    expect(stripAnsi(h.raw())).toContain("  P....");
  });

  it("startup is stable when PawOS can't be reached: the animation ends, the line is handed back, the error is shown", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true });
    h.server.capabilitiesAnswer = new Error("getaddrinfo ENOTFOUND");
    expect(await runAnimated(h)).toBe(1);
    expect(h.timers.active).toBe(0);
    const raw = h.raw();
    expect(raw.lastIndexOf(`${ESC}[?25h`)).toBeGreaterThan(raw.lastIndexOf(`${ESC}[?25l`)); // the cursor is back
    expect(stripAnsi(raw)).toContain("  Welcome back.");
    expect(stripAnsi(raw)).not.toContain("ENOTFOUND");
  });

  it("the animation never waits on its own: with nothing to draw it is finished at once", async () => {
    const h = start({ caps: STATIC_TERMINAL });
    const intro = new StartupIntro(h.ctx.term, "0.1.0", h.timers);
    intro.start();
    await intro.finished;
    intro.stop();
    expect(intro.animated).toBe(false);
    expect(h.raw()).toBe("");

    const live = start({ caps: LIVE_TERMINAL });
    const stopped = new StartupIntro(live.ctx.term, "0.1.0", live.timers);
    stopped.start();
    stopped.stop(); // cut short, e.g. by an error: it still settles and cleans up
    await stopped.finished;
    expect(live.timers.active).toBe(0);
  });
});
