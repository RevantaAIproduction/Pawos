import { execFileSync } from "node:child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLocalGit, type LocalGit } from "../git/localRepository";
import type { AgentTurnRequest, AgentTurnResponse, ToolCall, ToolResult } from "../shared";
import { GIT_DECLINED, runLocalTask } from "./agent";
import { branchProblem, prepareGit, withoutCredentials, type GitPlan } from "./gitChanges";
import { openWorkspace, type Workspace } from "./workspace";

// Real Git on Windows takes seconds per test, more under a full parallel run: the 5-second default is too tight.
vi.setConfig({ testTimeout: 30_000 });

/**
 * The Git tools: git_add, git_commit, git_branch, git_checkout and git_push. Each runs against a
 * real repository made for the test, with a bare repository beside it standing in for the remote —
 * so a push is real, and goes nowhere but the test's own temporary folder.
 */
let outer: string;
let root: string;
let remote: string;
let workspace: Workspace;

const SECRET = "s3cr3t-value-0123456789";
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const remoteGit = (...args: string[]) => execFileSync("git", ["--git-dir", remote, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const write = (relative: string, content: string) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const call = (name: string, args: Record<string, string | number | boolean | string[]> = {}, id = "step-1"): ToolCall => ({ id, name, args }) as ToolCall;
const planOf = async (asked: ToolCall, gitRunner?: LocalGit): Promise<GitPlan> => {
  const prepared = await prepareGit(asked, workspace, gitRunner ? { git: gitRunner } : {});
  if (!prepared.ok) throw new Error(`refused: ${prepared.result.output}`);
  return prepared.plan;
};
const refusal = async (asked: ToolCall): Promise<ToolResult> => {
  const prepared = await prepareGit(asked, workspace);
  if (prepared.ok) throw new Error(`allowed: ${prepared.plan.heading}`);
  return prepared.result;
};
const section = (plan: GitPlan, label: string) => plan.sections.find((entry) => entry.label === label)?.lines;
const staged = () => git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
const commits = () => Number(git("rev-list", "--count", "HEAD"));

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-git-")));
  root = path.join(outer, "shop");
  remote = path.join(outer, "remote.git");
  fs.mkdirSync(root);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  write("src/cart.ts", "export const total = 1;\n");
  write("src/tax.ts", "export const tax = 0.2;\n");
  write("README.md", "# Shop\n");
  write(".gitignore", "node_modules\ndist\n");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test User");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "First commit");
  git("remote", "add", "origin", remote);
  git("push", "-q", "-u", "origin", "main");
  // Present, not ignored and not tracked: exactly what must never be staged by accident.
  write(".env", `API_KEY=${SECRET}\n`);
  workspace = openWorkspace(root)!;
});

afterEach(() => fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));

describe("git_add", () => {
  it("stages the files named, after saying exactly which", async () => {
    write("src/cart.ts", "export const total = 2;\n");
    write("src/tax.ts", "export const tax = 0.25;\n");
    const plan = await planOf(call("git_add", { paths: ["src/cart.ts"] }));
    expect(plan).toMatchObject({ tool: "git_add", heading: "PawOS wants to stage:", level: "auto", question: "  Allow staging? [y] stage  [n] cancel\n\n  > " });
    expect(plan.sections).toEqual([{ label: "Files", lines: ["src/cart.ts"] }]);
    expect(staged()).toEqual([]); // preparing changed nothing
    expect(await plan.run()).toEqual({ id: "step-1", ok: true, output: "Staged 1 file:\nsrc/cart.ts" });
    expect(staged()).toEqual(["src/cart.ts"]);
  });

  it("a folder, or everything, is staged file by file — and a secret in it is left out", async () => {
    write("src/cart.ts", "export const total = 2;\n");
    write("src/new.ts", "export const fresh = true;\n");
    write("config/server.pem", "-----BEGIN PRIVATE KEY-----\n");
    fs.rmSync(path.join(root, "README.md"));
    const plan = await planOf(call("git_add", { paths: ["."] }));
    expect(section(plan, "Files")).toEqual(["README.md", "src/cart.ts", "src/new.ts"]);
    expect(section(plan, "Left out")).toEqual(["2 protected files"]);
    await plan.run();
    expect(staged()).toEqual(["README.md", "src/cart.ts", "src/new.ts"]);
    expect(git("status", "--porcelain")).toContain("?? .env");
  });

  it("protected files and anything outside the project can't be staged", async () => {
    for (const target of [".env", "./.env", "src/../.env", "config/server.pem", "../outside.txt", path.join(outer, "x.txt"), "C:\\Windows\\win.ini", "\\\\server\\share\\x", "~/.gitconfig", ".git/config"]) {
      expect(await refusal(call("git_add", { paths: ["src/cart.ts", target] })), target).toMatchObject({ ok: false, denied: true });
    }
    expect((await refusal(call("git_add", { paths: [".env.local"] }))).denied).toBe(true);
    expect(staged()).toEqual([]);
  });

  it("with nothing to stage, it says so", async () => {
    expect(await refusal(call("git_add", { paths: ["src"] }))).toEqual({ id: "step-1", ok: false, output: "There is nothing to stage there." });
    expect(await refusal(call("git_add", { paths: [] }))).toMatchObject({ ok: false });
  });

  it("a flag given as a path is a path, not a flag", async () => {
    write("-A", "a file with an awkward name\n");
    const plan = await planOf(call("git_add", { paths: ["-A"] }));
    expect(section(plan, "Files")).toEqual(["-A"]);
    await plan.run();
    expect(staged()).toEqual(["-A"]);
  });
});

