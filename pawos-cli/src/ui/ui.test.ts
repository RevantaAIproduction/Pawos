import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { LIVE_TERMINAL, ManualTimers, STATIC_TERMINAL, change, delivered, harness, pushed, step, stripAnsi } from "../testing/harness";
import { renderProgress, renderSteps } from "./progress";
import { LIMITATION_NOTE, renderOutcome } from "./result";
import { ASCII_MARK_FRAMES, FRAME_MS, LiveStatus, MARK_FRAMES, markFrame } from "./spinner";
import { Terminal, clean, cleanLines, cleanUrl, detectCapabilities, glyphsFor, line, plain, seg } from "./terminal";

/** What the CLI draws: progress, results, the PawOS animation — and what it refuses to print. */
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const GLYPHS = glyphsFor(true);
const REQUEST_ID = "3f0c1a52-7d0e-4c55-9d6e-1f2a3b4c5d6e";

function screen(caps = LIVE_TERMINAL) {
  const chunks: string[] = [];
  return { term: new Terminal({ write: (text) => chunks.push(text) }, caps), raw: () => chunks.join(""), chunks };
}

describe("progress rendering", () => {
  it("draws the steps PawOS reported: its labels, its order, its statuses", () => {
    const text = plain(renderSteps(change(REQUEST_ID).steps, GLYPHS));
    expect(text.split("\n")).toEqual(["  ✓ Read the repository  42 files", "  ● Choose the files", "  ○ Write the change", "  ○ Check for problems", "  ○ Commit and push to main", "  ○ Preview and checks"]);
  });

  it("marks a failed and a skipped step", () => {
    const text = plain(renderSteps([step("check", "Check for problems", "failed"), step("push", "Commit and push to main", "skipped")], GLYPHS));
    expect(text).toBe("  ✕ Check for problems\n  – Commit and push to main");
  });

  it("invents nothing: with no steps reported yet there are no steps", () => {
    expect(renderSteps([], GLYPHS)).toEqual([]);
    expect(renderSteps(null, GLYPHS)).toEqual([]);
    expect(plain(renderProgress(null, GLYPHS))).toBe("  Starting…");
  });

  it("an unknown status from a newer server is shown as not-yet-done, never as done", () => {
    const odd = { id: "x", label: "New kind of step", status: "paused" } as unknown as Parameters<typeof renderSteps>[0] extends (infer S)[] | null | undefined ? S : never;
    expect(plain(renderSteps([odd], GLYPHS))).toBe("  ○ New kind of step");
  });

  it("has plain-ASCII marks for terminals that can't draw the symbols", () => {
    expect(plain(renderSteps(change(REQUEST_ID).steps.slice(0, 3), glyphsFor(false)))).toBe("  + Read the repository  42 files\n  * Choose the files\n  - Write the change");
  });
});

