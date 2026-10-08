import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { ALICE, HANDOFF, INTERRUPT, LIVE_TERMINAL, STATIC_TERMINAL, change, completionUrl, delivered, harness, pushed, reply, step, stripAnsi } from "../testing/harness";
import { stageTitle } from "../ui/progress";
import { glyphsFor } from "../ui/terminal";
import { QUESTION, workspaceHeader } from "./interactive";

/**
 * The PawOS workspace: what `pawos` opens. One session — sign in if needed, show where the user
 * really is, take a task, show what PawOS reports, and return to the prompt.
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
const GLYPHS = glyphsFor(true);
const TASK = "Fix the authentication bug";
const RULE = "─".repeat(40);
const count = (text: string, part: string) => text.split(part).length - 1;

describe("already-authenticated startup", () => {
  it("opens straight into the workspace: PawOS, the real project context, the question", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "C:\\Users\\APPLE\\Downloads\\PawOS", branch: "main", local: { kind: "github", fullName: "RevantaAIproduction/Pawos", remote: "origin" } });
    h.server.readiness = { state: "ready", repository: { fullName: "RevantaAIproduction/Pawos", defaultBranch: "main" }, scope: "full" };
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toBe(
      [
        "",
        "     ●",
        "  ┌──┴──┐   PawOS v0.1.0",
        "  │ ^ ^ │   AI Developer Workspace",
        "  └─────┘   Good morning, Alice.",
        "",
        "  C:\\Users\\APPLE\\Downloads\\PawOS",
        "  Git: main",
        "  Repository: RevantaAIproduction/Pawos",
        "",
        `  ${RULE}`,
        "",
        `  ${QUESTION}`,
        "",
        "  Code mode: changes go to RevantaAIproduction/Pawos on GitHub. /chat to just talk.",
        "",
        "  > ",
        "",
        "",
      ].join("\n")
    );
    expect(h.signInUrls()).toHaveLength(0); // no sign-in was needed or shown
  });

  it("with the startup animation off, nothing is drawn or left running while PawOS connects", async () => {
    const h = start({ signedIn: true, answers: [null], caps: { ...LIVE_TERMINAL, color: false, hyperlinks: false } });
    await runCli([], h.ctx);
    const raw = h.raw();
    expect(raw).not.toContain("Connecting to PawOS");
    expect(raw).not.toContain(`${ESC}[`); // no cursor movement at all before the prompt
    expect(h.timers.active).toBe(0);
  });
});

describe("signed-out startup", () => {
  it("prints the authentication URL, and after the paste enters the same workspace without a second command", async () => {
    const h = start({ answers: [completionUrl(), null], cwd: "/home/dev/site" });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    const order = ["PawOS CLI", "To sign in, open this URL in your browser:", "Authentication URL:", `✓ Signed in as ${ALICE.email}`, "PawOS v0.1.0", "AI Developer Workspace", "Good morning, Alice.", "/home/dev/site", "Git: main", "Repository: acme/site", QUESTION];
    const positions = order.map((text) => output.indexOf(text));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions); // in this order, top to bottom
    expect(count(output, "PawOS CLI")).toBe(1);
    expect(h.prompter.prompts).toEqual(["  Authentication URL:\n  > ", "  > "]); // sign-in, then the task prompt: one session
  });

  it("the screen immediately after authentication", async () => {
    const h = start({ answers: [completionUrl(), null], cwd: "C:\\Users\\APPLE\\Downloads\\PawOS", local: { kind: "github", fullName: "RevantaAIproduction/Pawos", remote: "origin" } });
    h.server.handoffs.set(HANDOFF, "valid");
    h.server.readiness = { state: "ready", repository: { fullName: "RevantaAIproduction/Pawos", defaultBranch: "main" }, scope: "full" };
    await runCli([], h.ctx);
    const after = h.output().slice(h.output().indexOf("  ✓ Signed in as"));
    expect(after).toBe(
      ["  ✓ Signed in as alice@example.com", "", "     ●", "  ┌──┴──┐   PawOS v0.1.0", "  │ ^ ^ │   AI Developer Workspace", "  └─────┘   Good morning, Alice.", "", "  C:\\Users\\APPLE\\Downloads\\PawOS", "  Git: main", "  Repository: RevantaAIproduction/Pawos", "", `  ${RULE}`, "", `  ${QUESTION}`, "", "  Code mode: changes go to RevantaAIproduction/Pawos on GitHub. /chat to just talk.", "", "  > ", "", ""].join("\n")
    );
  });

  it("stops, signed out, if the user doesn't finish signing in", async () => {
    const h = start({ answers: [null] });
    expect(await runCli([], h.ctx)).toBe(1);
    expect(h.output()).toContain("Sign-in cancelled.");
    expect(h.output()).not.toContain(QUESTION);
    expect(h.output()).not.toContain("AI Developer Workspace");
  });
});

describe("pawos login transitions into the workspace", () => {
  it("signs in and then opens the same UI — it does not return to the shell", async () => {
    const h = start({ answers: [completionUrl(), TASK, null] });
    h.server.handoffs.set(HANDOFF, "valid");
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    expect(await runCli(["login"], h.ctx)).toBe(0);
    const output = h.output();
    expect(output.indexOf(`✓ Signed in as ${ALICE.email}`)).toBeLessThan(output.indexOf("AI Developer Workspace"));
    expect(output).toContain(QUESTION);
    // And it is fully usable from there: a task was taken and completed in the same run.
    expect(h.server.starts()).toHaveLength(1);
    expect(output).toContain("✓ Task completed");
    expect(count(output, QUESTION)).toBe(2);
  });

  it("is the very same workspace `pawos` shows", async () => {
    const viaLogin = start({ answers: [completionUrl(), null] });
    viaLogin.server.handoffs.set(HANDOFF, "valid");
    await runCli(["login"], viaLogin.ctx);
    const viaPawos = start({ signedIn: true, answers: [null] });
    await runCli([], viaPawos.ctx);
    const workspace = (text: string) => text.slice(text.indexOf("  PawOS v0.1.0"));
    expect(workspace(viaLogin.output())).toBe(workspace(viaPawos.output()));
  });

  it("when already signed in, pawos login still signs in again (to change account) and then opens the workspace", async () => {
    const h = start({ signedIn: true, answers: [completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    expect(await runCli(["login"], h.ctx)).toBe(0);
    expect(h.signInUrls()).toHaveLength(1);
    expect(h.output()).toContain(QUESTION);
  });
});

describe("project context is read from where the user is", () => {
  const header = (h: ReturnType<typeof harness>) => h.output().slice(h.output().indexOf("  Good morning, Alice."), h.output().indexOf(`  ${RULE}`)).split("\n").slice(2).filter(Boolean);

  it("current directory displayed: whatever folder pawos was started in", async () => {
    for (const cwd of ["C:\\Projects\\MyApp", "C:\\Users\\APPLE\\Downloads\\PawOS", "/home/dev/work/api", "/Users/dev/Code/My App"]) {
      const h = start({ signedIn: true, answers: [null], cwd });
      await runCli([], h.ctx);
      expect(header(h)[0]).toBe(`  ${cwd}`);
    }
  });

  it("GitHub repository: folder, branch and repository", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "C:\\Projects\\MyApp", branch: "feature/login", local: { kind: "github", fullName: "owner/repo", remote: "origin" } });
    h.server.readiness = { state: "ready", repository: { fullName: "owner/repo", defaultBranch: "main" }, scope: "full" };
    await runCli([], h.ctx);
    expect(header(h)).toEqual(["  C:\\Projects\\MyApp", "  Git: feature/login", "  Repository: owner/repo"]);
  });

  it("Git repository without a GitHub remote: folder and branch, no Repository line", async () => {
    for (const local of [{ kind: "noRemote" } as const, { kind: "notGitHub", remote: "https://gitlab.com/a/b.git" } as const]) {
      const h = start({ signedIn: true, cwd: "C:\\Projects\\MyApp", branch: "main", local });
      await runCli([], h.ctx);
      expect(header(h)).toEqual(["  C:\\Projects\\MyApp", "  Git: main"]);
      expect(h.output()).not.toContain("Repository:");
    }
  });

  it("non-Git directory: only the folder — no Git line, no Repository line", async () => {
    const h = start({ signedIn: true, cwd: "C:\\Projects\\MyApp", local: { kind: "notGit" } });
    await runCli([], h.ctx);
    expect(header(h)).toEqual(["  C:\\Projects\\MyApp"]);
    expect(h.output()).not.toMatch(/Git:|Repository:/);
  });

  it("detached HEAD with a GitHub remote: the repository, but no branch is invented", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: "C:\\Projects\\MyApp", branch: null, local: { kind: "github", fullName: "owner/repo", remote: "origin" } });
    h.server.readiness = { state: "ready", repository: { fullName: "owner/repo", defaultBranch: "main" }, scope: "full" };
    await runCli([], h.ctx);
    expect(header(h)).toEqual(["  C:\\Projects\\MyApp", "  Repository: owner/repo"]);
    expect(h.output()).not.toContain("Git:");
  });

  it("the branch shown is the one Git reports, whatever it is called", () => {
    const h = start({});
    for (const branch of ["main", "master", "develop", "release/2.0", "fix-ünïcode"]) {
      const lines = workspaceHeader(h.ctx, { cwd: "/w", branch, repository: { kind: "github", fullName: "o/r", remote: "origin" } }).map((line) => line.map((part) => part.text).join(""));
      expect(lines).toContain(`  Git: ${branch}`);
    }
  });

  it("nothing in the CLI's source assumes a branch, a folder or a repository", () => {
    const root = path.join(__dirname, "..");
    const sources = fs.readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.includes("testing"));
    for (const file of sources) {
      const source = fs.readFileSync(path.join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(source).not.toMatch(/["'`](main|master)["'`]/);
      expect(source).not.toMatch(/Git: (main|master)|RevantaAIproduction|Downloads[\\/]+PawOS/);
    }
    // The folder comes from process.cwd() at the one place the real context is built.
    expect(fs.readFileSync(path.join(root, "index.ts"), "utf8")).toContain("detectProject(process.cwd())");
  });

  it("a folder name can't inject terminal control sequences", () => {
    const h = start({});
    const lines = workspaceHeader(h.ctx, { cwd: `/tmp/x${ESC}[2J`, branch: `b${ESC}[31m`, repository: { kind: "notGit" } }).map((line) => line.map((part) => part.text).join(""));
    expect(lines.join("\n")).not.toContain(ESC);
  });

  it("a folder without a GitHub repository still shows where the user is, and PawOS opens as usual", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], cwd: "C:\\Projects\\Notes", local: { kind: "notGit" } });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("  C:\\Projects\\Notes");
    expect(h.output()).toContain(QUESTION);
    expect(h.output()).not.toContain("No GitHub repository detected");
    expect(h.server.starts()).toHaveLength(0); // not a code task: there is no project to change
    expect(h.server.chats()).toHaveLength(1);
  });
});

describe("backend stages", () => {
  const active = (id: string, label = "A step") => change("r", { steps: [step("read", "Read the repository", "done"), step(id, label, "active"), step("zzz", "Later", "pending")] });

  it.each([
    ["read", "PawOS is exploring…"],
    ["plan", "PawOS is planning…"],
    ["write", "PawOS is building…"],
    ["fix", "PawOS is building…"],
    ["check", "PawOS is verifying…"],
    ["preview", "PawOS is verifying…"],
  ])("known backend stages map correctly: %s → %s", (id, title) => {
    expect(stageTitle(active(id), GLYPHS)).toBe(title);
  });

  it.each([["push"], ["deploy"], ["investigating"], ["__proto__"], ["constructor"], ["toString"], [""], ["READ"]])("unknown backend stage falls back safely: %j → PawOS is working…", (id) => {
    expect(stageTitle(active(id), GLYPHS)).toBe("PawOS is working…");
  });

  it("with nothing reported yet, no step in progress, or more than one, it says only that PawOS is working", () => {
    expect(stageTitle(null, GLYPHS)).toBe("PawOS is working…");
    expect(stageTitle(change("r", { steps: [] }), GLYPHS)).toBe("PawOS is working…");
    expect(stageTitle(change("r", { steps: [step("read", "Read", "done"), step("plan", "Plan", "pending")] }), GLYPHS)).toBe("PawOS is working…");
    expect(stageTitle(change("r", { steps: [step("read", "Read", "active"), step("plan", "Plan", "active")] }), GLYPHS)).toBe("PawOS is working…");
    expect(stageTitle(change("r", { steps: [{ id: 7, label: "odd", status: "active" } as never] }), GLYPHS)).toBe("PawOS is working…");
  });

  it("a stage the CLI has no word for still shows the backend's own label, cleaned, in the list", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    const odd = change("r", { steps: [step("read", "Read the repository", "done"), step("lint", `Run the linter${ESC}[2J`, "active")] });
    h.server.polls = [odd, pushed("r")];
    h.server.sends = [h.server.afterPolls(1, delivered("r", pushed("r")))];
    await runCli([], h.ctx);
    expect(h.output()).toContain("● Run the linter[2J");
    expect(h.raw()).not.toContain(ESC);
    expect(h.output()).not.toMatch(/PawOS is (linting|running)/);
  });

  it("task progress: the status line follows the backend, and a step is only ever ticked when the backend says done", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    const reading = change("r", { steps: [step("read", "Read the repository", "active"), step("plan", "Choose the files", "pending")] });
    const planning = change("r", { steps: [step("read", "Read the repository", "done"), step("plan", "Choose the files", "active")] });
    const writing = change("r", { steps: [step("read", "Read the repository", "done"), step("plan", "Choose the files", "done"), step("write", "Write the change", "active")] });
    h.server.polls = [reading, planning, writing, pushed("r")];
    h.server.sends = [h.server.afterPolls(3, delivered("r", pushed("r")))];
    await runCli([], h.ctx);
    const output = h.output();
    const titles = ["PawOS is working…", "PawOS is exploring…", "PawOS is planning…", "PawOS is building…"];
    const at = titles.map((title) => output.indexOf(`◉ ${title}`));
    expect(at.every((position) => position >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // A step is shown in progress while the backend says so, and ticked only once the backend reports it done:
    // "Write the change" appears as active first, and its tick comes later, from the report that marked it done.
    const progress = output.slice(0, output.indexOf("Task completed"));
    expect(progress.indexOf("● Write the change")).toBeGreaterThan(0);
    expect(progress.indexOf("✓ Write the change")).toBeGreaterThan(progress.indexOf("● Write the change"));
    // While PawOS was still planning, nothing after planning had been ticked.
    const whilePlanning = output.slice(0, output.indexOf("◉ PawOS is building…"));
    expect(whilePlanning).not.toMatch(/✓ (Write the change|Check for problems|Commit and push|Preview and checks)/);
    // No invented checks, and no stage the backend doesn't have.
    expect(output).not.toMatch(/✓ (TypeScript|Tests|Build)|investigating/);
  });
});

describe("the task loop", () => {
  it("task prompt → task submission → task completion → return to prompt, all inside PawOS", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [delivered("r", pushed("r", { pullRequestUrl: "https://github.com/acme/site/pull/12" }))];
    h.server.polls = [pushed("r")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.server.starts()).toHaveLength(1);
    expect(h.server.starts()[0]!.body).toMatchObject({ content: TASK, mode: "codeChange" });
    const output = h.output();
    const tail = output.slice(output.indexOf("  ✓ Task completed"));
    expect(tail).toBe(
      [
        "  ✓ Task completed",
        "",
        "  Summary",
        "    Fixed authentication token handling.",
        "",
        "  Files changed",
        "    src/auth/middleware.ts",
        "    src/auth/middleware.test.ts",
        "",
        "  Checks",
        "    ✓ Passed",
        "",
        "  Commit",
        "    abc1234  on main",
        "    https://github.com/acme/site/commit/abc1234def5678",
        "",
        "  Pull Request",
        "    https://github.com/acme/site/pull/12",
        "",
        "  PawOS works on your connected GitHub project. Review the resulting commit or pull request.",
        "",
        `  ${RULE}`,
        "",
        `  ${QUESTION}`,
        "",
        "  Code mode: changes go to acme/site on GitHub. /chat to just talk.",
        "",
        "  > ",
        "",
        "",
      ].join("\n")
    );
  });

  it("task failure: the real reason and the request id, then back to the prompt — nothing is retried", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [reply({ code: "change_refused", message: "I didn't push anything: the change still looked broken after a repair." }, 422)];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    const requestId = String(h.server.starts()[0]!.body?.requestId);
    expect(output).toContain("✕ PawOS could not complete the task");
    expect(output).toContain("I didn't push anything: the change still looked broken after a repair.");
    expect(output).toContain(requestId);
    expect(output.lastIndexOf(QUESTION)).toBeGreaterThan(output.indexOf("could not complete"));
    expect(h.server.starts()).toHaveLength(1);
    expect(h.server.recovers()).toHaveLength(0);
  });

  it("several tasks in one session, each sent once", async () => {
    const h = start({ signedIn: true, answers: ["First", "Second", "Third", null] });
    h.server.sends = [delivered("a", pushed("a")), reply({ code: "usage_limit_reached", message: "Your plan's included usage is used up." }, 402), delivered("c", pushed("c"))];
    h.server.polls = [pushed("x")];
    await runCli([], h.ctx);
    expect(h.server.starts().map((call) => call.body?.content)).toEqual(["First", "Second", "Third"]);
    expect(count(h.output(), QUESTION)).toBe(4);
  });
});

describe("Ctrl+C", () => {
  it("at the prompt it discards what was being typed and asks before leaving: on No, PawOS stays open", async () => {
    const h = start({ signedIn: true, answers: [INTERRUPT, "n", TASK, null] });
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("Exit PawOS? (y/N)");
    expect(h.server.starts()).toHaveLength(1); // only the task typed afterwards
    expect(h.server.starts()[0]!.body?.content).toBe(TASK);
  });

  it("twice in a row (the second at the exit question) leaves PawOS, having submitted nothing", async () => {
    const h = start({ signedIn: true, answers: [INTERRUPT, INTERRUPT, TASK] });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.prompter.prompts).toHaveLength(2);
  });

  it("during a running task it stops the display, keeps the request id, and never sends the task again", async () => {
    const h = start({ signedIn: true, answers: [TASK, "y"], caps: LIVE_TERMINAL });
    h.server.polls = [change("r")];
    h.server.sends = [
      () => {
        queueMicrotask(h.interrupt);
        return h.server.afterPolls(1_000_000, delivered("r", pushed("r")))() as unknown as Response;
      },
    ];
    expect(await runCli([], h.ctx)).toBe(130);
    const requestId = String(h.server.starts()[0]!.body?.requestId);
    expect(h.output()).toContain("Stopped watching. The task was not cancelled: it continues on PawOS.");
    expect(h.output()).toContain(requestId);
    expect(h.server.starts()).toHaveLength(1);
    expect(h.ctx.pending.read()?.requestId).toBe(requestId); // kept for the next session
    // The terminal is left clean: animation stopped, cursor back, no interrupt listener left behind.
    expect(h.timers.active).toBe(0);
    expect(h.raw().lastIndexOf(`${ESC}[?25h`)).toBeGreaterThan(h.raw().lastIndexOf(`${ESC}[?25l`));
    expect(h.listening()).toBe(0);
  });

  it("the next session offers to recover that request instead of creating another task", async () => {
    const h = start({ signedIn: true, answers: ["y", null] });
    const requestId = "3f0c1a52-7d0e-4c55-9d6e-1f2a3b4c5d6e";
    h.ctx.pending.write({ requestId, content: TASK, repository: "acme/site", startedAt: "" });
    h.server.recoveries = [delivered(requestId, pushed(requestId))];
    h.server.polls = [pushed(requestId)];
    await runCli([], h.ctx);
    expect(h.output()).toContain("An earlier task hasn't reported its result:");
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.recovers()[0]!.body).toEqual({ requestId, recoverOnly: true });
    expect(h.output()).toContain("✓ Task completed");
  });
});

describe("the PawOS animation in the workspace", () => {
  it("PawOS animation starts while a task runs, and stops when it completes", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], caps: LIVE_TERMINAL });
    const during: number[] = [];
    h.server.polls = [change("r"), pushed("r")];
    h.server.sends = [
      () => {
        during.push(h.timers.active);
        return delivered("r", pushed("r"));
      },
    ];
    await runCli([], h.ctx);
    expect(during).toEqual([1]); // one timer, running, while PawOS works
    expect(h.timers.active).toBe(0); // and none afterwards
    expect(stripAnsi(h.raw())).toContain("◉ PawOS is working…");
  });

  it("a pulse of the mark rewrites one line and leaves every other line on screen untouched", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], caps: { ...LIVE_TERMINAL, hyperlinks: false } });
    let pulse = "";
    h.server.polls = [change("r"), pushed("r")];
    h.server.sends = [
      h.server.afterPolls(1, delivered("r", pushed("r"))),
    ];
    const tickAndCapture = () => {
      const before = h.raw().length;
      h.timers.tick(2); // two frames on: ◉ → ◎
      pulse = h.raw().slice(before);
    };
    const realRun = h.ctx.run;
    h.ctx.run = (options) =>
      realRun({
        ...options,
        onUpdate: (update) => {
          options.onUpdate?.(update);
          if (!pulse) tickAndCapture();
        },
      });
    await runCli([], h.ctx);
    expect(count(pulse, `${ESC}[2K`)).toBe(1); // exactly one line cleared and rewritten: the status line
    expect(stripAnsi(pulse)).toContain("◎ PawOS is");
    expect(pulse).not.toContain("Read the repository"); // the steps were not redrawn
  });

  it("the terminal stays stable: the screen is never cleared, and nothing above the live display is touched", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], caps: LIVE_TERMINAL });
    h.server.polls = [null, change("r"), pushed("r")];
    h.server.sends = [h.server.afterPolls(2, delivered("r", pushed("r")))];
    await runCli([], h.ctx);
    const raw = h.raw();
    expect(raw).not.toContain(`${ESC}[2J`); // no full-screen clear
    expect(raw).not.toContain(`${ESC}[H`); // no jump to the top of the screen
    expect(raw).not.toContain(`${ESC}c`); // no terminal reset
    // The workspace header was printed once and is still what the user sees above the result.
    expect(count(stripAnsi(raw), "AI Developer Workspace")).toBe(1);
    // Every erase is limited to the live display: the cursor moves up at most its own height first.
    const ups = [...raw.matchAll(new RegExp(`${ESC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\[(\\d+)A`, "g"))].map((match) => Number(match[1]));
    expect(Math.max(...ups)).toBeLessThanOrEqual(8); // status line, blank line, six steps
  });

  it("non-TTY fallback: plain lines, no escape codes, no animation, and the same result", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], caps: STATIC_TERMINAL });
    h.server.polls = [change("r"), pushed("r")];
    h.server.sends = [h.server.afterPolls(1, delivered("r", pushed("r")))];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.raw()).not.toContain(ESC);
    expect(h.timers.active).toBe(0);
    expect(h.timers.cleared).toBe(0); // no timer was ever started
    const output = h.output();
    expect(count(output, "● Choose the files")).toBe(1); // each state is printed once, not redrawn
    expect(output).toContain("✓ Task completed");
    expect(output).toContain("https://github.com/acme/site/commit/abc1234def5678");
  });

  it("plain ASCII on a terminal that can't draw the symbols: same information, no boxes or marks it can't show", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], caps: { ...STATIC_TERMINAL, unicode: false } });
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain("  PawOS v0.1.0");
    expect(output).toContain("  Good morning, Alice.");
    expect(output).toContain("+ Task completed");
    expect(output).toContain("-".repeat(40));
    expect(output).toMatch(/^[\x20-\x7e\n]*$/); // nothing outside printable ASCII
  });
});