describe("git_commit", () => {
  it("commits what is staged, after showing the files and the message", async () => {
    write("src/cart.ts", "export const total = 2;\n");
    write("src/tax.ts", "export const tax = 0.25;\n");
    git("add", "src/cart.ts", "src/tax.ts");
    const plan = await planOf(call("git_commit", { message: "Fix the cart total\n\nIt was off by one." }));
    expect(plan).toMatchObject({ tool: "git_commit", heading: "PawOS wants to commit:", level: "auto", question: "  Allow this commit? [y] commit  [n] cancel\n\n  > ", summary: "Committed: Fix the cart total" });
    expect(plan.sections).toEqual([{ label: "Branch", lines: ["main"] }, { label: "Files", lines: ["src/cart.ts", "src/tax.ts"] }, { label: "Message", lines: ["Fix the cart total", "", "It was off by one."] }]);
    const before = commits();
    const result = await plan.run();
    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/^Committed [0-9a-f]{7,} on main: Fix the cart total \(2 files\)\. It has not been pushed\.$/);
    expect(commits()).toBe(before + 1);
    expect(git("log", "-1", "--pretty=%B")).toBe("Fix the cart total\n\nIt was off by one.");
    // Committed here; the remote is exactly where it was.
    expect(remoteGit("rev-parse", "main")).not.toBe(git("rev-parse", "HEAD"));
  });

  it("with nothing staged there is nothing to commit", async () => {
    write("src/cart.ts", "export const total = 2;\n");
    expect((await refusal(call("git_commit", { message: "x" }))).output).toBe("Nothing is staged, so there is nothing to commit. Stage the files first (git_add).");
    expect((await refusal(call("git_commit", { message: "   " }))).output).toBe("A commit needs a message.");
  });

  it("a staged secret is never committed", async () => {
    git("add", "-f", ".env");
    const before = commits();
    const result = await refusal(call("git_commit", { message: "Add settings" }));
    expect(result).toMatchObject({ ok: false, denied: true });
    expect(result.output).toContain("the staged changes include a protected file (.env)");
    expect(commits()).toBe(before);
  });

  it("the message is a message: nothing in it is read as an option", async () => {
    for (const message of ["--amend", "-a --no-verify", "--author=Evil <e@x>", "fix; rm -rf / && echo $(whoami) `id` | sh > out"]) {
      fs.appendFileSync(path.join(root, "README.md"), "more\n");
      git("add", "README.md");
      const before = commits();
      expect((await (await planOf(call("git_commit", { message }))).run()).ok, message).toBe(true);
      expect(commits()).toBe(before + 1); // a new commit: the previous one was not rewritten
      expect(git("log", "-1", "--pretty=%s")).toBe(message);
      expect(git("log", "-1", "--pretty=%an")).toBe("Test User");
    }
    expect(fs.existsSync(path.join(root, "out"))).toBe(false);
  });
});

