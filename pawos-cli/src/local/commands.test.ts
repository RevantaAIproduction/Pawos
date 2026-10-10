import { execFileSync } from "node:child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_CLIENT_LIMITS, type AgentTurnRequest, type AgentTurnResponse, type ToolCall, type ToolResult } from "../shared";
import { COMMAND_DECLINED, runLocalTask } from "./agent";
import { ALLOWED_COMMANDS, GIT_MUTATION_REFUSED, classifyCommand, displayCommand, findDangerousShellSyntax, validateCommand, type AllowedCommand } from "./commandPolicy";
import { BUILD_TIMEOUT_MS, COMMAND_TIMEOUT_MS, TEST_TIMEOUT_MS, parseTestOutput, prepareCommand, runPlanned, scrubOutput, startArguments, type CommandPlan } from "./commands";
import { STREAM_CHARS, childEnvironment, isSecretName, runProcess, secretValues } from "./process";
import { openWorkspace, type Workspace } from "./workspace";

/**
 * Running programs on this computer: run_command, run_tests and build. The policy is tested as a
 * table; the runner is tested with real, harmless programs (node, git, npm) in a throwaway folder
 * made for the test. Nothing destructive is ever started here.
 */
let outer: string;
let root: string;
let workspace: Workspace;

const write = (relative: string, content: string, base = root) => {
  const file = path.join(base, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const call = (name: string, args: Record<string, string | number | boolean | string[]> = {}, id = "step-1"): ToolCall => ({ id, name, args }) as ToolCall;
const command = (program: string, args: string[] = [], cwd?: string) => call("run_command", { command: program, args, ...(cwd === undefined ? {} : { cwd }) });
const planOf = (asked: ToolCall): CommandPlan => {
  const prepared = prepareCommand(asked, workspace);
  if (!prepared.ok) throw new Error(`refused: ${prepared.result.output}`);
  return prepared.plan;
};
const refusal = (asked: ToolCall): ToolResult => {
  const prepared = prepareCommand(asked, workspace);
  if (prepared.ok) throw new Error(`allowed: ${prepared.plan.display}`);
  return prepared.result;
};
const run = (asked: ToolCall, signal?: AbortSignal) => runPlanned(asked, planOf(asked), workspace, { signal });
function link(target: string, at: string, kind: "file" | "dir"): boolean {
  try {
    fs.symlinkSync(target, at, kind === "dir" && process.platform === "win32" ? "junction" : kind);
    return true;
  } catch {
    return false;
  }
}
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (done: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!done() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
  return done();
};

const SECRET = "s3cr3t-value-0123456789";

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-commands-")));
  root = path.join(outer, "shop");
  fs.mkdirSync(root);
  write("package.json", JSON.stringify({ name: "shop", scripts: { test: "node test.js", build: "node build.js" } }));
  write("test.js", "console.log('Tests:       0 failed, 2 passed, 2 total');\n");
  write("build.js", "console.log('built');\n");
  write("src/cart.ts", "export const total = 1;\n");
  write(".env", `API_KEY=${SECRET}\n`);
  write("config/server.pem", "-----BEGIN PRIVATE KEY-----\n");
  write("node_modules/x/index.js", "x\n");
  write("../outside.txt", "OUTSIDE\n");
  workspace = openWorkspace(root)!;
  process.env.PAWOS_TEST_SECRET_TOKEN = SECRET;
  process.env.MY_SERVICE_API_KEY = "another-secret-abcdefgh";
});

