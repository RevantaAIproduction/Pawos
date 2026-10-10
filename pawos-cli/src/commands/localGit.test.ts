import { execFileSync } from "node:child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { GIT_DECLINED } from "../local/agent";
import { INTERRUPT, finishTurn, harness, toolTurn } from "../testing/harness";
import { COMMAND_HELP } from "./interactive";
import { COMMAND_QUESTION, UNDO_QUESTION, WRITE_QUESTION } from "./workspace";

/**
 * Git and recovery in local mode, through the real workspace loop: staging, committing and pushing
 * with the user's say-so, and /undo. The repository is real and temporary; "origin" is a bare
 * repository in the same temporary folder, so a push in these tests goes nowhere else.
 */
const cleanups: (() => void)[] = [];
let outer: string;
let root: string;
let remote: string;

const CART = "exports.total = (items) => items.reduce((a, b) => a + b, 0);\n";
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const remoteGit = (...args: string[]) => execFileSync("git", ["--git-dir", remote, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const write = (relative: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
};

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-local-git-")));
  root = path.join(outer, "shop");
  remote = path.join(outer, "remote.git");
  fs.mkdirSync(root);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  write("package.json", JSON.stringify({ name: "shop", scripts: { test: "node test.js" } }));
  write("src/cart.js", CART);
  write("src/old.js", "exports.old = true;\n");
  // Fails until the total refuses to go below zero.
  write("test.js", "const { total } = require('./src/cart.js');\nconst ok = total([5, -9]) === 0;\nconsole.log(ok ? 'Tests:       1 passed, 1 total' : 'Tests:       1 failed, 0 passed, 1 total');\nprocess.exit(ok ? 0 : 1);\n");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test User");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "First commit");
  git("remote", "add", "origin", remote);
  git("push", "-q", "-u", "origin", "main");
  write(".env", "API_KEY=s3cr3t-value-0123456789\n");
  cleanups.push(() => fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const start = (options: Parameters<typeof harness>[0] = {}) => {
  const h = harness({ signedIn: true, workspaceRoot: root, cwd: root, ...options });
  cleanups.push(h.cleanup);
  return h;
};
const TASK_QUESTION = "  Allow? [y] allow  [n] deny  [a] always allow\n\n  > ";
const STAGE_QUESTION = "  Allow staging? [y] stage  [n] cancel\n\n  > ";
const COMMIT_QUESTION = "  Allow this commit? [y] commit  [n] cancel\n\n  > ";
const PUSH_QUESTION = "  Allow push? [y] push  [n] cancel\n\n  > ";
const SWITCH_QUESTION = "  Allow the switch? [y] switch  [n] cancel\n\n  > ";
const TASK = "Fix the cart total in src/cart.js and commit it";
const WRONG_EDIT = { path: "src/cart.js", oldText: "items.reduce((a, b) => a + b, 0)", newText: "Math.max(1, items.reduce((a, b) => a + b, 0))" };
const RIGHT_EDIT = { path: "src/cart.js", oldText: "Math.max(1, ", newText: "Math.max(0, " };
const FIXED = "exports.total = (items) => Math.max(0, items.reduce((a, b) => a + b, 0));\n";
type Sent = { id: string; ok: boolean; output: string; denied?: boolean; exitCode?: number | null };
const results = (h: ReturnType<typeof harness>) => h.server.agentCalls().slice(1).map((call) => call.body!.result as Sent);
const remoteCalls = (h: ReturnType<typeof harness>) => h.server.calls.filter((call) => call.path.startsWith("/api/web/changes") || call.body?.mode === "codeChange" || (call.path.startsWith("/api/web/github") && call.method !== "GET") || call.path === "/api/web-chat/messages");

describe("end to end: fix, test, commit, push", () => {
  it("task → inspect → edit → approval → checkpoint → test fails → edit again → test passes → git diff → git add → approval → git commit → approval → git push → summary", async () => {
    const h = start({ answers: [TASK, "y", "y", "y", "y", "y", "y", "y", "y", null], permissionMode: "ask" });
    h.server.agentTurns = [
      toolTurn("step-1", "list_files", {}),
      toolTurn("step-2", "read_file", { path: "src/cart.js" }),
      toolTurn("step-3", "edit_file", WRONG_EDIT, "Keep the total positive"),
      toolTurn("step-4", "run_tests", {}),
      toolTurn("step-5", "edit_file", RIGHT_EDIT, "Zero is allowed"),
      toolTurn("step-6", "run_tests", {}),
      toolTurn("step-7", "git_diff", {}),
      toolTurn("step-8", "git_add", { paths: ["src/cart.js"] }),
      toolTurn("step-9", "git_commit", { message: "Fix the cart total going below zero" }),
      toolTurn("step-10", "git_push", {}),
      finishTurn("The total can no longer be negative.\nCommitted and pushed to origin."),
    ];
    const before = git("rev-parse", "HEAD");
    expect(await runCli([], h.ctx)).toBe(0);

    // Every question, in the order things happened. Reading and git diff asked nothing.
    expect(h.prompter.prompts).toEqual(["  > ", TASK_QUESTION, WRITE_QUESTION, COMMAND_QUESTION, WRITE_QUESTION, COMMAND_QUESTION, STAGE_QUESTION, COMMIT_QUESTION, PUSH_QUESTION, "  > "]);

    // What PawOS was told, turn by turn.
    const sent = results(h);
    expect(sent.map((result) => result.ok)).toEqual([true, true, true, false, true, true, true, true, true, true]);
    expect(sent[3]).toMatchObject({ exitCode: 1, output: expect.stringContaining("Tests failed: 0 passed, 1 failed, 1 in all.") });
    expect(sent[5]).toMatchObject({ exitCode: 0, output: expect.stringContaining("Tests passed: 1 passed, 0 failed, 1 in all.") });
    expect(sent[6]!.output).toContain("+exports.total = (items) => Math.max(0, items.reduce((a, b) => a + b, 0));");
    expect(sent[7]!.output).toBe("Staged 1 file:\nsrc/cart.js");
    expect(sent[8]!.output).toMatch(/^Committed [0-9a-f]{7,} on main: Fix the cart total going below zero \(1 file\)\. It has not been pushed\.$/);
    expect(sent[9]!.output).toBe("Pushed main to origin (1 commit).");

    // It really happened: the file, the commit, and the push to the test's own bare repository.
    expect(read("src/cart.js")).toBe(FIXED);
    expect(git("log", "-1", "--pretty=%s")).toBe("Fix the cart total going below zero");
    expect(git("rev-list", "--count", `${before}..HEAD`)).toBe("1");
    expect(git("show", "--name-only", "--pretty=", "HEAD")).toBe("src/cart.js");
    expect(remoteGit("rev-parse", "main")).toBe(git("rev-parse", "HEAD"));
    // The secret beside it was never staged.
    expect(git("status", "--porcelain")).toBe("?? .env");

    // Each Git operation was shown exactly before its question.
    const screen = h.output();
    const commitShown = screen.slice(screen.indexOf("PawOS wants to commit:"), screen.indexOf(COMMIT_QUESTION));
    expect(commitShown).toContain("Branch:\n    main");
    expect(commitShown).toContain("Files:\n    src/cart.js");
    expect(commitShown).toContain("Message:\n    Fix the cart total going below zero");
    const pushShown = screen.slice(screen.indexOf("PawOS wants to push:"), screen.indexOf(PUSH_QUESTION));
    expect(pushShown).toContain("Branch:\n    main");
    expect(pushShown).toMatch(/Remote:\n {4}origin \S/);
    expect(pushShown).toMatch(/Commits:\n {4}[0-9a-f]{7,} Fix the cart total going below zero/);

    // The checkpoint was made before the first change, outside the project.
    const checkpoints = path.join(h.directory, "checkpoints");
    expect(fs.readdirSync(checkpoints)).toHaveLength(1);
    expect(path.relative(root, checkpoints).startsWith("..")).toBe(true);
    const kept = fs.readdirSync(path.join(checkpoints, fs.readdirSync(checkpoints)[0]!));
    expect(kept.filter((name) => name.endsWith(".bin")).map((name) => fs.readFileSync(path.join(checkpoints, fs.readdirSync(checkpoints)[0]!, name), "utf8"))).toEqual([CART]);

    // The final summary: files, commands, the last test result, Git, and the way back.
    expect(screen).toContain("Committed and pushed to origin.");
    expect(screen).toContain("PawOS made 2 changes in shop:");
    expect(screen).toContain("Edit file  src/cart.js");
    expect(screen).toContain("Created 0, modified 2, deleted 0.");
    expect(screen).toContain("What was pushed is listed under Git below.");
    expect(screen).toContain("PawOS ran 2 commands on this computer:");
    expect(screen).toContain("npm test  exit code 1");
    expect(screen).toContain("npm test  exit code 0");
    expect(screen).toContain("Tests: passed  the last run of npm test");
    expect(screen).toContain("Git:\n    Staged src/cart.js\n    Committed: Fix the cart total going below zero\n    Pushed main to origin");
    expect(screen).toContain("/undo puts these files back as they were before this task. It does not undo commands or commits.");
    expect(screen).not.toContain("Nothing was pushed.");

    // Local work stayed local to this computer and its own Git: PawOS's GitHub endpoints were never used.
    expect(remoteCalls(h)).toEqual([]);
    expect(JSON.stringify(h.server.agentCalls().map((call) => call.body))).not.toContain("s3cr3t");
  }, 120_000);
});

describe("Git needs a yes", () => {
  it.each([["n"], [""], ["cancel"]])("denied commit (%j): nothing is committed and the model is told", async (answer) => {
    write("src/cart.js", FIXED);
    git("add", "src/cart.js");
    const head = git("rev-parse", "HEAD");
    const h = start({ answers: [TASK, "y", answer, null], permissionMode: "ask" });
    h.server.agentTurns = [toolTurn("step-1", "git_commit", { message: "Fix" }), finishTurn("Not committed.")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(results(h)[0]).toEqual({ id: "step-1", ok: false, denied: true, output: GIT_DECLINED });
    expect(h.output()).toContain("Cancelled. Git was not changed.");
    expect(h.output()).not.toContain("Git:\n");
  });

  it.each([["n"], [""], ["cancel"]])("denied push (%j): nothing leaves this computer", async (answer) => {
    write("src/cart.js", FIXED);
    git("commit", "-q", "-am", "Fix");
    const there = remoteGit("rev-parse", "main");
    const h = start({ answers: [TASK, "y", answer, null], permissionMode: "ask" });
    h.server.agentTurns = [toolTurn("step-1", "git_push", {}), finishTurn("Not pushed.")];
    await runCli([], h.ctx);
    expect(remoteGit("rev-parse", "main")).toBe(there);
    expect(results(h)[0]).toEqual({ id: "step-1", ok: false, denied: true, output: GIT_DECLINED });
  });

  it("/mode auto still asks for push — and makes the local Git changes without asking", async () => {
    write("src/cart.js", FIXED);
    const there = remoteGit("rev-parse", "main");
    const h = start({ answers: [TASK, "n", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "git_add", { paths: ["src/cart.js"] }), toolTurn("step-2", "git_commit", { message: "Fix the total" }), toolTurn("step-3", "git_push", {}), finishTurn("Committed; not pushed.")];
    expect(await runCli([], h.ctx)).toBe(0);
    // The only question in the whole task was the push.
    expect(h.prompter.prompts).toEqual(["  > ", PUSH_QUESTION, "  > "]);
    expect(git("log", "-1", "--pretty=%s")).toBe("Fix the total");
    expect(remoteGit("rev-parse", "main")).toBe(there);
    // Unasked is not unseen: the staging and the commit were still shown.
    expect(h.output()).toContain("PawOS wants to stage:");
    expect(h.output()).toContain("PawOS wants to commit:");
    expect(h.output()).toContain("Allowed: auto mode makes local Git changes without asking. A push is always asked about.");
    expect(h.output()).toContain("Git:\n    Staged src/cart.js\n    Committed: Fix the total\n    Nothing was pushed.");
  });

  it("a push is asked about every time, and there is no 'always' for it", async () => {
    write("src/cart.js", FIXED);
    git("commit", "-q", "-am", "Fix");
    const h = start({ answers: [TASK, "a", "always", "y", "n", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "git_push", {}), toolTurn("step-2", "git_push", {}), finishTurn("x")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts.filter((prompt) => prompt === PUSH_QUESTION)).toHaveLength(4);
    expect(h.output()).toContain("Please answer y or n.");
    expect(remoteGit("rev-parse", "main")).toBe(git("rev-parse", "HEAD"));
  });

  it("ask mode asks before every Git change, and 'always allow' for files doesn't cover Git", async () => {
    const h = start({ answers: [TASK, "y", "a", "n", "n", null], permissionMode: "ask" });
    h.server.agentTurns = [toolTurn("step-1", "edit_file", { path: "src/cart.js", oldText: "a + b", newText: "a  +  b" }), toolTurn("step-2", "git_add", { paths: ["src/cart.js"] }), toolTurn("step-3", "git_checkout", { branch: "feature/x", create: true }), finishTurn("x")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts).toEqual(["  > ", TASK_QUESTION, WRITE_QUESTION, STAGE_QUESTION, SWITCH_QUESTION, "  > "]);
    expect(git("diff", "--cached", "--name-only")).toBe("");
    expect(git("branch", "--show-current")).toBe("main");
  });

  it("destructive and history-changing Git can't be asked for at all, in any mode", async () => {
    for (const name of ["git_reset", "git_clean", "git_rebase", "git_merge", "git_force_push", "git_delete_branch", "git_amend"]) {
      const h = start({ answers: [TASK, null], permissionMode: "auto" });
      const head = git("rev-parse", "HEAD");
      h.server.agentTurns = [() => new Response(JSON.stringify({ ok: true, turn: { kind: "tool", call: { id: "step-1", name, args: { hard: true, force: true, branch: "main" } }, note: null }, turnsLeft: 5 }), { status: 200, headers: { "Content-Type": "application/json" } })];
      expect(await runCli([], h.ctx)).toBe(0);
      expect(h.output(), name).toContain("PawOS asked for a step this version can't run.");
      expect(git("rev-parse", "HEAD")).toBe(head);
      expect(exists("src/old.js")).toBe(true);
    }
  });

  it("the Git tools take no flags: force, amend and a remote address are not things they can be given", async () => {
    write("src/cart.js", FIXED);
    git("commit", "-q", "-am", "Fix");
    const there = remoteGit("rev-parse", "main");
    const h = start({ answers: [TASK, "n", null], permissionMode: "auto" });
    const forced = () => new Response(JSON.stringify({ ok: true, turn: { kind: "tool", approved: true, call: { id: "step-1", name: "git_push", args: { force: true, approved: true, refspec: "+HEAD:main" }, approved: true }, note: null }, turnsLeft: 5 }), { status: 200, headers: { "Content-Type": "application/json" } });
    h.server.agentTurns = [forced, toolTurn("step-2", "git_push", { remote: "https://evil.example/x.git" }), toolTurn("step-3", "git_checkout", { branch: "-f" }), toolTurn("step-4", "git_branch", { name: "-D main" }), finishTurn("x")];
    await runCli([], h.ctx);
    // The first was put to the user as an ordinary push (and declined); the rest were refused outright.
    expect(h.prompter.prompts).toEqual(["  > ", PUSH_QUESTION, "  > "]);
    expect(results(h).map((result) => result.denied)).toEqual([true, true, true, true]);
    expect(remoteGit("rev-parse", "main")).toBe(there);
    expect(git("branch", "--list")).toBe("* main");
  });

  it("Ctrl+C at a Git question: a no, and the task stops", async () => {
    write("src/cart.js", FIXED);
    git("add", "src/cart.js");
    const head = git("rev-parse", "HEAD");
    const h = start({ answers: [TASK, "y", INTERRUPT, "n", null], permissionMode: "ask" });
    h.server.agentTurns = [toolTurn("step-1", "git_commit", { message: "Fix" }), finishTurn("never shown")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(h.server.agentCalls()).toHaveLength(1);
    expect(h.output()).toContain("Stopped. Nothing is still running.");
  });
});

describe("/undo", () => {
  const changes = [toolTurn("step-1", "edit_file", { path: "src/cart.js", oldText: "a + b", newText: "a - b" }), toolTurn("step-2", "write_file", { path: "src/new.js", content: "exports.fresh = true;\n" }), toolTurn("step-3", "delete_path", { path: "src/old.js" }), finishTurn("Three changes.")];

  it("puts back a modified file, brings back a deleted one and removes a created one — after asking", async () => {
    const h = start({ answers: [TASK, "y", "/undo", "y", "/undo", null], permissionMode: "auto" });
    h.server.agentTurns = [...changes];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(read("src/cart.js")).toBe(CART);
    expect(exists("src/new.js")).toBe(false);
    expect(read("src/old.js")).toBe("exports.old = true;\n");
    const screen = h.output();
    expect(screen).toContain("Created 1, modified 1, deleted 1.");
    expect(screen).toContain("PawOS can undo the file changes from this task:");
    expect(screen).toContain(TASK);
    expect(screen).toContain("Restore  src/cart.js");
    expect(screen).toContain("Remove (PawOS created it)  src/new.js");
    expect(screen).toContain("Bring back  src/old.js");
    expect(screen.indexOf("Restore  src/cart.js")).toBeLessThan(screen.indexOf(UNDO_QUESTION));
    expect(screen).toContain("Put back 3 files.");
    expect(screen).toContain("Commands that were run and commits that were made are not undone.");
    // Used once: a second /undo has nothing left to do.
    expect(screen).toContain("There is nothing to undo here");
    expect(h.prompter.prompts.filter((prompt) => prompt === UNDO_QUESTION)).toHaveLength(1);
    // Git's own state is as the files now are: nothing differs from the last commit.
    expect(git("status", "--porcelain")).toBe("?? .env");
  });

  it("always asks, in auto mode too; a no keeps everything", async () => {
    const h = start({ answers: [TASK, "y", "/undo", "n", "/undo", "", null], permissionMode: "auto" });
    h.server.agentTurns = [...changes];
    await runCli([], h.ctx);
    expect(h.prompter.prompts.filter((prompt) => prompt === UNDO_QUESTION)).toHaveLength(2);
    expect(h.output()).toContain("Kept. Nothing was changed.");
    expect(read("src/cart.js")).toContain("a - b");
    expect(exists("src/new.js")).toBe(true);
    expect(exists("src/old.js")).toBe(false);
  });

  it("never overwrites what the user changed afterwards: it is shown as left alone, and is", async () => {
    const h = start({ answers: [TASK, "y", "/undo", "y", null], permissionMode: "auto" });
    h.server.agentTurns = [...changes.slice(0, 3), () => (write("src/cart.js", "exports.total = () => 'my own rewrite';\n"), write("src/new.js", "exports.fresh = true;\n// and I added this\n"), finishTurn("Three changes."))];
    await runCli([], h.ctx);
    expect(read("src/cart.js")).toBe("exports.total = () => 'my own rewrite';\n");
    expect(read("src/new.js")).toBe("exports.fresh = true;\n// and I added this\n");
    expect(read("src/old.js")).toBe("exports.old = true;\n");
    const screen = h.output();
    expect(screen).toContain("Leave alone  src/cart.js  It has changed since PawOS changed it.");
    expect(screen).toContain("Leave alone  src/new.js  It has changed since PawOS changed it.");
    expect(screen).toContain("Bring back  src/old.js");
    expect(screen).toContain("Put back 1 file.");
  });

  it("when everything has changed since, it does nothing and asks nothing", async () => {
    const h = start({ answers: [TASK, "/undo", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "edit_file", { path: "src/cart.js", oldText: "a + b", newText: "a - b" }), () => (write("src/cart.js", "mine now\n"), finishTurn("x"))];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Nothing can be undone: every file has changed since, or is already as it was.");
    expect(h.prompter.prompts).not.toContain(UNDO_QUESTION);
    expect(read("src/cart.js")).toBe("mine now\n");
  });

  it("does not undo a commit: the files go back, the history stays, and that is said", async () => {
    const h = start({ answers: [TASK, "/undo", "y", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "edit_file", { path: "src/cart.js", oldText: "a + b", newText: "a - b" }), toolTurn("step-2", "git_add", { paths: ["src/cart.js"] }), toolTurn("step-3", "git_commit", { message: "Change the total" }), finishTurn("Committed.")];
    await runCli([], h.ctx);
    expect(git("log", "-1", "--pretty=%s")).toBe("Change the total");
    expect(read("src/cart.js")).toBe(CART);
    expect(h.output()).toContain("They are committed on this computer only. Nothing was pushed.");
    expect(h.output()).toContain("Commands that were run and commits that were made are not undone.");
  });

  it("with nothing to undo, or outside a project, it says so and touches nothing", async () => {
    const inProject = start({ answers: ["/undo", null] });
    await runCli([], inProject.ctx);
    expect(inProject.output()).toContain("There is nothing to undo here: no PawOS task has file changes left to take back.");
    const outside = harness({ signedIn: true, answers: ["/undo", null] });
    cleanups.push(outside.cleanup);
    await runCli([], outside.ctx);
    expect(outside.output()).toContain("/undo works inside a project, where PawOS has changed files on this computer.");
    expect(outside.server.agentCalls()).toHaveLength(0);
  });

  it("is a command of the workspace, listed in /help, and never a message to PawOS", async () => {
    expect(COMMAND_HELP.map(([name]) => name)).toContain("/undo");
    const h = start({ answers: ["/undo", null] });
    await runCli([], h.ctx);
    expect(h.server.chats()).toHaveLength(0);
    expect(h.server.agentCalls()).toHaveLength(0);
    expect(h.output()).toContain("/undo puts back the files it changed in its last task.");
  });

  it("a task with no recovery copy says so instead of promising /undo", async () => {
    const stateDirectory = path.join(root, "pawos-data");
    fs.mkdirSync(stateDirectory);
    const h = start({ answers: [TASK, null], permissionMode: "auto", stateDirectory });
    h.server.agentTurns = [toolTurn("step-1", "edit_file", { path: "src/cart.js", oldText: "a + b", newText: "a - b" }), finishTurn("x")];
    await runCli([], h.ctx);
    expect(h.output()).toContain("No recovery copy could be kept for this task, so /undo is not available for it.");
    expect(h.output()).not.toContain("/undo puts these files back");
    expect(fs.readdirSync(stateDirectory)).toEqual([]);
  });
});