describe("git_branch and git_checkout", () => {
  it("creates a branch without leaving the current one", async () => {
    const plan = await planOf(call("git_branch", { name: "feature/auth-fix" }));
    expect(plan.sections).toEqual([{ label: "Branch", lines: ["feature/auth-fix"] }, { label: "From", lines: ["main"] }]);
    expect((await plan.run()).output).toBe("Created the branch feature/auth-fix from main. You are still on main.");
    expect(git("branch", "--show-current")).toBe("main");
    expect(git("branch", "--list", "feature/auth-fix")).toContain("feature/auth-fix");
    expect((await refusal(call("git_branch", { name: "feature/auth-fix" }))).output).toBe("A branch called feature/auth-fix already exists.");
  });

  it.each(["-D", "-d main", "--force", "-f", "--delete", "-m", "a b", "a..b", "feature/", "x.lock", ".hidden", "HEAD", "../x", "refs/heads/../../x", "a//b", "a:b", "a~1", "a^", "main@{1}", "x;y", "$(id)", ""])("a branch name that isn't a plain name is refused: %j", async (name) => {
    expect(branchProblem(name)).toBeTruthy();
    expect(await refusal(call("git_branch", { name }))).toMatchObject({ ok: false, denied: true });
    expect(await refusal(call("git_checkout", { branch: name }))).toMatchObject({ ok: false, denied: true });
    expect(await refusal(call("git_checkout", { branch: name, create: true }))).toMatchObject({ ok: false, denied: true });
    expect(git("branch", "--list")).toBe("* main");
  });

  it("switches to an existing branch, or creates one and switches", async () => {
    git("branch", "other");
    const plan = await planOf(call("git_checkout", { branch: "other" }));
    expect(plan).toMatchObject({ heading: "PawOS wants to switch branch:", question: "  Allow the switch? [y] switch  [n] cancel\n\n  > ", level: "auto" });
    expect(section(plan, "From")).toEqual(["main"]);
    expect(section(plan, "To")).toEqual(["other"]);
    expect((await plan.run()).output).toBe("Switched to other.");
    expect(git("branch", "--show-current")).toBe("other");
    const created = await planOf(call("git_checkout", { branch: "feature/x", create: true }));
    expect(section(created, "To")).toEqual(["feature/x (new)"]);
    await created.run();
    expect(git("branch", "--show-current")).toBe("feature/x");
  });

  it("says so when there is nothing to switch to, or nothing to do", async () => {
    expect((await refusal(call("git_checkout", { branch: "nope" }))).output).toBe("There is no local branch called nope. Use create to make it.");
    expect((await refusal(call("git_checkout", { branch: "main" }))).output).toBe("You are already on main.");
    expect((await refusal(call("git_checkout", { branch: "main", create: true }))).output).toBe("A branch called main already exists. Switch to it without create.");
  });

  it("a switch never discards work: if it would overwrite a local change, nothing happens", async () => {
    git("switch", "-q", "-c", "other");
    write("src/cart.ts", "export const total = 99;\n");
    git("commit", "-q", "-am", "Other total");
    git("switch", "-q", "main");
    write("src/cart.ts", "export const total = 'my unsaved work';\n");
    const plan = await planOf(call("git_checkout", { branch: "other" }));
    const result = await plan.run();
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/^The switch was not made, and nothing was changed\./);
    expect(git("branch", "--show-current")).toBe("main");
    expect(fs.readFileSync(path.join(root, "src", "cart.ts"), "utf8")).toBe("export const total = 'my unsaved work';\n");
  });
});