afterEach(() => {
  delete process.env.PAWOS_TEST_SECRET_TOKEN;
  delete process.env.MY_SERVICE_API_KEY;
  fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("what may be run: a program from the list, and a list of plain arguments", () => {
  it("allowed commands", () => {
    expect(validateCommand("npm", ["test"])).toEqual({ ok: true, command: "npm", args: ["test"] });
    expect(validateCommand(" Git ", ["status", "--short"])).toEqual({ ok: true, command: "git", args: ["status", "--short"] });
    expect(validateCommand("node", undefined)).toEqual({ ok: true, command: "node", args: [] });
    expect(validateCommand("npm", ["run", "test", "--", "-t", "adds two numbers"])).toMatchObject({ ok: true });
    for (const program of ALLOWED_COMMANDS) expect(validateCommand(program, ["--version"]).ok).toBe(true);
  });

  it("a program that isn't on the list is never run", () => {
    for (const program of ["rm", "del", "rmdir", "format", "curl", "wget", "bash", "sh", "zsh", "cmd", "powershell", "pwsh", "sudo", "su", "chmod", "chown", "mv", "cp", "dd", "kill", "taskkill", "start", "open", "xdg-open", "explorer", "docker", "kubectl", "ssh", "scp", "aws", "terraform", "gh", "make", "env", "printenv", "set"]) {
      expect(validateCommand(program, []), program).toMatchObject({ ok: false });
    }
  });

  it("the program is a name, never a path or a command line: no arbitrary executable", () => {
    for (const program of ["./evil", ".\\evil.exe", "/bin/sh", "/usr/bin/git", "C:\\Windows\\System32\\cmd.exe", "C:/tools/node", "..\\node", "node.exe", "npm.cmd", "git status", "npm test", "node;calc", "", "   ", "-rf"]) {
      expect(validateCommand(program, []), program).toMatchObject({ ok: false });
    }
    for (const program of [null, undefined, 7, ["npm"], { command: "npm" }]) expect(validateCommand(program, [])).toMatchObject({ ok: false });
  });

  it("arguments are a list of strings, bounded", () => {
    expect(validateCommand("npm", "test")).toMatchObject({ ok: false });
    expect(validateCommand("npm", ["test", 7])).toMatchObject({ ok: false });
    expect(validateCommand("npm", [["test"]])).toMatchObject({ ok: false });
    expect(validateCommand("npm", { 0: "test" })).toMatchObject({ ok: false });
    expect(validateCommand("npm", Array.from({ length: 65 }, () => "x"))).toMatchObject({ ok: false });
    expect(validateCommand("npm", ["x".repeat(2001)])).toMatchObject({ ok: false });
  });

  it.each([
    ["command chaining with &&", ["test", "&&", "curl", "evil"], "&&"],
    ["command chaining inside one argument", ["test && curl evil"], "&&"],
    ["command chaining with ||", ["test", "||", "calc"], "||"],
    ["command chaining with ;", ["test; calc"], ";"],
    ["a background &", ["test", "&"], "&"],
    ["a pipe", ["test", "|", "sh"], "|"],
    ["a pipe inside one argument", ["test|sh"], "|"],
    ["a redirect out", ["test", ">", "out.txt"], ">"],
    ["an append redirect", ["test>>out.txt"], ">"],
    ["a redirect in", ["<", "input.txt"], "<"],
    ["command substitution with $()", ["$(whoami)"], "$("],
    ["command substitution with backticks", ["`whoami`"], "`"],
    ["a line break", ["test\ncalc"], "newline"],
    ["a carriage return", ["test\rcalc"], "newline"],
  ])("shell syntax is rejected: %s", (_label, args, operator) => {
    const result = validateCommand("npm", args);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(`contains "${operator}"`);
    expect(findDangerousShellSyntax(args.join(" "))).toBe(operator);
  });

  it("quoting can't hide shell syntax: it is refused wherever it appears", () => {
    for (const arg of ['"a && b"', "'a | b'", '--msg="x; y"', "a\tb", "a\u0007b"]) expect(validateCommand("git", ["log", arg]), arg).toMatchObject({ ok: false });
  });

  it("on Windows, nothing its command interpreter would expand reaches a script command", () => {
    for (const arg of ["%PATH%", "%USERPROFILE%\\x", "a^b", 'say "hi"']) {
      expect(validateCommand("npm", ["run", "x", arg], "win32"), arg).toMatchObject({ ok: false });
      expect(validateCommand("pnpm", [arg], "win32"), arg).toMatchObject({ ok: false });
    }
    // A real program is started directly, so these are only characters.
    expect(validateCommand("node", ["script.js", "100%"], "win32")).toMatchObject({ ok: true });
    expect(validateCommand("npm", ["run", "x", "100%"], "linux")).toMatchObject({ ok: true });
  });

  it("the command is shown as it is, with nothing that can drive the terminal", () => {
    expect(displayCommand("npm", ["run", "test", "--", "-t", "adds two"])).toBe('npm run test -- -t "adds two"');
    expect(displayCommand("git", ["commit", "-m", ""])).toBe('git commit -m ""');
    expect(displayCommand("node", ["a\u001b[2Jb"])).toBe("node a[2Jb");
  });
});

describe("how carefully a command is treated — decided here, from the command", () => {
  const level = (line: string) => {
    const [program, ...args] = line.split(" ");
    return classifyCommand(program as AllowedCommand, args).level;
  };

  it.each([
    "node --version", "node -v", "npm --version", "git --version", "python --version", "pip --version", "java -version",
    "npm test", "npm t", "npm run build", "npm run lint", "npm run-script typecheck", "npm run test -- -t cart", "npm ls", "npm list --depth=0",
    "yarn test", "yarn run build", "pnpm test", "pnpm run lint",
    "npx --no-install tsc --noEmit", "npx --no-install vitest run", "npx --no eslint src", "npx --no-install prettier --check .",
    "node --test", "python -m pytest", "python3 -m unittest", "py -m pytest -q", "pip list", "pip show requests", "pip freeze",
    "git status", "git status --short", "git diff", "git diff --stat", "git log --oneline -n 5", "git show HEAD", "git rev-parse HEAD", "git ls-files",
    "git branch", "git branch -a", "git branch --show-current", "git remote -v", "git tag", "git tag --list", "git stash list", "git describe --tags", "git blame README.md",
  ])("a routine development command runs in auto mode: %s", (line) => {
    expect(level(line)).toBe("auto");
  });

  it.each([
    // package installation, and anything that can change dependencies
    "npm install", "npm i", "npm i lodash", "npm install --save-dev vitest", "npm ci", "npm add lodash", "npm uninstall lodash", "npm remove lodash", "npm rm lodash", "npm update", "npm upgrade",
    "npm dedupe", "npm prune", "npm link", "npm rebuild", "npm audit fix", "npm exec cowsay", "npm init -y", "npm install -g typescript", "npm test --prefix other",
    "yarn", "yarn install", "yarn add lodash", "yarn remove lodash", "yarn upgrade", "yarn dlx cowsay", "yarn global add x",
    "pnpm install", "pnpm i", "pnpm add lodash", "pnpm remove lodash", "pnpm update", "pnpm dlx cowsay", "pnpm",
    "pip install requests", "pip uninstall requests", "pip3 install -r requirements.txt",
    "npx cowsay hi", "npx tsc --noEmit", "npx --no-install some-unknown-tool", "npx --no-install eslint --fix src", "npx --no-install prettier --write .",
    // force operations on otherwise routine commands
    "npm test --force", "npm run build -f", "git status --no-verify", "npm run lint --yes",
    // running code, or anything not recognised
    "node script.js", "node", "node -e 1", "node --eval 1", "node -p 1", "node -r ./hook script.js", "python script.py", "python -c 1", "python", "java Main", "javac Main.java",
    "npm publish", "npm version patch", "npm config list", "npm login", "npm start", "npm pkg set x=y", "yarn publish", "yarn build", "pnpm publish", "pip download x",
  ])("always put to the user, whatever the mode: %s", (line) => {
    expect(level(line)).toBe("ask");
  });

  it.each([
    "git push", "git push origin main", "git push --force", "git push -f", "git push --force-with-lease", "git reset", "git reset --hard", "git reset --hard HEAD~1", "git clean -fd", "git clean -n", "git checkout .", "git checkout main", "git checkout -- src/cart.ts", "git switch main", "git switch -c feature", "git restore .", "git restore --staged x", "git commit -m wip", "git add .", "git rm src/cart.ts", "git mv a b", "git merge main", "git rebase main", "git pull", "git fetch", "git stash", "git stash pop", "git stash drop", "git branch feature", "git branch -D feature", "git branch -m old new", "git tag v1", "git tag -d v1", "git remote add origin x", "git remote remove origin", "git config user.name x", "git init", "git clone x", "git diff --output=patch.txt", "git gc", "git worktree add x",
    "git cherry-pick abc123", "git revert HEAD", "git commit --amend", "git push origin :main", "git push --delete origin main", "git update-ref -d refs/heads/main", "git filter-branch", "git am x.patch", "git apply x.patch",
    "git bisect start", "git submodule update", "git notes add", "git branch --list -D feature", "git tag -l -d v1", "git stash list --all drop", "git log --output=x.txt", "git show --ext-diff", "git diff --textconv",
    "git", "git help", "git frobnicate",
  ])("Git mutation cannot happen through run_command: %s is never run", (line) => {
    const [program, ...args] = line.split(" ");
    const verdict = classifyCommand(program as AllowedCommand, args);
    expect(verdict.level).toBe("refuse");
    expect(verdict.reason).toBeTruthy();
  });

  it("the refusal says where Git changes are made instead", () => {
    for (const args of [["push"], ["commit", "-m", "x"], ["add", "."], ["checkout", "main"], ["reset", "--hard"]]) {
      expect(classifyCommand("git", args)).toEqual({ level: "refuse", reason: GIT_MUTATION_REFUSED });
    }
    expect(GIT_MUTATION_REFUSED).toMatch(/git_add, git_commit, git_branch, git_checkout and git_push/);
    const refused = refusal(command("git", ["push", "--force"]));
    expect(refused).toEqual({ id: "step-1", ok: false, denied: true, output: `Not allowed: ${GIT_MUTATION_REFUSED}` });
  });

  it.each(["git -C .. status", "git -C /etc status", "git -c core.pager=calc log", "git --no-pager -C .. status", "git --git-dir=../other/.git status", "git --work-tree=.. status", "git -c alias.x=!calc x", "git --exec-path=/tmp status", "npm run env", "yarn run env", "pnpm run env", "npm env", "yarn env", "pnpm env"])("never run: %s", (line) => {
    expect(level(line)).toBe("refuse");
  });

  it("says why a command is always asked about", () => {
    expect(classifyCommand("npm", ["install"]).reason).toBe("It can install, remove or change this project's dependencies.");
    expect(classifyCommand("npm", ["test", "--force"]).reason).toBe("It forces something that is normally checked.");
    expect(classifyCommand("npx", ["cowsay"]).reason).toBe("npx can download a package and run it.");
    expect(classifyCommand("node", ["-e", "1"]).reason).toBe("It runs code given on the command line.");
    expect(classifyCommand("npm", ["test"]).reason).toBeNull();
  });
});

describe("where a command may run, and what it may be pointed at", () => {
  it("runs in the project, or a folder inside it — worked out here", () => {
    expect(planOf(command("node", ["--version"]))).toMatchObject({ tool: "run_command", bin: "node", args: ["--version"], display: "node --version", cwd: workspace.root, cwdRelative: ".", level: "auto", reason: null, timeoutMs: COMMAND_TIMEOUT_MS });
    expect(planOf(command("git", ["status"], "src"))).toMatchObject({ cwd: path.join(workspace.root, "src"), cwdRelative: "src" });
    expect(planOf(command("npm", ["install"]))).toMatchObject({ level: "ask", reason: "It can install, remove or change this project's dependencies." });
  });

  it.each([
    ["path traversal", ".."],
    ["path traversal through a folder", "src/../.."],
    ["an absolute path", "/"],
    ["an absolute path outside the workspace", "ABSOLUTE"],
    ["a Windows drive", "C:\\Windows"],
    ["a UNC path", "\\\\server\\share"],
    ["the home folder", "~"],
    ["a folder that doesn't exist", "nowhere"],
    ["a file", "package.json"],
    ["Git's own data", ".git"],
    ["installed dependencies", "node_modules/x"],
  ])("workspace cwd enforcement: %s is refused", (_label, given) => {
    if (given === ".git") fs.mkdirSync(path.join(root, ".git"));
    const result = refusal(command("git", ["status"], given === "ABSOLUTE" ? outer : given));
    expect(result).toMatchObject({ ok: false, denied: true });
    expect(result.output).not.toContain(outer);
  });

  it("symlink escape: a linked folder can't be used as the place to run", () => {
    fs.mkdirSync(path.join(outer, "elsewhere"));
    if (!link(path.join(outer, "elsewhere"), path.join(root, "linked"), "dir")) return;
    expect(refusal(command("git", ["status"], "linked"))).toMatchObject({ denied: true });
    expect(refusal(call("run_tests", { cwd: "linked" }))).toMatchObject({ denied: true });
  });

  it.each([
    ["a relative path out of the project", ["../outside.txt"]],
    ["a deeper traversal", ["src/../../outside.txt"]],
    ["a backslash traversal", ["..\\outside.txt"]],
    ["an absolute path", ["ABSOLUTE"]],
    ["a Windows drive path", ["C:\\Windows\\win.ini"]],
    ["a UNC path", ["\\\\server\\share\\x.js"]],
    ["the home folder", ["~/.ssh/id_rsa"]],
    ["a flag whose value points out", ["--out=../outside.txt"]],
    ["a flag whose value is absolute", ["--prefix=ABSOLUTE"]],
    ["a secret file", [".env"]],
    ["a secret file by another spelling", ["./src/../.ENV"]],
    ["a key file", ["config/server.pem"]],
    ["a secret through Git's revision syntax", ["HEAD:.env"]],
    ["a secret as a flag's value", ["--env-file=.env"]],
    ["a file address", ["file:///etc/passwd"]],
    ["a file address as a flag's value", ["--config=file://C:/Windows/win.ini"]],
  ])("no execution outside the workspace: an argument naming %s is refused", (_label, args) => {
    const given = args.map((arg) => arg.replace("ABSOLUTE", path.join(outer, "outside.txt")));
    for (const program of ["node", "git"]) {
      const result = refusal(command(program, ["show", ...given]));
      expect(result, program).toMatchObject({ ok: false, denied: true });
      expect(result.output).not.toContain(outer);
    }
  });

  it("symlink escape: an argument that is a link out of the project is refused", () => {
    if (!link(path.join(outer, "outside.txt"), path.join(root, "notes.txt"), "file")) return;
    expect(refusal(command("node", ["notes.txt"]))).toMatchObject({ denied: true, output: "Not allowed: an argument is a link that leads outside this project." });
    if (link(path.join(root, ".env"), path.join(root, "settings.txt"), "file")) expect(refusal(command("node", ["settings.txt"]))).toMatchObject({ denied: true });
  });

  it("ordinary arguments are not mistaken for paths", () => {
    for (const args of [["run", "test", "--", "-t", "cart"], ["log", "--oneline", "-n", "5"], ["--registry=https://registry.npmjs.org/"], ["show", "HEAD~2:src/cart.ts"], ["diff", "main...feature"], ["dist/server.js"], ["node_modules/x/index.js"]]) {
      expect(prepareCommand(command("node", args), workspace).ok, args.join(" ")).toBe(true);
    }
  });

  it("the policy's refusals are refusals here too, before anything runs", () => {
    for (const asked of [command("rm", ["-rf", "."]), command("npm", ["test", "&&", "calc"]), command("git", ["-C", "..", "status"]), command("npm", ["run", "env"]), command("C:\\Windows\\System32\\cmd.exe", ["/c", "dir"]), call("run_command", { args: ["test"] }), call("read_file", { path: "x" })]) {
      expect(refusal(asked), JSON.stringify(asked.args)).toMatchObject({ ok: false, denied: true });
    }
  });
});

describe("run_tests and build: the project's own scripts, never the model's command", () => {
  it("uses the script the project defines, with the package manager its lockfile names", () => {
    expect(planOf(call("run_tests"))).toMatchObject({ tool: "run_tests", bin: "npm", args: ["test"], display: "npm test", level: "auto", timeoutMs: TEST_TIMEOUT_MS });
    expect(planOf(call("build"))).toMatchObject({ tool: "build", bin: "npm", args: ["run", "build"], display: "npm run build", level: "auto", timeoutMs: BUILD_TIMEOUT_MS });
    write("yarn.lock", "");
    expect(planOf(call("run_tests")).display).toBe("yarn test");
    write("pnpm-lock.yaml", "");
    expect(planOf(call("build")).display).toBe("pnpm run build");
  });

  it("a command smuggled into run_tests or build is not what runs", () => {
    expect(planOf(call("run_tests", { command: "git", args: ["push", "--force"] }))).toMatchObject({ bin: "npm", args: ["test"] });
    expect(planOf(call("build", { command: "rm", args: ["-rf", "."] }))).toMatchObject({ bin: "npm", args: ["run", "build"] });
  });

  it("with no script, nothing is invented", () => {
    write("package.json", JSON.stringify({ name: "shop", scripts: { test: 'echo "Error: no test specified" && exit 1' } }));
    expect(refusal(call("run_tests"))).toEqual({ id: "step-1", ok: false, output: 'This project\'s "test" script is the stub npm creates; it has no tests to run.' });
    expect(refusal(call("build"))).toEqual({ id: "step-1", ok: false, output: 'This project\'s package.json defines no "build" script.' });
    fs.rmSync(path.join(root, "package.json"));
    expect(refusal(call("run_tests")).output).toMatch(/no readable package\.json/);
    write("package.json", "{ not json");
    expect(refusal(call("build")).output).toMatch(/no readable package\.json/);
  });

  it("a package in a folder of the project runs there", () => {
    write("packages/api/package.json", JSON.stringify({ scripts: { test: "node t.js" } }));
    expect(planOf(call("run_tests", { cwd: "packages/api" }))).toMatchObject({ cwdRelative: "packages/api", cwd: path.join(workspace.root, "packages", "api") });
  });
});

describe("real commands, run locally", () => {
  it("node --version", async () => {
    const result = await run(command("node", ["--version"]));
    expect(result).toMatchObject({ id: "step-1", ok: true, exitCode: 0 });
    expect(result.output).toMatch(/^\$ node --version {3}\(in \.\)\nExit code 0\.\n--- output ---\nv\d+\.\d+\.\d+$/);
  });

  it("git status", async () => {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    const result = await run(command("git", ["status", "--short", "--branch"]));
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(result.output).toContain("## No commits yet on main");
    expect(result.output).toContain("?? package.json");
  });

  it("npm --version: a script command on Windows, still started without a shell", async () => {
    const result = await run(command("npm", ["--version"]));
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(result.output).toMatch(/--- output ---\n\d+\.\d+\.\d+/);
  }, 60_000);

  it("run_tests runs the project's test script and reads its summary", async () => {
    const result = await run(call("run_tests"));
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(result.output).toContain("$ npm test   (in .)");
    expect(result.output).toContain("Tests passed: 2 passed, 0 failed, 2 in all.");
  }, 60_000);

  it("a failing test run is a failure, with its counts", async () => {
    write("test.js", "console.log('Tests:       1 failed, 1 passed, 2 total'); process.exit(1);\n");
    const result = await run(call("run_tests"));
    expect(result).toMatchObject({ ok: false, exitCode: 1 });
    expect(result.output).toContain("Tests failed: 1 passed, 1 failed, 2 in all.");
  }, 60_000);

  it("build runs the project's build script", async () => {
    const result = await run(call("build"));
    expect(result).toMatchObject({ ok: true, exitCode: 0 });
    expect(result.output).toContain("built");
  }, 60_000);

  it("a non-zero exit code is reported, and is not ok", async () => {
    write("fail.js", "console.log('working'); console.error('boom: something broke'); process.exit(3);\n");
    const result = await run(command("node", ["fail.js"]));
    expect(result).toMatchObject({ id: "step-1", ok: false, exitCode: 3 });
    expect(result.timedOut).toBeUndefined();
    expect(result.cancelled).toBeUndefined();
    expect(result.output).toBe("$ node fail.js   (in .)\nExit code 3.\n--- output ---\nworking\n--- errors ---\nboom: something broke");
  });

  it("stderr is kept apart from stdout, and a silent command says so", async () => {
    write("warn.js", "console.error('warning: deprecated');\n");
    expect((await run(command("node", ["warn.js"]))).output).toBe("$ node warn.js   (in .)\nExit code 0.\n--- errors ---\nwarning: deprecated");
    write("quiet.js", "");
    expect((await run(command("node", ["quiet.js"]))).output).toBe("$ node quiet.js   (in .)\nExit code 0.\n(it printed nothing)");
  });

  it("runs in the folder that was asked for, inside the project", async () => {
    write("src/where.js", "console.log(require('path').basename(process.cwd()));\n");
    const result = await run(command("node", ["where.js"], "src"));
    expect(result.output).toBe("$ node where.js   (in src)\nExit code 0.\n--- output ---\nsrc");
  });

  it("no shell execution: arguments reach the program exactly as given, unexpanded", async () => {
    write("args.js", "console.log(JSON.stringify(process.argv.slice(2)));\n");
    const args = ["a b", "$HOME", "%PATH%", "*", "'q'", "~", "$(whoami)", "a&&b", "x;y", "back`tick`", "!hist", "{a,b}"];
    const outcome = await runProcess("node", ["args.js", ...args], { cwd: root, timeoutMs: 20_000 });
    expect(outcome.exitCode).toBe(0);
    expect(JSON.parse(outcome.stdout)).toEqual(args);
  });

  it("a program that isn't installed is a failed result, not a crash", async () => {
    const outcome = await runProcess("pawos-no-such-program-xyz", [], { cwd: root, timeoutMs: 5000 });
    expect(outcome).toMatchObject({ exitCode: null, failedToStart: "That program isn't installed, or isn't on your PATH." });
    const result = await runPlanned(call("run_command"), { ...planOf(command("node", ["--version"])), bin: "pawos-no-such-program-xyz" as AllowedCommand }, workspace);
    expect(result).toMatchObject({ ok: false, exitCode: null });
  });

  it("a program that waits for input gets none, instead of hanging", async () => {
    write("ask.js", "let got = ''; process.stdin.on('data', (d) => (got += d)); process.stdin.on('end', () => console.log('input ended:' + got.length));\n");
    const result = await run(command("node", ["ask.js"]));
    expect(result.output).toContain("input ended:0");
  });

  it("timeout: a command that runs too long is stopped, and says so", async () => {
    write("slow.js", "console.log('started'); setInterval(() => {}, 1000);\n");
    const started = Date.now();
    const plan = { ...planOf(command("node", ["slow.js"])), timeoutMs: 700 };
    const result = await runPlanned(command("node", ["slow.js"]), plan, workspace);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result).toMatchObject({ ok: false, exitCode: null, timedOut: true });
    expect(result.output).toContain("Stopped: it was still running after 1 seconds.");
    expect(result.output).toContain("started");
  }, 30_000);

  it("cancellation: Ctrl+C stops the program and reports it as stopped", async () => {
    write("slow.js", "console.log('started'); setInterval(() => {}, 1000);\n");
    const stop = new AbortController();
    const started = Date.now();
    setTimeout(() => stop.abort(), 600);
    const result = await run(command("node", ["slow.js"]), stop.signal);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result).toMatchObject({ ok: false, exitCode: null, cancelled: true });
    expect(result.output).toContain("Stopped by the user (Ctrl+C) before it finished.");
  }, 30_000);

  it("cancellation takes the whole process tree: no orphaned child is left running", async () => {
    write("child.js", "require('fs').writeFileSync('child.pid', String(process.pid)); setInterval(() => {}, 1000);\n");
    write("parent.js", "require('child_process').spawn(process.execPath, ['child.js'], { stdio: 'ignore' }); require('fs').writeFileSync('parent.pid', String(process.pid)); setInterval(() => {}, 1000);\n");
    const stop = new AbortController();
    const running = run(command("node", ["parent.js"]), stop.signal);
    expect(await until(() => fs.existsSync(path.join(root, "child.pid")) && fs.existsSync(path.join(root, "parent.pid")), 15_000)).toBe(true);
    const parent = Number(fs.readFileSync(path.join(root, "parent.pid"), "utf8"));
    const child = Number(fs.readFileSync(path.join(root, "child.pid"), "utf8"));
    expect(alive(parent)).toBe(true);
    expect(alive(child)).toBe(true);
    stop.abort();
    expect((await running).cancelled).toBe(true);
    expect(await until(() => !alive(parent) && !alive(child), 10_000)).toBe(true);
  }, 60_000);

  it("a timeout takes the process tree too", async () => {
    write("child.js", "require('fs').writeFileSync('child.pid', String(process.pid)); setInterval(() => {}, 1000);\n");
    write("parent.js", "require('child_process').spawn(process.execPath, ['child.js'], { stdio: 'ignore' }); setInterval(() => {}, 1000);\n");
    const outcome = await runProcess("node", ["parent.js"], { cwd: root, timeoutMs: 2500 });
    expect(outcome.timedOut).toBe(true);
    const child = Number(fs.readFileSync(path.join(root, "child.pid"), "utf8"));
    expect(await until(() => !alive(child), 10_000)).toBe(true);
  }, 60_000);

  it("already cancelled: the program is never started", async () => {
    write("mark.js", "require('fs').writeFileSync('ran.txt', 'x');\n");
    const stop = new AbortController();
    stop.abort();
    expect(await run(command("node", ["mark.js"]), stop.signal)).toMatchObject({ ok: false, cancelled: true });
    expect(fs.existsSync(path.join(root, "ran.txt"))).toBe(false);
  });

  it("output truncation: memory is bounded, the end is kept, and the result says it was cut", async () => {
    write("noisy.js", "for (let i = 0; i < 40000; i++) console.log('line ' + i + ' ' + 'x'.repeat(40)); console.error('e'.repeat(300000)); console.log('THE END');\n");
    const outcome = await runProcess("node", ["noisy.js"], { cwd: root, timeoutMs: 60_000 });
    expect(outcome.truncated).toBe(true);
    expect(outcome.stdout.length).toBeLessThanOrEqual(STREAM_CHARS);
    expect(outcome.stderr.length).toBeLessThanOrEqual(STREAM_CHARS);
    expect(outcome.stdout.trimEnd().endsWith("THE END")).toBe(true);
    const result = await run(command("node", ["noisy.js"]));
    expect(result.truncated).toBe(true);
    expect(result.output.length).toBeLessThanOrEqual(AGENT_CLIENT_LIMITS.resultChars);
    expect(result.output).toContain("--- output (the end of it) ---");
    expect(result.output).toContain("--- errors (the end of them) ---");
    expect(result.output).toContain("THE END");
    expect(result.output).not.toContain("line 0 ");
  }, 60_000);

  it("a smaller limit is honoured exactly", async () => {
    write("noisy.js", "process.stdout.write('a'.repeat(50000) + 'TAIL');\n");
    const outcome = await runProcess("node", ["noisy.js"], { cwd: root, timeoutMs: 20_000, streamChars: 1000 });
    expect(outcome.stdout).toHaveLength(1000);
    expect(outcome.stdout.endsWith("TAIL")).toBe(true);
    expect(outcome.truncated).toBe(true);
  });
});