describe("success rendering", () => {
  it("shows what PawOS returned, and only that", () => {
    const text = plain(renderOutcome({ status: "complete", change: pushed(REQUEST_ID, { pullRequestUrl: "https://github.com/acme/site/pull/12", previewUrl: "https://site-git-abc.example.dev/" }), reply: "Done.", checksPending: false }, REQUEST_ID, GLYPHS));
    expect(text).toBe(
      [
        "✓ Task completed",
        "",
        "Summary",
        "  Fixed authentication token handling.",
        "",
        "Files changed",
        "  src/auth/middleware.ts",
        "  src/auth/middleware.test.ts",
        "",
        "Checks",
        "  ✓ Passed",
        "",
        "Commit",
        "  abc1234  on main",
        "  https://github.com/acme/site/commit/abc1234def5678",
        "",
        "Pull Request",
        "  https://github.com/acme/site/pull/12",
        "",
        "Preview",
        "  https://site-git-abc.example.dev/",
        "",
        LIMITATION_NOTE,
      ].join("\n")
    );
  });

  it("reports the checks as PawOS does — one overall state, never an invented list", () => {
    const checks = (overrides: Parameters<typeof pushed>[1], pending = false) => plain(renderOutcome({ status: "complete", change: pushed(REQUEST_ID, overrides), reply: "", checksPending: pending }, REQUEST_ID, GLYPHS));
    expect(checks({ checksState: "failure", fixAttempts: 2 })).toContain("Checks\n  ✕ Failed (PawOS made 2 automatic fixes)");
    expect(checks({ checksState: "none" })).toContain("Checks\n  No checks or preview deployments reported");
    expect(checks({ checksState: "pending", state: "pushed" }, true)).toContain("Checks\n  Waiting for your repository's checks…");
    expect(checks({ checksState: "success" })).not.toMatch(/TypeScript|Tests/);
  });

  it("leaves out what PawOS didn't return", () => {
    const text = plain(renderOutcome({ status: "complete", change: pushed(REQUEST_ID, { summary: null, files: [], pullRequestUrl: null }), reply: "", checksPending: false }, REQUEST_ID, GLYPHS));
    expect(text).not.toContain("Summary");
    expect(text).not.toContain("Files changed");
    expect(text).not.toContain("Pull Request");
    expect(text).toContain("Commit");
  });

  it("makes the commit and pull request clickable where the terminal supports it — https only", () => {
    const { term, raw } = screen();
    term.print(renderOutcome({ status: "complete", change: pushed(REQUEST_ID, { pullRequestUrl: "https://github.com/acme/site/pull/12" }), reply: "", checksPending: false }, REQUEST_ID, term.glyphs));
    expect(raw()).toContain(`${ESC}]8;;https://github.com/acme/site/commit/abc1234def5678${ESC}\\`);
    expect(raw()).toContain(`${ESC}]8;;https://github.com/acme/site/pull/12${ESC}\\`);

    const plainScreen = screen(STATIC_TERMINAL);
    plainScreen.term.print(renderOutcome({ status: "complete", change: pushed(REQUEST_ID), reply: "", checksPending: false }, REQUEST_ID, plainScreen.term.glyphs));
    expect(plainScreen.raw()).not.toContain(ESC);
    expect(plainScreen.raw()).toContain("https://github.com/acme/site/commit/abc1234def5678");
  });
});

describe("failure rendering", () => {
  it("shows the reason, the steps, the request id and what to do next", () => {
    const failed = change(REQUEST_ID, { state: "failed", steps: [step("read", "Read the repository", "done"), step("check", "Check for problems", "failed")] });
    const text = plain(renderOutcome({ status: "failed", message: "Tests failed after the final repair attempt.", change: failed }, REQUEST_ID, GLYPHS));
    expect(text).toBe(
      ["✕ PawOS could not complete the task", "", "Reason", "  Tests failed after the final repair attempt.", "", "Steps", "  ✓ Read the repository", "  ✕ Check for problems", "", "Request ID", `  ${REQUEST_ID}`, "", "You can run PawOS again to continue investigating."].join("\n")
    );
  });

  it("keeps a commit that was pushed before the failure in view", () => {
    const text = plain(renderOutcome({ status: "failed", message: "A check is still failing.", change: pushed(REQUEST_ID, { state: "failed", checksState: "failure" }) }, REQUEST_ID, GLYPHS));
    expect(text).toContain("Commit\n  abc1234  on main");
    expect(text).toContain("✕ Failed");
  });

  it("a timeout says the task was not sent again and keeps its id in view", () => {
    const text = plain(renderOutcome({ status: "timeout", change: change(REQUEST_ID) }, REQUEST_ID, GLYPHS));
    expect(text).toContain("PawOS is still working on this task");
    expect(text).toContain(`Request ID\n  ${REQUEST_ID}`);
    expect(text).toContain("It was not sent again.");
  });

  it("never leaves the reason blank", () => {
    expect(plain(renderOutcome({ status: "failed", message: "", change: null }, REQUEST_ID, GLYPHS))).toContain("Reason\n  No reason was given.");
  });
});

