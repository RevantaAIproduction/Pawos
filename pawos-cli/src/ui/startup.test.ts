import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { QUESTION } from "../commands/interactive";
import { ALICE, CAPABILITIES, HANDOFF, LIVE_TERMINAL, STATIC_TERMINAL, completionUrl, harness, reply, stripAnsi } from "../testing/harness";
import { IDLE_PULSE_FRAMES, INTRO_FRAME_MS, INTRO_HEIGHT, StartupIntro, firstName, greeting, idleFrame, introFrames, mascot, mascotHeader, timeOfDay } from "./intro";
import { MAX_RECENT, ago, recentWork, renderRecent } from "./recent";
import { detectCapabilities, plain } from "./terminal";

/**
 * The start of a PawOS session: the mascot waking up, the greeting, and where the user is. The
 * animation is five lines, drawn in place, once; a terminal that can't redraw gets no frames.
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
/** The greeting: it stands beside the foot of the mascot, on the fifth line. */
const greetingLine = (text: string) => (text.split("\n")[4] ?? "").replace(/^ {2}└─────┘ {3}/, "  ");

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
    // Capabilities (which carry the name), the repository, and the account's previous work — nothing just for the name.
    expect(paths.sort()).toEqual(["GET /api/web-chat/chats", "GET /api/web/capabilities", "GET /api/web/github/repository"]);
  });
});

describe("startup order and project context", () => {
  it("non-Git directory: title, greeting, folder, rule, question, prompt", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.output()).toBe(["", "     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘   Good morning, Alice.", "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n"));
    expect(h.prompter.prompts).toEqual(["  > "]); // the > is the real input prompt
  });

  it("Git directory without a GitHub remote: folder and branch", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "/home/dev/notes", branch: "drafts", local: { kind: "noRemote" } });
    await runCli([], h.ctx);
    expect(h.output().split("\n").slice(0, 9)).toEqual(["", "     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘   Good morning, Alice.", "", "  /home/dev/notes", "  Git: drafts", ""]);
    expect(h.output()).not.toContain("Repository:");
  });

  it("Git + GitHub repository: folder, branch and repository", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "C:\\Users\\APPLE\\Downloads\\PawOS", branch: "main", local: { kind: "github", fullName: "RevantaAIproduction/Pawos", remote: "origin" } });
    h.server.readiness = { state: "ready", repository: { fullName: "RevantaAIproduction/Pawos", defaultBranch: "main" }, scope: "full" };
    h.server.name = "Tharun Esta";
    await runCli([], h.ctx);
    expect(h.output().split("\n").slice(0, 13)).toEqual(["", "     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘   Good morning, Tharun.", "", "  C:\\Users\\APPLE\\Downloads\\PawOS", "  Git: main", "  Repository: RevantaAIproduction/Pawos", "", `  ${RULE}`, "", `  ${QUESTION}`]);
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
    expect(output.slice(output.indexOf("  ✓ Signed in as"))).toBe(["  ✓ Signed in as alice@example.com", "", "     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘   Good morning, Alice.", "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n"));
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