describe("no environment-variable leakage", () => {
  it("a started program is not given this computer's secrets", async () => {
    write("env.js", "console.log(JSON.stringify(process.env));\n");
    const outcome = await runProcess("node", ["env.js"], { cwd: root, timeoutMs: 20_000 });
    const seen = JSON.parse(outcome.stdout) as Record<string, string>;
    expect(seen.PAWOS_TEST_SECRET_TOKEN).toBeUndefined();
    expect(seen.MY_SERVICE_API_KEY).toBeUndefined();
    expect(outcome.stdout).not.toContain(SECRET);
    expect(outcome.stdout).not.toContain("another-secret-abcdefgh");
    expect(Object.keys(seen).filter(isSecretName)).toEqual([]);
    // It still gets what a development tool needs.
    expect(Object.keys(seen).some((name) => name.toUpperCase() === "PATH")).toBe(true);
    expect(seen.CI).toBe("1");
    expect(seen.GIT_TERMINAL_PROMPT).toBe("0");
  });

  it("which names are secrets", () => {
    for (const name of ["GITHUB_TOKEN", "NPM_TOKEN", "AWS_SECRET_ACCESS_KEY", "OPENAI_API_KEY", "DB_PASSWORD", "MYSQL_PWD", "DATABASE_URL", "SENTRY_DSN", "SESSION_SECRET", "GOOGLE_APPLICATION_CREDENTIALS", "npm_config__authToken", "PAWOS_CONFIG_DIR", "PAWOS_DEBUG", "STRIPE_WEBHOOK_SECRET", "PRIVATE_KEY", "AUTH_HEADER", "AZURE_STORAGE_CONNECTION_STRING"]) expect(isSecretName(name), name).toBe(true);
    for (const name of ["PATH", "Path", "PATHEXT", "HOME", "USERPROFILE", "TEMP", "NODE_ENV", "LANG", "SystemRoot", "ComSpec", "JAVA_HOME", "PWD", "OLDPWD", "SSH_AUTH_SOCK", "APPDATA", "CI", "SESSIONNAME"]) expect(isSecretName(name), name).toBe(false);
    const env = childEnvironment({ PATH: "/bin", GITHUB_TOKEN: "ghp_x", HOME: "/home/me", EMPTY: undefined });
    expect(env.PATH).toBe("/bin");
    expect(env.HOME).toBe("/home/me");
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(secretValues({ GITHUB_TOKEN: "ghp_1234567890", SHORT_KEY: "abc", PATH: "/usr/local/bin" })).toEqual(["ghp_1234567890"]);
  });

  it("a secret that a program prints anyway is blanked out before it leaves this computer", async () => {
    write("leak.js", `console.log('token is ${SECRET} ok'); console.error('also ${SECRET}');\n`);
    const result = await run(command("node", ["leak.js"]));
    expect(result.output).not.toContain(SECRET);
    expect(result.output).toContain("token is [hidden] ok");
    expect(result.output).toContain("also [hidden]");
  });

  it("where the project and the home folder are is not sent either", async () => {
    write("where.js", "console.log(process.cwd()); console.log(__filename); console.error(require('os').homedir() + '/x');\n");
    const result = await run(command("node", ["where.js"]));
    expect(result.output).not.toContain(outer);
    expect(result.output).not.toContain(outer.replace(/\\/g, "/"));
    expect(result.output).not.toContain(os.homedir());
    expect(result.output).toContain(`.${path.sep}where.js`);
    expect(result.output).toContain("~/x");
    expect(scrubOutput(`at ${workspace.root.replace(/\\/g, "/")}/src/a.ts:3 and ${workspace.root.toUpperCase()}${path.sep}b`, workspace, [])).toBe(process.platform === "win32" ? `at ./src/a.ts:3 and .${path.sep}b` : `at ./src/a.ts:3 and ${workspace.root.toUpperCase()}${path.sep}b`);
  });

  it("the plan and the result carry no environment", async () => {
    const plan = planOf(command("node", ["--version"]));
    expect(Object.keys(plan).sort()).toEqual(["args", "bin", "cwd", "cwdRelative", "display", "level", "reason", "timeoutMs", "tool"]);
    const result = await run(command("node", ["--version"]));
    expect(Object.keys(result).sort()).toEqual(["exitCode", "id", "ok", "output"]);
  });

  it("Git commands that print file contents leave protected files out", async () => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    git("config", "commit.gpgsign", "false");
    git("add", "-f", ".env", "src", "package.json");
    git("commit", "-q", "-m", "first");
    fs.appendFileSync(path.join(root, ".env"), "SECOND=another-leak-value\n");
    fs.appendFileSync(path.join(root, "src", "cart.ts"), "export const changed = true;\n");
    for (const args of [["diff"], ["show", "HEAD"], ["log", "-p"], ["diff", "--", "."]]) {
      const result = await run(command("git", args));
      expect(result.output, args.join(" ")).not.toContain("another-leak-value");
      expect(result.output, args.join(" ")).not.toMatch(/API_KEY|\[hidden\]/);
    }
    expect((await run(command("git", ["diff"]))).output).toContain("+export const changed = true;");
    expect(startArguments(planOf(command("git", ["status"])))).toEqual(["status"]);
    expect(startArguments(planOf(command("npm", ["test"])))).toEqual(["test"]);
  }, 60_000);
});