describe("git_push", () => {
  it("pushes the current branch to its remote, after showing the branch, the remote and the commits", async () => {
    write("src/cart.ts", "export const total = 2;\n");
    git("commit", "-q", "-am", "Fix the cart total");
    const plan = await planOf(call("git_push"));
    expect(plan).toMatchObject({ tool: "git_push", heading: "PawOS wants to push:", question: "  Allow push? [y] push  [n] cancel\n\n  > ", summary: "Pushed main to origin" });
    // A push is put to the user every time, whatever the mode.
    expect(plan.level).toBe("ask");
    expect(section(plan, "Branch")).toEqual(["main"]);
    expect(section(plan, "Remote")![0]).toMatch(/^origin {2}/);
    expect(section(plan, "Commits")).toEqual([expect.stringMatching(/^[0-9a-f]{7,} Fix the cart total$/)]);
    expect(remoteGit("rev-parse", "main")).not.toBe(git("rev-parse", "HEAD"));
    expect(await plan.run()).toEqual({ id: "step-1", ok: true, output: "Pushed main to origin (1 commit)." });
    expect(remoteGit("rev-parse", "main")).toBe(git("rev-parse", "HEAD"));
  });

  it("a branch the remote doesn't have yet is pushed as new, and tracked", async () => {
    git("switch", "-q", "-c", "feature/auth-fix");
    write("src/cart.ts", "export const total = 3;\n");
    git("commit", "-q", "-am", "Auth fix");
    const plan = await planOf(call("git_push"));
    expect(section(plan, "Branch")).toEqual(["feature/auth-fix (new on origin)"]);
    expect((await plan.run()).ok).toBe(true);
    expect(remoteGit("rev-parse", "feature/auth-fix")).toBe(git("rev-parse", "HEAD"));
    expect(git("rev-parse", "--abbrev-ref", "feature/auth-fix@{upstream}")).toBe("origin/feature/auth-fix");
  });

  it("only to a remote the repository already has, by name — never an address", async () => {
    for (const given of ["https://evil.example/stolen.git", "git@evil.example:x/y.git", "upstream", "--force", "-f", "origin --force", "../remote.git", remote]) {
      expect(await refusal(call("git_push", { remote: given })), given).toMatchObject({ ok: false, denied: true });
    }
    git("remote", "remove", "origin");
    expect((await refusal(call("git_push"))).output).toBe("This repository has no remote to push to.");
  });

  it("with no branch checked out there is nothing to push", async () => {
    git("checkout", "-q", "--detach");
    expect((await refusal(call("git_push"))).output).toMatch(/no branch checked out/);
  });

  it("is never forced, and pushes only the one branch", async () => {
    const asked: string[][] = [];
    const spy: LocalGit = (args, cwd, signal, timeoutMs) => (asked.push(args), runLocalGit(args, cwd, signal, timeoutMs));
    write("src/cart.ts", "export const total = 2;\n");
    git("commit", "-q", "-am", "Fix");
    await (await planOf(call("git_push"), spy)).run();
    const push = asked.find((args) => args[0] === "push")!;
    expect(push).toEqual(["push", "origin", "refs/heads/main:refs/heads/main"]);
    for (const args of asked) expect(args.join(" ")).not.toMatch(/--force|\s-f\b|--mirror|--all|--tags|--delete|\+refs|--no-verify/);
  });

  it("a rejected push is a failure with Git's reason, and nothing is forced through", async () => {
    // The remote moves ahead: someone else pushed.
    const other = path.join(outer, "other");
    execFileSync("git", ["clone", "-q", remote, other], { stdio: "ignore" });
    fs.writeFileSync(path.join(other, "README.md"), "# Theirs\n");
    for (const args of [["config", "user.email", "o@example.com"], ["config", "user.name", "Other"], ["config", "commit.gpgsign", "false"], ["commit", "-q", "-am", "Theirs"], ["push", "-q"]]) execFileSync("git", args, { cwd: other, stdio: "ignore" });
    const theirs = remoteGit("rev-parse", "main");
    write("src/cart.ts", "export const total = 2;\n");
    git("commit", "-q", "-am", "Mine");
    const result = await (await planOf(call("git_push"))).run();
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/^The push did not go through\./);
    expect(result.output).toMatch(/rejected|fetch first|non-fast-forward/);
    expect(result.output).not.toContain(outer);
    expect(remoteGit("rev-parse", "main")).toBe(theirs);
  });

  it("a name and password in a remote's address are never shown or sent", async () => {
    git("remote", "add", "private", "https://deploy:tok3n-abcdef@example.invalid/acme/shop.git");
    const plan = await planOf(call("git_push", { remote: "private" }));
    expect(section(plan, "Remote")).toEqual(["private  https://example.invalid/acme/shop.git"]);
    expect(JSON.stringify(plan)).not.toContain("tok3n");
    expect(withoutCredentials("fatal: unable to access 'https://deploy:tok3n@example.invalid/x.git/'")).toBe("fatal: unable to access 'https://example.invalid/x.git/'");
    expect(withoutCredentials("ssh://git@host/x and http://a:b@h/y")).toBe("ssh://host/x and http://h/y");
  });
});