describe("unsafe terminal characters are sanitized", () => {
  const hostile = `Fixed it${ESC}[2J${ESC}[1;1H${ESC}]0;owned${BEL}\r\u202egnp.exe\u0000\u009b31m`;

  it("removes escape, control and text-direction characters from server text", () => {
    const cleaned = clean(hostile);
    expect(cleaned).toBe("Fixed it[2J[1;1H]0;owned gnp.exe31m");
    expect(cleaned).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/);
  });

  it("keeps ordinary text, accents, CJK and symbols", () => {
    expect(clean("Añadí «héllo» — 修复 ✓ naïve")).toBe("Añadí «héllo» — 修复 ✓ naïve");
    expect(cleanLines("one\r\ntwo\n\n\nthree\n")).toEqual(["one", "two", "", "three"]);
  });

  it("a hostile change can't move the cursor, clear the screen, set the title or forge a line", () => {
    const { term, raw } = screen(STATIC_TERMINAL);
    const evil = pushed(REQUEST_ID, {
      summary: hostile,
      files: [`src/a.ts${ESC}[1A${ESC}[2K\r✓ Task completed`, "ok.ts\nFiles changed\n  forged.ts"],
      branch: `main${ESC}[31m`,
      commitSha: `abc1234${ESC}[0m`,
      steps: [step("read", `Read${ESC}[2J the repository`, "done", `42${BEL} files`)],
    });
    term.print(renderOutcome({ status: "complete", change: evil, reply: "", checksPending: false }, `${REQUEST_ID}${ESC}[2J`, term.glyphs));
    term.print(renderSteps(evil.steps, term.glyphs));
    const out = raw();
    expect(out).not.toContain(ESC);
    expect(out).not.toContain(BEL);
    expect(out).not.toContain("\r");
    // One line per file: a newline inside a file name can't start a new, forged line.
    expect(out).toContain("  ok.ts Files changed forged.ts\n");
    expect(out.match(/Task completed/g)).toHaveLength(2); // the real heading, and the file name's text on its own (indented) line
    expect(out).toContain("  src/a.ts[1A[2K ✓ Task completed\n");
  });

  it("on a colour terminal the only escape sequences are the CLI's own", () => {
    const { term, raw } = screen();
    term.print(renderOutcome({ status: "failed", message: hostile, change: change(REQUEST_ID, { steps: [step("x", hostile, "failed")] }) }, REQUEST_ID, term.glyphs));
    const withoutOwn = stripAnsi(raw());
    expect(withoutOwn).not.toContain(ESC);
    expect(withoutOwn).not.toContain(BEL);
  });

  it.each([
    ["javascript:alert(1)"],
    ["http://github.com/acme/site"],
    ["file:///etc/passwd"],
    ["not a url"],
    [`https://github.com/acme${ESC}]8;;https://evil.example${ESC}\\`],
    [""],
    [null],
  ])("never links or prints an address that isn't plain https: %s", (value) => {
    const safe = cleanUrl(value);
    if (safe !== null) expect(safe).not.toContain(ESC);
    const { term, raw } = screen();
    term.print(renderOutcome({ status: "complete", change: pushed(REQUEST_ID, { pullRequestUrl: value as string, commitUrl: value as string, previewUrl: value as string }), reply: "", checksPending: false }, REQUEST_ID, term.glyphs));
    expect(raw()).not.toContain("evil.example");
    expect(raw()).not.toContain("javascript:");
    expect(raw()).not.toContain("]8;;http://");
    expect(raw()).not.toContain("file:");
  });

  it("an https address with odd characters is encoded, not passed through", () => {
    expect(cleanUrl("https://github.com/acme/site/pull/1?a=b c")).toBe("https://github.com/acme/site/pull/1?a=b%20c");
    expect(cleanUrl("https://github.com/acme/site")).toBe("https://github.com/acme/site");
  });

  it("the task the user typed is shown back cleaned when recovered", async () => {
    const h = harness({ signedIn: true, answers: ["n", null] });
    cleanups.push(h.cleanup);
    h.ctx.pending.write({ requestId: REQUEST_ID, content: `Fix it${ESC}[2J`, repository: "acme/site", startedAt: "" });
    await runCli([], h.ctx);
    expect(h.raw()).not.toContain(ESC);
  });
});