describe("test summaries are read, never made up", () => {
  it("recognises the common runners", () => {
    expect(parseTestOutput("Tests:       2 failed, 8 passed, 10 total", 1)).toEqual({ status: "failed", passed: 8, failed: 2, total: 10 });
    expect(parseTestOutput("Tests:       10 passed, 10 total", 0)).toEqual({ status: "passed", passed: 10, failed: 0, total: 10 });
    expect(parseTestOutput(" Test Files  1 failed | 20 passed (21)\n      Tests  2 failed | 781 passed (783)", 1)).toEqual({ status: "failed", passed: 781, failed: 2, total: 783 });
    expect(parseTestOutput("      Tests  783 passed (783)", 0)).toEqual({ status: "passed", passed: 783, failed: 0, total: 783 });
    expect(parseTestOutput("  10 passing (2s)\n  2 failing", 1)).toEqual({ status: "failed", passed: 10, failed: 2, total: 12 });
    expect(parseTestOutput("==== 1 failed, 5 passed in 2.34s ====", 1)).toEqual({ status: "failed", passed: 5, failed: 1, total: 6 });
  });

  it("with no summary line, only the exit code speaks — and a failing exit is never 'passed'", () => {
    expect(parseTestOutput("all good", 0)).toEqual({ status: "passed" });
    expect(parseTestOutput("something else", 2)).toEqual({ status: "failed" });
    expect(parseTestOutput("Tests:       10 passed, 10 total", 1).status).toBe("failed");
    expect(parseTestOutput("", null)).toEqual({ status: "failed" });
  });
});