describe("every Git tool", () => {
  it("acts only on the project's own repository", async () => {
    // A folder inside a repository is not that repository.
    workspace = openWorkspace(path.join(root, "src"))!;
    for (const asked of [call("git_add", { paths: ["cart.ts"] }), call("git_commit", { message: "x" }), call("git_branch", { name: "x" }), call("git_checkout", { branch: "x", create: true }), call("git_push")]) {
      expect(await refusal(asked), asked.name).toMatchObject({ ok: false, denied: true, output: "Not allowed: the Git repository here is not this project's own." });
    }
    // And a folder that isn't in a repository at all has nothing to change.
    const plain = path.join(outer, "plain");
    fs.mkdirSync(plain);
    workspace = openWorkspace(plain)!;
    expect((await refusal(call("git_commit", { message: "x" }))).output).toBe("This project isn't a Git repository, or Git isn't installed.");
  });

  it("is run as an argument list in the project, with nothing the service could add", async () => {
    const asked: { args: string[]; cwd: string }[] = [];
    const spy: LocalGit = (args, cwd, signal, timeoutMs) => (asked.push({ args, cwd }), runLocalGit(args, cwd, signal, timeoutMs));
    write("src/cart.ts", "export const total = 2;\n");
    await (await planOf(call("git_add", { paths: ["src/cart.ts"], force: true, all: true } as never), spy)).run();
    await (await planOf(call("git_commit", { message: "Fix; rm -rf /", amend: true, noVerify: true } as never), spy)).run();
    await (await planOf(call("git_branch", { name: "next", force: true, delete: true } as never), spy)).run();
    await (await planOf(call("git_checkout", { branch: "next", force: true, discard: true } as never), spy)).run();
    const changing = asked.filter(({ args }) => ["add", "commit", "branch", "switch", "push"].includes(args[0]!));
    expect(changing.map(({ args }) => args)).toEqual([["add", "--", "src/cart.ts"], ["commit", "-m", "Fix; rm -rf /"], ["branch", "next"], ["switch", "next"]]);
    for (const { cwd } of asked) expect(cwd).toBe(workspace.root);
    // Everything else it asked Git was a question.
    for (const { args } of asked.filter((entry) => !changing.includes(entry))) expect(["rev-parse", "symbolic-ref", "ls-files", "diff", "show-ref", "remote", "config", "log"]).toContain(args[0]);
  });

  it("stops when the task is stopped, and reports that it did", async () => {
    write("src/cart.ts", "export const total = 2;\n");
    const plan = await planOf(call("git_add", { paths: ["src/cart.ts"] }));
    const stop = new AbortController();
    stop.abort();
    const result = await plan.run(stop.signal);
    expect(result).toEqual({ id: "step-1", ok: false, output: "Staging failed. Stopped." });
    expect(staged()).toEqual([]);
  });

  it("returns bounded output that names no location on this computer", async () => {
    for (let index = 0; index < 250; index++) write(`many/${"long-file-name-".repeat(4)}${index}.ts`, "x\n");
    const result = await (await planOf(call("git_add", { paths: ["many"] }))).run();
    expect(result.ok).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(4020);
    expect(result.output).not.toContain(outer);
    const plan = await planOf(call("git_commit", { message: "Many" }));
    expect(section(plan, "Files")).toHaveLength(20);
    expect(plan.sections.find((entry) => entry.label === "Files")!.more).toBe(230);
  });
});