describe("the mascot", () => {
  const frames = introFrames("0.1.0", true);
  const text = (frame: (typeof frames)[number]) => plain(frame);
  const HEADER = ["     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘   Good morning, Alice."];
  const SCREEN = ["", ...HEADER, "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n");
  const RED = `${ESC}[91m`;

  it("is the PawOS companion: a small robot with an antenna and a visor, beside the PawOS name", () => {
    expect(plain(mascotHeader("0.1.0", "Good morning, Alice.", true))).toBe(HEADER.join("\n"));
    expect(plain(mascot({ eyes: "open", lit: false }, true))).toBe(["   ○", "┌──┴──┐", "│ ● ● │", "└─────┘"].join("\n"));
    // Text only: no emoji, no image, nothing from another product.
    for (const frame of frames) expect(text(frame)).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("stays: it is part of the start screen itself, not something that plays and disappears", async () => {
    const h = start({ signedIn: true, answers: ["hii", "/help", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    // Still there, once, above everything that followed.
    expect(h.output().startsWith(["", ...HEADER, ""].join("\n"))).toBe(true);
    expect(h.output().split("┌──┴──┐").length - 1).toBe(1);
    expect(h.output().indexOf("┌──┴──┐")).toBeLessThan(h.output().indexOf(QUESTION));
  });

  it("is red: the head and its lit antenna are drawn in PawOS red wherever the terminal has colour", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT, caps: { ...LIVE_TERMINAL, hyperlinks: false } });
    await runCli([], h.ctx);
    const raw = h.raw();
    for (const part of ["●", "┌──┴──┐", "│ ", " │", "└─────┘"]) expect(raw).toContain(`${RED}${part}${ESC}[0m`);
    for (const row of mascot({ eyes: "happy", lit: true }, true)) expect(row.filter((part) => part.text.trim() && part.tone !== "strong").every((part) => part.tone === "brand")).toBe(true);
    // Only the mascot is red: the name, the greeting and the folder are not.
    expect(raw).not.toContain(`${RED}PawOS`);
    expect(raw).not.toContain(`${RED}Good morning`);
    // Without colour it is the same mascot in plain characters.
    const mono = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    await runCli([], mono.ctx);
    expect(mono.raw()).not.toContain(ESC);
    expect(mono.output()).toBe(SCREEN);
  });

  it("is really animated: it opens its eyes, bounces, blinks and settles — it is not one picture held still", () => {
    const all = frames.map(text);
    expect(new Set(all).size).toBeGreaterThanOrEqual(8); // many different frames, not one
    const eyes = frames.map((frame) => frame.filter((row) => plain([row]).includes("│")).flatMap((row) => row.filter((part) => part.tone === "strong" && part.text.length === 1).map((part) => part.text)).join(""));
    expect(eyes[0]).toBe("──"); // asleep
    expect(eyes).toContain("●●"); // awake
    expect(eyes.indexOf("──", eyes.indexOf("●●"))).toBeGreaterThan(0); // a blink after waking
    expect(eyes.at(-1)).toBe("^^"); // settled, happy
    // It moves: the body is sometimes one line higher (a bounce), and comes back down.
    const top = all.map((frame) => frame.split("\n").findIndex((row) => row.includes("┌──┴──┐")));
    expect(new Set(top)).toEqual(new Set([1, 2]));
    expect(top.at(-1)).toBe(2);
    expect(top.filter((row, index) => index > 0 && row !== top[index - 1]).length).toBeGreaterThanOrEqual(4);
    // And its antenna light pulses.
    expect(all.some((frame) => frame.includes("○"))).toBe(true);
    expect(all.some((frame) => /^\s+●$/m.test(frame))).toBe(true);
  });

  it("settles exactly where it will stay: the last frame is the header, minus the greeting", () => {
    expect(text(frames.at(-1)!)).toBe(["", "     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘"].join("\n"));
    expect(plain(introFrames("9.8.7", true).at(-1)!)).toContain("PawOS v9.8.7"); // the running build's version
  });

  it("stays inside its own five lines while it animates, so nothing above or below it moves", () => {
    for (const frame of frames) expect(frame).toHaveLength(INTRO_HEIGHT);
    for (const frame of frames) for (const row of text(frame).split("\n")) expect([...row].length).toBeLessThanOrEqual(40);
  });

  it("wakes up in between one and two seconds", () => {
    const duration = (frames.length - 1) * INTRO_FRAME_MS;
    expect(duration).toBeGreaterThanOrEqual(1000);
    expect(duration).toBeLessThanOrEqual(2000);
  });

  it("has a plain-ASCII form for the classic Windows console, and it animates just the same", () => {
    const ascii = introFrames("0.1.0", false).map(text);
    expect(ascii.at(-1)).toBe(["", "     *", "  .--+--.   PawOS v0.1.0", "  | ^ ^ |   AI Developer Workspace", "  '-----'"].join("\n"));
    expect(plain(mascotHeader("0.1.0", "Welcome back.", false))).toBe(["     *", "  .--+--.   PawOS v0.1.0", "  | ^ ^ |   AI Developer Workspace", "  '-----'   Welcome back."].join("\n"));
    for (const frame of ascii) expect(frame).toMatch(/^[\x20-\x7e\n]*$/);
    expect(new Set(ascii).size).toBeGreaterThanOrEqual(8);
    expect(ascii[0]).toContain("| - - |");
    expect(ascii.some((frame) => frame.includes("| o o |"))).toBe(true);
  });

  it("animation enabled in an interactive terminal: it wakes up in place, and the header is printed right where it stood", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true, cwd: HOME, local: NOT_GIT });
    expect(await runAnimated(h)).toBe(0);
    const raw = h.raw();
    const seen = stripAnsi(raw);
    for (const row of ["│ ─ ─ │", "│ ● ● │", "│ ^ ^ │"]) expect(seen).toContain(row);
    // The animation's five lines are handed back, and the same mascot is printed in them — it does not vanish.
    const handedBack = raw.lastIndexOf(`${ESC}[${INTRO_HEIGHT}A\r${ESC}[0J`);
    expect(handedBack).toBeGreaterThan(0);
    expect(stripAnsi(raw.slice(handedBack + 9)).replace(/^\r?/, "")).toBe(SCREEN);
    expect(seen.split("Good morning, Alice.").length - 1).toBe(1);
  });

  it("writes only its own area: no screen clear, no jump, and the cursor never moves up past it", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true });
    await runAnimated(h);
    const raw = h.raw();
    for (const forbidden of [`${ESC}[2J`, `${ESC}[H`, `${ESC}c`, `${ESC}[3J`]) expect(raw).not.toContain(forbidden);
    const intro = raw.slice(0, raw.indexOf("Good morning"));
    const ups = [...intro.matchAll(/\[(\d+)A/g)].map((match) => Number(match[1]));
    expect(ups.length).toBeGreaterThan(8);
    expect(Math.max(...ups)).toBe(INTRO_HEIGHT);
    expect(intro.split(`${ESC}[?25l`).length - 1).toBe(1); // cursor hidden once…
    expect(intro.split(`${ESC}[?25h`).length - 1).toBe(1); // …and given back before the header
  });

  it("does not flicker: between frames only the lines that changed are rewritten", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true });
    await runAnimated(h);
    const intro = h.raw().slice(0, h.raw().indexOf("Good morning"));
    const rewrites = intro.split(`${ESC}[2K`).length - 1;
    expect(rewrites).toBeLessThan(frames.length * INTRO_HEIGHT); // unchanged lines were stepped over
    expect(intro.split(`${ESC}[1B`).length - 1).toBeGreaterThan(5);
  });

  it("animates once: no timer is left behind, and after it settles the mascot stands still", async () => {
    const h = start({ signedIn: true, answers: ["/help", null], caps: LIVE_TERMINAL, intro: true });
    await runAnimated(h);
    expect(h.timers.active).toBe(0);
    const raw = h.raw();
    const after = raw.slice(raw.indexOf("Good morning"));
    expect(after).not.toMatch(/[┌└]/); // it is never drawn again further down
    expect(stripAnsi(after)).not.toMatch(/│ [─●] [─●] │/);
  });

  it("does not interfere with the prompt: the question and the > come after the animation has ended", async () => {
    const h = start({ signedIn: true, answers: ["hello", null], caps: LIVE_TERMINAL, intro: true, cwd: HOME, local: NOT_GIT });
    expect(await runAnimated(h)).toBe(0);
    const raw = h.raw();
    expect(raw.indexOf(QUESTION)).toBeGreaterThan(raw.lastIndexOf("┌──┴──┐"));
    expect(raw.indexOf(QUESTION)).toBeGreaterThan(raw.indexOf(`${ESC}[?25h`));
    expect(h.server.chats()).toHaveLength(1);
  });

  it("non-TTY: no frames — a script or a test sees the settled mascot and the static header, nothing else", async () => {
    const h = start({ signedIn: true, answers: [null], caps: STATIC_TERMINAL, intro: true, cwd: HOME, local: NOT_GIT });
    expect(await runCli([], h.ctx)).toBe(0); // nothing has to move any timer along
    expect(h.raw()).not.toContain(ESC);
    expect(h.raw()).not.toMatch(/│ [─●] [─●] │/); // no sleeping or waking frames
    expect(h.timers.active + h.timers.cleared).toBe(0);
    expect(h.output()).toBe(SCREEN);
  });

  it("PAWOS_NO_ANIMATION, CI and TERM=dumb each switch the animation off: the mascot is printed settled", async () => {
    const tty = { isTTY: true, columns: 100 };
    expect(detectCapabilities(tty, { TERM: "xterm" }).interactive).toBe(true);
    for (const env of [{ TERM: "xterm", PAWOS_NO_ANIMATION: "1" }, { TERM: "xterm", CI: "true" }, { TERM: "dumb" }]) {
      const caps = detectCapabilities(tty, env);
      expect(caps.interactive).toBe(false);
      const h = start({ signedIn: true, answers: [null], caps, intro: true, cwd: HOME, local: NOT_GIT });
      expect(await runCli([], h.ctx)).toBe(0);
      expect(h.raw()).not.toMatch(/\[\d+A/); // nothing is redrawn in place
      expect(h.timers.active + h.timers.cleared).toBe(0);
      const seen = stripAnsi(h.raw());
      expect(seen).toMatch(/[│|] \^ \^ [│|] {3}AI Developer Workspace/); // the mascot is there, settled
      expect(seen).not.toMatch(/[│|] [─●o-] [─●o-] [│|]/);
      expect(seen).toContain("Good morning, Alice.");
    }
    expect(detectCapabilities({ isTTY: false }, { TERM: "xterm" }).interactive).toBe(false);
  });

  it("with or without the animation, what is left on screen is the same", async () => {
    const outputs = [];
    for (const options of [{ caps: STATIC_TERMINAL }, { caps: { ...LIVE_TERMINAL, color: false, hyperlinks: false } }, { caps: { ...LIVE_TERMINAL, color: false, hyperlinks: false }, intro: true }]) {
      const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT, ...options });
      expect(await runAnimated(h)).toBe(0);
      const seen = stripAnsi(h.raw());
      outputs.push(seen.slice(seen.lastIndexOf("  ┌──┴──┐   PawOS v0.1.0")));
    }
    expect(outputs[1]).toBe(outputs[0]);
    expect(outputs[2]).toBe(outputs[0]);
  });

  it("on a terminal without the box characters the whole startup is plain ASCII", async () => {
    const h = start({ signedIn: true, answers: [null], caps: { ...LIVE_TERMINAL, unicode: false }, intro: true });
    await runAnimated(h);
    expect(stripAnsi(h.raw())).toMatch(/^[\x20-\x7e\r\n]*$/);
    expect(stripAnsi(h.raw())).toContain("| o o |");
    expect(stripAnsi(h.raw())).toContain("'-----'   Good morning, Alice.");
  });

  it("startup is stable when PawOS can't be reached: the animation ends, the mascot and the error are shown, the cursor is back", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true });
    h.server.capabilitiesAnswer = new Error("getaddrinfo ENOTFOUND");
    expect(await runAnimated(h)).toBe(1);
    expect(h.timers.active).toBe(0);
    const raw = h.raw();
    expect(raw.lastIndexOf(`${ESC}[?25h`)).toBeGreaterThan(raw.lastIndexOf(`${ESC}[?25l`)); // the cursor is back
    expect(stripAnsi(raw)).toContain("  └─────┘   Welcome back.");
    expect(stripAnsi(raw)).not.toContain("ENOTFOUND");
  });

  it("if PawOS is still loading when the animation ends, the mascot waits with its antenna light pulsing — it is never frozen", async () => {
    const h = start({ caps: { ...LIVE_TERMINAL, color: false, hyperlinks: false } });
    const intro = new StartupIntro(h.ctx.term, "0.1.0", h.timers);
    intro.start();
    h.timers.tick(frames.length - 1);
    await intro.finished; // the animation proper is over…
    const before = h.raw().length;
    h.timers.tick(IDLE_PULSE_FRAMES * 4); // …and PawOS still hasn't answered
    const waiting = h.raw().slice(before);
    expect(waiting).toContain("○"); // the light went off
    expect(waiting).toContain("●"); // and came back on
    expect(waiting).not.toContain("┌"); // only the antenna's line was redrawn: the rest stood still
    expect(plain(idleFrame(false, "0.1.0", true))).toBe(text(frames.at(-1)!).replace("●", "○"));
    intro.stop();
    expect(h.timers.active).toBe(0);
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

/** The right-hand column of the start screen's box, line by line (empty when there is no box). */
function recentColumn(screen: string): string[] {
  const lines = screen.split("\n");
  const top = lines.findIndex((text) => /^[┌+]/.test(text) && /[┬+]/.test(text.slice(1, -1)));
  if (top < 0) return [];
  const divider = [...lines[top]!].findIndex((char, index) => index > 0 && (char === "┬" || char === "+"));
  const bottom = lines.findIndex((text, index) => index > top && /^[└+]/.test(text));
  return lines.slice(top + 1, bottom).map((text) => [...text].slice(divider + 1, -1).join("").trim()).filter(Boolean);
}

describe("recent activity: two start screens", () => {
  const NOW = at(9); // 2026-10-08 09:00 on this computer
  const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
  const chat = (title: string, minutes: number, surface: "web" | "desktop" = "web") => ({ id: `chat-${minutes}`, title, updatedAt: before(minutes), surface });
  const FIRST_SCREEN = ["", "     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘   Good morning, Alice.", "", `  ${HOME}`, "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  > ", "", ""].join("\n");

  it("first launch, no previous work: no Recent activity panel, no heading, no empty box — the screen is unchanged", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toBe(FIRST_SCREEN);
    expect(h.output()).not.toMatch(/recent|activity|no previous|nothing yet/i);
  });

  it("returning user with real previous work: one box, the mascot on the left and recent activity on its right", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "C:\\Users\\APPLE\\Downloads\\PawOS", branch: "main", local: { kind: "github", fullName: "acme/site", remote: "origin" } });
    h.server.previousChats = [chat("Rename the heading to Welcome", 60 * 26), chat("Fix the discount calculation", 125), chat("Plan the billing migration", 60 * 24 * 4, "desktop")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output().split("\n").slice(0, 14)).toEqual([
      "┌───────────────────────────────────┬─────────────────────────────────────────────────┐",
      "│    ●                              │ Recent activity                                 │",
      "│ ┌──┴──┐   PawOS v0.1.0            │ 2h ago            Fix the discount calculation  │",
      "│ │ ^ ^ │   AI Developer Workspace  │ yesterday         Rename the heading to Welcome │",
      "│ └─────┘   Good morning, Alice.    │ 4d ago (Desktop)  Plan the billing migration    │",
      "│                                   │ /resume to open one                             │",
      "└───────────────────────────────────┴─────────────────────────────────────────────────┘",
      "",
      "  C:\\Users\\APPLE\\Downloads\\PawOS",
      "  Git: main",
      "  Repository: acme/site",
      "",
      `  ${RULE}`,
      "",
    ]);
    expect(recentColumn(h.output())).toEqual(["Recent activity", "2h ago            Fix the discount calculation", "yesterday         Rename the heading to Welcome", "4d ago (Desktop)  Plan the billing migration", "/resume to open one"]);
    // Every line of the box is the same width, and the mascot inside it is in the columns it was animated in.
    const box = h.output().split("\n").slice(0, 7);
    expect(new Set(box.map((text) => [...text].length)).size).toBe(1);
    expect(box[2]!.indexOf("┌──┴──┐")).toBe(2);
  });

  it("the box is only there when there is recent work: with none the screen is the mascot and the header, with no box and no gap", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.output()).toBe(FIRST_SCREEN);
    expect(h.output()).not.toMatch(/Recent|\/resume/);
    expect(h.output().split("\n").some((text) => /^[┌│└+|]/.test(text))).toBe(false); // nothing is drawn at the left edge: no box
    expect(recentColumn(h.output())).toEqual([]);
  });

  it("the classic Windows console gets the same box in plain ASCII", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT, caps: { ...STATIC_TERMINAL, unicode: false } });
    h.server.previousChats = [chat("Fix the discount calculation", 125), chat("Plan the billing migration", 60 * 24 * 4, "desktop")];
    await runCli([], h.ctx);
    expect(h.output()).toMatch(/^[\x20-\x7e\n]*$/);
    expect(h.output().split("\n").slice(0, 6)).toEqual([
      "+-----------------------------------+------------------------------------------------+",
      "|    *                              | Recent activity                                |",
      "| .--+--.   PawOS v0.1.0            | 2h ago            Fix the discount calculation |",
      "| | ^ ^ |   AI Developer Workspace  | 4d ago (Desktop)  Plan the billing migration   |",
      "| '-----'   Good morning, Alice.    | /resume to open one                            |",
      "+-----------------------------------+------------------------------------------------+",
    ]);
    expect(recentColumn(h.output())).toContain("4d ago (Desktop)  Plan the billing migration");
  });

  it("a terminal too narrow for the box shows the same things without one", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT, caps: { ...STATIC_TERMINAL, columns: 60 } });
    h.server.previousChats = [chat("Fix the discount calculation", 125)];
    await runCli([], h.ctx);
    expect(h.output().split("\n").some((text) => /^[┌│└]/.test(text))).toBe(false);
    expect(h.output()).toContain(["", "     ●", "  ┌──┴──┐   PawOS v0.1.0"].join("\n"));
    expect(h.output()).toContain(["  Recent activity", "    2h ago  Fix the discount calculation", "    /resume to open one", ""].join("\n"));
  });

  it("the box never runs past the edge of the terminal: a long title is cut to fit", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT, caps: { ...STATIC_TERMINAL, columns: 80 } });
    h.server.previousChats = [chat("Plan the billing migration for the enterprise customers next quarter", 5)];
    await runCli([], h.ctx);
    const box = h.output().split("\n").slice(0, 6);
    for (const text of box) expect([...text].length).toBeLessThanOrEqual(79);
    expect(new Set(box.map((text) => [...text].length)).size).toBe(1);
    expect(recentColumn(h.output())[1]).toMatch(/^5m ago {2}Plan the billing migration.*…$/);
  });

  it("is compact: the three most recent only, however much history there is", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    h.server.previousChats = Array.from({ length: 40 }, (_, i) => chat(`Task number ${i}`, 10 + i * 30));
    await runCli([], h.ctx);
    expect(recentColumn(h.output())).toEqual(["Recent activity", "10m ago  Task number 0", "40m ago  Task number 1", "1h ago   Task number 2", "/resume to open one"]);
    expect(MAX_RECENT).toBe(3);
  });

  it("shows only what PawOS lists: the list is asked for once, as PawOS opens, from the existing chats endpoint", async () => {
    const h = start({ signedIn: true, answers: ["/status", "/help", null], cwd: HOME, local: NOT_GIT });
    h.server.previousChats = [chat("Fix the discount calculation", 30)];
    await runCli([], h.ctx);
    const asked = h.server.calls.filter((call) => call.path === "/api/web-chat/chats");
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ method: "GET", body: null });
    expect(asked[0]!.authorization).toMatch(/^Bearer /);
    expect(h.output().split("Recent activity").length - 1).toBe(1);
  });

  it("opening PawOS, signing in and /status are not work: after them there is still no panel", async () => {
    // A new account signs in, looks at /status and /connections, and leaves…
    const first = start({ answers: [completionUrl(), "/status", "/connections", null], cwd: HOME, local: NOT_GIT });
    first.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli([], first.ctx)).toBe(0);
    expect(first.output()).not.toContain("Recent activity");
    // …and PawOS was never sent anything that would create work.
    expect(first.server.calls.filter((call) => call.method !== "GET" && !call.path.startsWith("/api/auth/device/"))).toHaveLength(0);
    // The next time they open PawOS, PawOS still lists nothing — so the first screen is still the first screen.
    const second = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    expect(await runCli([], second.ctx)).toBe(0);
    expect(second.output()).toBe(FIRST_SCREEN);
  });

  it("work done in this run does not appear in this run's panel — it is previous work only", async () => {
    const h = start({ signedIn: true, answers: ["explain closures", "/status", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.server.chats()).toHaveLength(1); // a message was really sent
    expect(h.output()).not.toContain("Recent activity");
  });

  it("if PawOS can't list previous work, PawOS still opens — with no panel", async () => {
    for (const answer of [reply({ code: "failed", message: "Could not load your chats." }, 500), new Error("socket hang up"), reply({ chats: "soon" }), reply({ chats: null }), reply({})]) {
      const h = start({ signedIn: true, answers: ["hello", null], cwd: HOME, local: NOT_GIT });
      h.server.chatsAnswer = answer;
      expect(await runCli([], h.ctx)).toBe(0);
      expect(h.output()).not.toContain("Recent activity");
      expect(h.output()).not.toMatch(/Could not load|socket hang up/);
      expect(h.output().slice(0, FIRST_SCREEN.indexOf("  > "))).toBe(FIRST_SCREEN.slice(0, FIRST_SCREEN.indexOf("  > ")));
      expect(h.server.chats()).toHaveLength(1);
    }
  });

  it("entries that aren't real work are dropped; if none are left there is no panel", async () => {
    const junk = [null, 7, "chat", {}, { title: "", updatedAt: before(5) }, { title: "   ", updatedAt: before(5) }, { title: "No time" }, { title: "Bad time", updatedAt: "soon" }, { title: 42, updatedAt: before(5) }];
    const none = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    none.server.previousChats = junk;
    await runCli([], none.ctx);
    expect(none.output()).toBe(FIRST_SCREEN);

    const some = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    some.server.previousChats = [...junk, chat("Fix the login redirect", 3)];
    await runCli([], some.ctx);
    expect(recentColumn(some.output())).toEqual(["Recent activity", "3m ago  Fix the login redirect", "/resume to open one"]);
  });

  it("a title can't inject control sequences, and a long one is cut", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    h.server.previousChats = [chat(`Fix${ESC}[2J the ${ESC}]8;;https://evil.example${ESC}\\link`, 5), chat("x".repeat(300), 6)];
    await runCli([], h.ctx);
    expect(h.raw()).not.toContain(ESC);
    const lines = recentColumn(h.output());
    expect(lines[1]).toBe("5m ago  Fix[2J the ]8;;https://evil.example\\link");
    expect(lines[2]).toMatch(/^6m ago {2}x+…?$/);
    expect([...lines[2]!].length).toBeLessThanOrEqual(8 + 70);
  });

  it("the panel carries no account detail: no ids, email, tokens or raw fields", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    h.server.previousChats = [{ ...chat("Fix the discount calculation", 30), user_id: "user-123", email: ALICE.email, token: "secret-token" }];
    await runCli([], h.ctx);
    const panel = h.output().slice(0, h.output().indexOf(`  ${RULE}`));
    for (const secret of ["chat-30", "user-123", ALICE.email, "secret-token", "updatedAt", "surface", "access-", "refresh-"]) expect(panel).not.toContain(secret);
  });

  it("with the mascot animation: frames first, then the header and the panel, once", async () => {
    const h = start({ signedIn: true, answers: [null], caps: LIVE_TERMINAL, intro: true, cwd: HOME, local: NOT_GIT });
    h.server.previousChats = [chat("Fix the discount calculation", 125)];
    expect(await runAnimated(h)).toBe(0);
    const seen = stripAnsi(h.raw());
    expect(seen).toContain("│ ● ● │");
    // The animation's lines are handed back and the box is drawn in them: its top edge where the blank line was, the mascot where it stood.
    const handedBack = h.raw().lastIndexOf(`${ESC}[${INTRO_HEIGHT}A\r${ESC}[0J`);
    const after = stripAnsi(h.raw().slice(handedBack + 9)).replace(/^\r?/, "").split("\n");
    expect(after[0]).toMatch(/^┌─+┬─+┐$/);
    expect(after.slice(1, 5).map((text) => text.slice(0, 36))).toEqual(["│    ●                              ", "│ ┌──┴──┐   PawOS v0.1.0            ", "│ │ ^ ^ │   AI Developer Workspace  ", "│ └─────┘   Good morning, Alice.    "]);
    expect(recentColumn(after.join("\n"))).toEqual(["Recent activity", "2h ago  Fix the discount calculation", "/resume to open one"]);
    expect(seen.split("Recent activity").length - 1).toBe(1);
    expect(h.timers.active).toBe(0);
  });

  it("after signing in again in the same run, the returning user's work is still shown", async () => {
    const h = start({ answers: [completionUrl(), null], cwd: HOME, local: NOT_GIT });
    h.server.handoffs.set(HANDOFF, "valid");
    h.server.previousChats = [chat("Fix the discount calculation", 125)];
    await runCli([], h.ctx);
    expect(recentColumn(h.output())).toEqual(["Recent activity", "2h ago  Fix the discount calculation", "/resume to open one"]);
  });

  it("is live data only: every row is a conversation PawOS returned in this run — nothing is built in, remembered or made up", async () => {
    // Whatever PawOS returns is what is shown, word for word…
    const titles = ["Zebra crossing audit 7731", "Qx-4410 unusual title", "Third real one 90210"];
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    h.server.previousChats = titles.map((title, index) => chat(title, 5 + index));
    await runCli([], h.ctx);
    expect(recentColumn(h.output()).slice(1, -1).map((row) => row.replace(/^\S+ ago\s+/, ""))).toEqual(titles);
    // …a different account's screen shares nothing with it…
    const other = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    other.server.previousChats = [chat("Only this one", 1)];
    await runCli([], other.ctx);
    expect(recentColumn(other.output())).toEqual(["Recent activity", "1m ago  Only this one", "/resume to open one"]);
    for (const title of titles) expect(other.output()).not.toContain(title);
    // …nothing is kept on this computer to show next time…
    for (const run of [h, other]) expect(fs.readdirSync(run.directory).filter((name) => /recent|history|chat/i.test(name))).toEqual([]);
    // …and the CLI's own code contains no sample history at all.
    const root = path.join(__dirname, "..");
    for (const file of fs.readdirSync(root, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.includes("testing"))) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/previousChats|sampleHistory|placeholder|demo(Chats|History)|mock(Chats|History)|updatedAt:\s*["'`]/i);
      expect(source).not.toMatch(/\d+[mhd] ago["'`]/); // no ready-made "2h ago" rows
    }
  });

  it("says how long ago in a few characters, and never a time in the future", () => {
    const from = (minutes: number) => ago(new Date(NOW.getTime() - minutes * 60_000), NOW);
    expect([0, 1, 59, 60, 23 * 60 + 59, 24 * 60, 47 * 60, 48 * 60, 29 * 24 * 60].map(from)).toEqual(["just now", "1m ago", "59m ago", "1h ago", "23h ago", "yesterday", "yesterday", "2d ago", "29d ago"]);
    expect(from(-500)).toBe("just now");
    expect(from(60 * 24 * 45)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("with nothing to show it renders nothing at all", () => {
    for (const nothing of [[], null, undefined, "x", {}, [{}]]) {
      expect(renderRecent(nothing, NOW)).toEqual([]);
      expect(recentWork(nothing)).toEqual([]);
    }
  });
});