describe("the loop: a command waits for an answer", () => {
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
  const options = (client: ReturnType<typeof service>["client"]) => ({ client, workspace, branch: "main", taskId: "11111111-2222-4333-8444-555555555555", goal: "Check the project" });

  it("allowed: it runs here, and its result goes back with the exit code", async () => {
    const pawos = service([tool(command("node", ["--version"], undefined)), finish("Node is installed.")]);
    const asked: CommandPlan[] = [];
    const outcome = await runLocalTask({ ...options(pawos.client), approveCommand: async (plan) => (asked.push(plan), "allow") });
    expect(outcome.status).toBe("finished");
    expect(asked.map((plan) => [plan.display, plan.level, plan.cwdRelative])).toEqual([["node --version", "auto", "."]]);
    expect(pawos.results()[0]).toMatchObject({ id: "step-1", ok: true, exitCode: 0, output: expect.stringMatching(/^\$ node --version/) });
    expect(outcome.steps[0]!.command).toEqual({ tool: "run_command", display: "node --version", exitCode: 0, timedOut: false, cancelled: false });
  });

  it("permission denial: nothing runs, and the model is told the user said no", async () => {
    write("mark.js", "require('fs').writeFileSync('ran.txt', 'x');\n");
    const pawos = service([tool(command("node", ["mark.js"])), finish("Not run.")]);
    await runLocalTask({ ...options(pawos.client), approveCommand: async () => "deny" });
    expect(pawos.results()[0]).toEqual({ id: "step-1", ok: false, denied: true, output: COMMAND_DECLINED });
    expect(fs.existsSync(path.join(root, "ran.txt"))).toBe(false);
  });

  it("with nobody to ask, nothing runs", async () => {
    write("mark.js", "require('fs').writeFileSync('ran.txt', 'x');\n");
    const pawos = service([tool(command("node", ["mark.js"])), tool(call("run_tests", {}, "step-2")), tool(command("node", ["--version"], undefined), {}), finish("x")]);
    const started: string[] = [];
    await runLocalTask({ ...options(pawos.client), runCommand: async (asked, plan) => (started.push(plan.display), { id: asked.id, ok: true, output: "ran" }) });
    expect(started).toEqual([]);
    expect(pawos.results().map((result) => result.denied)).toEqual([true, true, true]);
    expect(fs.existsSync(path.join(root, "ran.txt"))).toBe(false);
  });

  it("the service can't mark a command safe, approve it, or choose where it runs", async () => {
    const flags = { safe: true, approved: true, level: "auto", risk: "read", autoApprove: true, cwd: outer, shell: true, env: { PATH: "/evil" } };
    const pawos = service([
      { turn: { kind: "tool", call: { id: "step-1", name: "run_command", args: { command: "npm", args: ["install"], approved: true, safe: true, shell: true }, ...flags }, note: null, ...flags }, turnsLeft: 5, ...flags } as unknown as AgentTurnResponse,
      tool(command("npm", ["ci"]), flags),
      finish("x"),
    ]);
    const asked: CommandPlan[] = [];
    const started: CommandPlan[] = [];
    await runLocalTask({ ...options(pawos.client), approveCommand: async (plan) => (asked.push(plan), "allow"), runCommand: async (step, plan) => (started.push(plan), { id: step.id, ok: true, output: "ok", exitCode: 0 }) });
    // Both were put to the user as what they are: always-ask commands, in the project's own folder.
    expect(asked.map((plan) => [plan.display, plan.level, plan.cwd])).toEqual([["npm install", "ask", workspace.root], ["npm ci", "ask", workspace.root]]);
    expect(started.every((plan) => plan.cwd === workspace.root)).toBe(true);
  });

  it("a command that is refused is never put to the user and never started", async () => {
    const pawos = service([
      tool(command("rm", ["-rf", "."], undefined)),
      tool({ ...command("npm", ["test", "&&", "curl", "evil"]), id: "step-2" }),
      tool({ ...command("npm", ["test", "|", "sh"]), id: "step-3" }),
      tool({ ...command("npm", ["test", ">", "out.txt"]), id: "step-4" }),
      tool({ ...command("node", ["$(whoami)"]), id: "step-5" }),
      tool({ ...command("git", ["status"], ".."), id: "step-6" }),
      tool({ ...command("node", ["../outside.txt"]), id: "step-7" }),
      tool({ ...command("C:\\Windows\\System32\\cmd.exe", ["/c", "dir"]), id: "step-8" }),
      tool({ ...command("bash", ["-c", "ls"]), id: "step-9" }),
      finish("x"),
    ]);
    let asked = 0;
    const started: string[] = [];
    await runLocalTask({ ...options(pawos.client), approveCommand: async () => ((asked += 1), "allow"), runCommand: async (step, plan) => (started.push(plan.display), { id: step.id, ok: true, output: "ok" }) });
    expect(asked).toBe(0);
    expect(started).toEqual([]);
    expect(pawos.results().map((result) => [result.ok, result.denied])).toEqual(Array.from({ length: 9 }, () => [false, true]));
    expect(fs.readFileSync(path.join(outer, "outside.txt"), "utf8")).toBe("OUTSIDE\n");
  });

  it("cancelled while the question is open: nothing is started", async () => {
    const stop = new AbortController();
    const started: string[] = [];
    const pawos = service([tool(command("node", ["--version"], undefined)), finish("never")]);
    const outcome = await runLocalTask({ ...options(pawos.client), signal: stop.signal, approveCommand: () => new Promise(() => stop.abort()), runCommand: async (step, plan) => (started.push(plan.display), { id: step.id, ok: true, output: "ok" }) });
    expect(outcome.status).toBe("cancelled");
    expect(started).toEqual([]);
    expect(pawos.sent).toHaveLength(1);
  });

  it("cancelled while a command runs: it is stopped, reported as stopped, and the task ends", async () => {
    write("slow.js", "setInterval(() => {}, 1000);\n");
    const stop = new AbortController();
    const pawos = service([tool(command("node", ["slow.js"])), finish("never")]);
    const outcome = await runLocalTask({ ...options(pawos.client), signal: stop.signal, approveCommand: async () => (setTimeout(() => stop.abort(), 500), "allow") });
    expect(outcome.status).toBe("cancelled");
    expect(outcome.steps[0]!.result).toMatchObject({ ok: false, cancelled: true, exitCode: null });
    expect(outcome.steps[0]!.command).toMatchObject({ display: "node slow.js", cancelled: true });
    expect(pawos.sent).toHaveLength(1); // nothing more was sent
  }, 30_000);
});