describe("the loop: Git waits for the user", () => {
  function service(turns: AgentTurnResponse[]) {
    const sent: AgentTurnRequest[] = [];
    return {
      sent,
      results: () => sent.slice(1).map((body) => ("result" in body ? body.result : null)!),
      client: {
        agentTurn: async (body: AgentTurnRequest): Promise<AgentTurnResponse> => {
          sent.push(body);
          const next = turns.shift();
          if (!next) throw new Error("PawOS was asked for a turn the test did not expect.");
          return next;
        },
      },
    };
  }
  const tool = (asked: ToolCall, extra: Record<string, unknown> = {}): AgentTurnResponse => ({ turn: { kind: "tool", call: { ...asked, ...extra }, note: null, ...extra }, turnsLeft: 10, ...extra }) as AgentTurnResponse;
  const finish = (summary: string): AgentTurnResponse => ({ turn: { kind: "finish", summary }, turnsLeft: 0 });
  const options = (client: ReturnType<typeof service>["client"]) => ({ client, workspace, branch: "main", taskId: "11111111-2222-4333-8444-555555555555", goal: "Commit the fix" });

  beforeEach(() => write("src/cart.ts", "export const total = 2;\n"));

  it("approved: staged, committed and pushed here, each result going back to the model", async () => {
    const pawos = service([tool(call("git_add", { paths: ["src/cart.ts"] })), tool(call("git_commit", { message: "Fix the total" }, "step-2")), tool(call("git_push", {}, "step-3")), finish("Pushed.")]);
    const asked: GitPlan[] = [];
    const outcome = await runLocalTask({ ...options(pawos.client), approveGit: async (plan) => (asked.push(plan), "allow") });
    expect(outcome.status).toBe("finished");
    expect(asked.map((plan) => [plan.tool, plan.level])).toEqual([["git_add", "auto"], ["git_commit", "auto"], ["git_push", "ask"]]);
    expect(pawos.results().map((result) => result.ok)).toEqual([true, true, true]);
    expect(outcome.steps.map((step) => step.git)).toEqual([{ tool: "git_add", summary: "Staged src/cart.ts" }, { tool: "git_commit", summary: "Committed: Fix the total" }, { tool: "git_push", summary: "Pushed main to origin" }]);
    expect(remoteGit("log", "-1", "--pretty=%s", "main")).toBe("Fix the total");
  });

  it("denied: Git is untouched, and the model is told the user said no", async () => {
    git("add", "src/cart.ts");
    const head = git("rev-parse", "HEAD");
    const pawos = service([tool(call("git_commit", { message: "Fix" })), tool(call("git_push", {}, "step-2")), tool(call("git_checkout", { branch: "x", create: true }, "step-3")), finish("Nothing done.")]);
    const outcome = await runLocalTask({ ...options(pawos.client), approveGit: async () => "deny" });
    expect(outcome.status).toBe("finished");
    for (const result of pawos.results()) expect(result).toEqual({ id: result.id, ok: false, denied: true, output: GIT_DECLINED });
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(git("branch", "--show-current")).toBe("main");
    expect(remoteGit("rev-parse", "main")).toBe(head);
    expect(outcome.steps.some((step) => step.git)).toBe(false);
  });

  it("with nobody to ask, Git is not changed", async () => {
    const head = git("rev-parse", "HEAD");
    const pawos = service([tool(call("git_add", { paths: ["src/cart.ts"] })), tool(call("git_push", {}, "step-2")), finish("x")]);
    await runLocalTask(options(pawos.client));
    expect(pawos.results().map((result) => result.denied)).toEqual([true, true]);
    expect(staged()).toEqual([]);
    expect(remoteGit("rev-parse", "main")).toBe(head);
  });

  it("the service can't approve a push, force it, or point it somewhere else", async () => {
    git("commit", "-q", "-am", "Fix");
    const head = remoteGit("rev-parse", "main");
    const flags = { approved: true, safe: true, level: "auto", risk: "read", force: true };
    const pawos = service([
      { turn: { kind: "tool", call: { id: "step-1", name: "git_push", args: { force: true, approved: true, refspec: "+main:main", url: "https://evil.example/x.git" }, ...flags }, note: null, ...flags }, turnsLeft: 5, ...flags } as unknown as AgentTurnResponse,
      finish("x"),
    ]);
    const asked: GitPlan[] = [];
    await runLocalTask({ ...options(pawos.client), approveGit: async (plan) => (asked.push(plan), "deny") });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.level).toBe("ask");
    expect(section(asked[0]!, "Remote")![0]).toMatch(/^origin {2}/);
    expect(JSON.stringify(asked[0])).not.toContain("evil.example");
    expect(remoteGit("rev-parse", "main")).toBe(head);
  });

  it("cancelled while the question is open: nothing is committed and nothing more is sent", async () => {
    git("add", "src/cart.ts");
    const head = git("rev-parse", "HEAD");
    const stop = new AbortController();
    const pawos = service([tool(call("git_commit", { message: "Fix" })), finish("never")]);
    const outcome = await runLocalTask({ ...options(pawos.client), signal: stop.signal, approveGit: () => new Promise(() => stop.abort()) });
    expect(outcome.status).toBe("cancelled");
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(pawos.sent).toHaveLength(1);
  });
});