describe("the PawOS animation", () => {
  it("is the PawOS mark, pulsing slowly — one character, no colour changes, no extra motion", () => {
    expect(MARK_FRAMES).toEqual(["◉", "◉", "◎", "○", "◎"]);
    expect(FRAME_MS).toBeGreaterThanOrEqual(150);
    expect([0, 1, 2, 3, 4, 5].map((tick) => markFrame(tick, true))).toEqual(["◉", "◉", "◎", "○", "◎", "◉"]);
    expect(ASCII_MARK_FRAMES.every((frame) => frame.length === 3)).toBe(true);
    for (const frame of [...MARK_FRAMES, ...ASCII_MARK_FRAMES]) expect(frame).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("redraws in place while working, and stops cleanly: display erased, cursor back, timer gone", () => {
    const { term, raw, chunks } = screen();
    const timers = new ManualTimers();
    const live = new LiveStatus(term, timers);
    live.start("PawOS is working…", renderProgress(change(REQUEST_ID), term.glyphs));
    expect(timers.active).toBe(1);
    expect(raw()).toContain(`${ESC}[?25l`); // cursor hidden while it animates
    expect(stripAnsi(raw())).toContain("◉ PawOS is working…");

    const before = chunks.length;
    timers.tick(2);
    const frames = stripAnsi(chunks.slice(before).join(""));
    expect(frames).toContain("◎ PawOS is working…"); // the mark moved; nothing else did
    expect(chunks[before]).toContain(`${ESC}[8A`); // redrawn over the previous frame, not appended

    live.stop();
    expect(timers.active).toBe(0);
    expect(timers.cleared).toBe(1);
    expect(raw().endsWith(`${ESC}[?25h`)).toBe(true); // cursor visible again
    expect(raw()).toContain(`${ESC}[8A\r${ESC}[0J`); // the animated block is erased

    const after = chunks.length;
    timers.tick(5);
    live.update(renderProgress(null, term.glyphs));
    expect(chunks.length).toBe(after); // nothing is drawn once it has stopped
  });

  it("stops when the task completes, and when it fails", async () => {
    for (const result of [pushed("r"), change("r", { state: "failed", steps: [step("plan", "Choose the files", "failed")] })]) {
      const h = harness({ signedIn: true, answers: ["Fix the bug", null], caps: LIVE_TERMINAL });
      cleanups.push(h.cleanup);
      h.server.sends = [delivered("r", result, "Result.")];
      h.server.polls = [result];
      await runCli([], h.ctx);
      expect(h.timers.active).toBe(0);
      const raw = h.raw();
      expect(raw.lastIndexOf(`${ESC}[?25h`)).toBeGreaterThan(raw.lastIndexOf(`${ESC}[?25l`));
      expect(h.output()).toContain(result.state === "failed" ? "PawOS could not complete the task" : "Task completed");
    }
  });

  it("stops when the user interrupts", async () => {
    const h = harness({ signedIn: true, answers: ["Fix the bug"], caps: LIVE_TERMINAL });
    cleanups.push(h.cleanup);
    h.server.polls = [change("r")];
    h.server.sends = [
      () => {
        queueMicrotask(h.interrupt);
        return h.server.afterPolls(1_000_000, delivered("r", pushed("r")))() as unknown as Response;
      },
    ];
    expect(await runCli([], h.ctx)).toBe(130);
    expect(h.timers.active).toBe(0);
    const raw = h.raw();
    expect(raw.lastIndexOf(`${ESC}[?25h`)).toBeGreaterThan(raw.lastIndexOf(`${ESC}[?25l`));
  });

  it("falls back to static output where animation isn't supported: each step printed once, no escape codes", () => {
    const { term, raw } = screen(STATIC_TERMINAL);
    const timers = new ManualTimers();
    const live = new LiveStatus(term, timers);
    live.start("PawOS is working…", renderProgress(change(REQUEST_ID), term.glyphs));
    live.update(renderProgress(change(REQUEST_ID), term.glyphs)); // unchanged: printed nothing new
    live.update(renderProgress(change(REQUEST_ID, { steps: [step("read", "Read the repository", "done", "42 files"), step("plan", "Choose the files", "done"), step("write", "Write the change", "active")] }), term.glyphs));
    live.stop();
    expect(timers.active).toBe(0);
    expect(raw()).not.toContain(ESC);
    const lines = raw().trimEnd().split("\n");
    expect(lines[0]).toBe("  ◉ PawOS is working…");
    expect(lines.filter((text) => text.includes("Read the repository"))).toHaveLength(1);
    expect(lines).toContain("  ● Choose the files");
    expect(lines).toContain("  ✓ Choose the files");
    expect(lines).toContain("  ● Write the change");
  });

  it("long lines are cut to the screen width so redrawing in place stays aligned", () => {
    const { term } = screen({ ...LIVE_TERMINAL, color: false, hyperlinks: false, columns: 40 });
    const text = term.format(line("  ", seg("x".repeat(200))), 39);
    expect([...text].length).toBe(39);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("what the terminal can do", () => {
  const caps = (stream: { isTTY?: boolean; columns?: number }, env: Record<string, string | undefined>, platform = "linux") => detectCapabilities(stream, env, platform);

  it("animates and colours only on an interactive terminal", () => {
    expect(caps({ isTTY: true, columns: 120 }, { TERM: "xterm-256color" })).toMatchObject({ interactive: true, color: true, unicode: true });
    expect(caps({ isTTY: false }, { TERM: "xterm-256color" })).toMatchObject({ interactive: false, color: false });
    expect(caps({ isTTY: true }, { TERM: "dumb" })).toMatchObject({ interactive: false, color: false, unicode: false });
    expect(caps({ isTTY: true }, { TERM: "xterm", CI: "true" })).toMatchObject({ interactive: false });
    expect(caps({ isTTY: true }, { TERM: "xterm", PAWOS_NO_ANIMATION: "1" })).toMatchObject({ interactive: false, color: true });
  });

  it("respects NO_COLOR", () => {
    expect(caps({ isTTY: true }, { TERM: "xterm", NO_COLOR: "1" })).toMatchObject({ color: false, hyperlinks: false, interactive: true });
  });

  it("uses plain ASCII on the classic Windows console, symbols in Windows Terminal", () => {
    expect(caps({ isTTY: true }, {}, "win32").unicode).toBe(false);
    expect(caps({ isTTY: true }, { WT_SESSION: "1" }, "win32")).toMatchObject({ unicode: true, hyperlinks: true });
    expect(caps({ isTTY: true }, { TERM: "xterm", PAWOS_ASCII: "1" }).unicode).toBe(false);
  });
});

describe("the interface as a whole", () => {
  it("has PawOS's name at the top, and no emoji anywhere", async () => {
    const h = harness({ signedIn: true, answers: ["Fix the bug", null] });
    cleanups.push(h.cleanup);
    h.server.sends = [delivered("r", pushed("r", { pullRequestUrl: "https://github.com/acme/site/pull/12" }))];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    const output = h.output();
    expect(output.split("\n").slice(0, 3).join("\n")).toBe("\n  PawOS v0.1.0\n  AI Developer Workspace");
    expect(output).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(output).toMatch(/─{20,}/);
  });
});
