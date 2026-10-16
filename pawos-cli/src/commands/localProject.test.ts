import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { SESSION_EXPIRED_NOTICE } from "../shared";
import { delivered, finishTurn, harness, pushed, reply, toolTurn } from "../testing/harness";
import { MAX_TASK_CHARS } from "./interactive";
import { COMMAND_QUESTION, OPEN_QUESTION, WRITE_QUESTION } from "./workspace";

/**
 * A whole task on an ordinary project folder — one that is not a Git repository — through the real
 * workspace loop: a multi-line request, files read and changed for real, the build run, a
 * development server started and its address reported, the browser asked for, and everything
 * stopped again. PawOS's turns are scripted; the files, the commands and the server are real.
 */
const cleanups: (() => void)[] = [];
let outer: string;
let root: string;

const APP = "export function App() {\n  return <h1>ShopFlow</h1>;\n}\n";
const SERVER = "const http = require('http'); const s = http.createServer((q, r) => r.end('ok')); s.listen(0, '127.0.0.1', () => console.log('  Local:   http://localhost:' + s.address().port + '/'));\n";
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const write = (relative: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
};
const until = async (done: () => Promise<boolean>, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};
const down = (url: string) => fetch(url).then(() => false, () => true);

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-local-project-")));
  root = path.join(outer, "shopflow");
  fs.mkdirSync(root);
  // A build that fails unless the storefront has a hero section — so a real exit code decides.
  write("package.json", JSON.stringify({ name: "shopflow", scripts: { build: "node build.js", dev: "node server.js" } }));
  write("build.js", "const app = require('fs').readFileSync('src/App.tsx', 'utf8');\nif (!app.includes('className=\"hero\"')) { console.error('src/App.tsx(2,10): error TS2304: Cannot find name Hero.'); process.exit(2); }\nconsole.log('built in 120ms');\n");
  write("server.js", SERVER);
  write("src/App.tsx", APP);
  write(".env", "API_KEY=sk-live-very-secret\n");
  cleanups.push(() => fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

/** `pawos` started in a folder that is not a Git repository. */
const start = (options: Parameters<typeof harness>[0] = {}) => {
  const h = harness({ signedIn: true, workspaceRoot: root, cwd: root, local: { kind: "notGit" }, ...options });
  cleanups.push(() => h.cleanup());
  return h;
};
type Sent = { id: string; ok: boolean; output: string; denied?: boolean; exitCode?: number | null };
const results = (h: ReturnType<typeof harness>) => h.server.agentCalls().slice(1).map((call) => call.body!.result as Sent);
const githubCalls = (h: ReturnType<typeof harness>) => h.server.calls.filter((call) => call.path.startsWith("/api/web/changes") || call.body?.mode === "codeChange" || (call.path.startsWith("/api/web/github") && call.method !== "GET"));
const TASK = ["Inspect this React + TypeScript project.", "Redesign the ShopFlow storefront with a responsive hero section.", "Run the production build, fix errors caused by your changes, and summarize the result."].join("\n");

describe("a project folder that is not a Git repository", () => {
  it("is worked on here: local mode, with nothing asked of GitHub", async () => {
    const h = start({ answers: [null] });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("Local mode: PawOS works in shopflow on this computer.");
    expect(h.output()).toContain(root);
    expect(h.output()).not.toContain("Git:");
    expect(h.server.calls.filter((call) => call.method !== "GET" && !call.path.startsWith("/api/auth/"))).toEqual([]);
  });

  it("pawos status calls it what it is: a local project, not just \"not a Git repository\"", async () => {
    const h = start();
    expect(await runCli(["status"], h.ctx)).toBe(0);
    expect(h.output()).toMatch(/Folder\s+a local project \(not a Git repository\)/);
  });

  it("the whole lifecycle: a multi-line task → read → change → build fails → fix → build passes → summary", async () => {
    const h = start({ answers: [TASK, "y", "y", "y", "y", "y", null], permissionMode: "ask" });
    h.server.agentTurns = [
      toolTurn("step-1", "list_files", {}),
      toolTurn("step-2", "read_file", { path: "src/App.tsx" }),
      toolTurn("step-3", "write_file", { path: "src/Hero.tsx", content: "export function Hero() {\n  return <section>Welcome</section>;\n}\n" }),
      toolTurn("step-4", "build", {}),
      toolTurn("step-5", "edit_file", { path: "src/App.tsx", oldText: "  return <h1>ShopFlow</h1>;", newText: "  return <section className=\"hero\"><h1>ShopFlow</h1></section>;" }),
      toolTurn("step-6", "build", {}),
      finishTurn("Added a hero section in src/App.tsx and src/Hero.tsx.\nThe first build failed (exit code 2); after the fix the build passes."),
    ];
    expect(await runCli([], h.ctx)).toBe(0);

    // The task arrived as ONE message with all three lines, not three messages.
    const turns = h.server.agentCalls();
    expect(turns).toHaveLength(7);
    expect(turns[0]!.body).toEqual({ taskId: turns[0]!.body!.taskId, goal: TASK, workspace: { name: "shopflow", branch: null, files: ["build.js", "package.json", "server.js", "src/App.tsx"], filesTruncated: false } });
    expect(h.server.chats()).toHaveLength(0);

    // Real files changed on disk.
    expect(read("src/Hero.tsx")).toContain("export function Hero()");
    expect(read("src/App.tsx")).toContain('className="hero"');

    // The build really ran twice, and its real exit codes went back to PawOS: failed, then passed.
    const sent = results(h);
    expect(sent[1]!.output).toContain("return <h1>ShopFlow</h1>;");
    expect(sent[2]).toEqual({ id: "step-3", ok: true, output: "Created src/Hero.tsx (3 lines)." });
    expect(sent[3]).toMatchObject({ id: "step-4", ok: false, exitCode: 2 });
    expect(sent[3]!.output).toContain("$ npm run build   (in .)\nExit code 2.");
    expect(sent[3]!.output).toContain("error TS2304: Cannot find name Hero.");
    expect(sent[4]).toMatchObject({ id: "step-5", ok: true });
    expect(sent[5]).toMatchObject({ id: "step-6", ok: true, exitCode: 0 });
    expect(sent[5]!.output).toContain("built in 120ms");

    // Asked once to start, then for each change and each command.
    expect(h.prompter.prompts.filter((prompt) => prompt === WRITE_QUESTION)).toHaveLength(2);
    expect(h.prompter.prompts.filter((prompt) => prompt === COMMAND_QUESTION)).toHaveLength(2);

    // The report matches what happened.
    const screen = h.output();
    expect(screen).toContain("after the fix the build passes.");
    expect(screen).toContain("PawOS made 2 changes in shopflow:");
    expect(screen).toContain("Created 1, modified 1, deleted 0.");
    expect(screen).toContain("npm run build  exit code 2");
    expect(screen).toContain("npm run build  exit code 0");
    expect(screen).toContain("Build: passed  the last run of npm run build");
    expect(screen).toContain("/undo puts these files back as they were before this task.");
    expect(githubCalls(h)).toEqual([]);
    expect(JSON.stringify(turns.map((call) => call.body))).not.toContain("sk-live");
  }, 180_000);

  it("a second request changes what the first one made", async () => {
    const h = start({ answers: ["Add a hero section to src/App.tsx", "Change the heading in the hero to Welcome", null], permissionMode: "auto" });
    h.server.agentTurns = [
      toolTurn("step-1", "edit_file", { path: "src/App.tsx", oldText: "<h1>ShopFlow</h1>", newText: "<section className=\"hero\"><h1>ShopFlow</h1></section>" }),
      finishTurn("Added."),
      toolTurn("step-1", "read_file", { path: "src/App.tsx" }),
      toolTurn("step-2", "edit_file", { path: "src/App.tsx", oldText: "<h1>ShopFlow</h1>", newText: "<h1>Welcome</h1>" }),
      finishTurn("Changed the heading."),
    ];
    await runCli([], h.ctx);
    // The second task read the file as the first one left it, and built on it.
    expect(results(h).length).toBeGreaterThan(0);
    const secondRead = h.server.agentCalls()[3]!.body!.result as Sent;
    expect(secondRead.output).toContain('className="hero"');
    expect(read("src/App.tsx")).toBe("export function App() {\n  return <section className=\"hero\"><h1>Welcome</h1></section>;\n}\n");
  });

  it("a failing build is reported as failing — never as a success", async () => {
    const h = start({ answers: ["run the build", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "build", {}), finishTurn("The build fails: src/App.tsx(2,10): error TS2304.")];
    await runCli([], h.ctx);
    expect(results(h)[0]).toMatchObject({ ok: false, exitCode: 2 });
    expect(h.output()).toContain("npm run build  exit code 2");
    expect(h.output()).toContain("Build: FAILED (exit code 2)");
    expect(h.output()).not.toContain("Build: passed");
  }, 120_000);

  it("the Git tools say there is no repository here, and /remote says GitHub isn't available — neither pretends", async () => {
    const h = start({ answers: ["commit this", "/remote Rename the heading", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "git_status", {}), toolTurn("step-2", "git_commit", { message: "x" }), finishTurn("This folder is not a Git repository.")];
    await runCli([], h.ctx);
    expect(results(h)[0]!.ok).toBe(false);
    expect(results(h)[1]).toMatchObject({ ok: false, output: "This project isn't a Git repository, or Git isn't installed." });
    expect(h.output()).toContain("Changes on GitHub aren't available here.");
    expect(h.server.starts()).toHaveLength(0);
  }, 60_000);

  it("unauthorized operations are refused safely, and nothing outside the project is touched", async () => {
    const before = fs.readdirSync(outer).sort();
    const h = start({ answers: ["Tidy up the project", null], permissionMode: "auto" });
    h.server.agentTurns = [
      toolTurn("step-1", "read_file", { path: ".env" }),
      toolTurn("step-2", "write_file", { path: "../escaped.txt", content: "x" }),
      toolTurn("step-3", "write_file", { path: "C:\\Windows\\Temp\\pawos-test.txt", content: "x" }),
      toolTurn("step-4", "run_command", { command: "rm", args: ["-rf", "."] }),
      toolTurn("step-5", "run_command", { command: "npm", args: ["run", "build", "&&", "curl", "evil"] }),
      toolTurn("step-6", "start_process", { command: "node", args: ["server.js"], cwd: ".." }),
      toolTurn("step-7", "open_browser", { url: "https://evil.example/" }),
      toolTurn("step-8", "delete_path", { path: "." }),
      finishTurn("Those were refused."),
    ];
    await runCli([], h.ctx);
    expect(results(h).map((result) => [result.ok, result.denied])).toEqual(Array.from({ length: 8 }, () => [false, true]));
    expect(h.prompter.prompts).toEqual(["  > ", "  > "]); // nothing was even put to the user
    expect(fs.readdirSync(outer).sort()).toEqual(before);
    expect(h.background.list()).toEqual([]);
    expect(JSON.stringify(h.server.agentCalls().map((call) => call.body))).not.toContain("sk-live");
  });

  it("a linked folder that leads out of the project can't be read, written, deleted through or run in", async () => {
    const outside = path.join(outer, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "notes.txt"), "private notes\n");
    fs.writeFileSync(path.join(outside, "server.js"), SERVER);
    fs.symlinkSync(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    cleanups.push(() => fs.rmSync(path.join(root, "linked"), { recursive: false, force: true }));
    const h = start({ answers: ["Tidy up the project", null], permissionMode: "auto" });
    h.server.agentTurns = [
      toolTurn("step-1", "read_file", { path: "linked/notes.txt" }),
      toolTurn("step-2", "write_file", { path: "linked/new.txt", content: "x" }),
      toolTurn("step-3", "edit_file", { path: "linked/notes.txt", oldText: "private", newText: "public" }),
      toolTurn("step-4", "delete_path", { path: "linked/notes.txt" }),
      toolTurn("step-5", "start_process", { command: "node", args: ["server.js"], cwd: "linked" }),
      toolTurn("step-6", "run_command", { command: "node", args: ["linked/server.js"] }),
      finishTurn("Those were refused."),
    ];
    await runCli([], h.ctx);
    expect(results(h).map((result) => [result.ok, result.denied])).toEqual(Array.from({ length: 6 }, () => [false, true]));
    expect(fs.readdirSync(outside).sort()).toEqual(["notes.txt", "server.js"]);
    expect(fs.readFileSync(path.join(outside, "notes.txt"), "utf8")).toBe("private notes\n");
    expect(h.background.list()).toEqual([]);
    expect(JSON.stringify(h.server.agentCalls().map((call) => call.body))).not.toContain("private notes");
  });

  it("/undo puts back a task that created, changed and deleted files — with no Git repository to lean on", async () => {
    write("src/old.ts", "export const old = 1;\n");
    const h = start({ answers: ["Rework the storefront", "y", "/undo", "y", null], permissionMode: "auto" });
    h.server.agentTurns = [
      toolTurn("step-1", "write_file", { path: "src/data/products.ts", content: "export const PRODUCTS = [];\n" }),
      toolTurn("step-2", "edit_file", { path: "src/App.tsx", oldText: "ShopFlow", newText: "ShopFlow Store" }),
      toolTurn("step-3", "write_file", { path: "package.json", content: "{}\n" }),
      toolTurn("step-4", "delete_path", { path: "src/old.ts" }),
      finishTurn("Reworked."),
    ];
    const before = { app: read("src/App.tsx"), manifest: read("package.json"), old: read("src/old.ts") };
    await runCli([], h.ctx);
    expect(results(h).map((result) => result.ok)).toEqual([true, true, true, true]);
    expect(h.output()).toContain("Created 1, modified 2, deleted 1.");
    expect({ app: read("src/App.tsx"), manifest: read("package.json"), old: read("src/old.ts") }).toEqual(before);
    expect(fs.existsSync(path.join(root, "src", "data", "products.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".git"))).toBe(false);
  });
});

describe("a development server", () => {
  it("is started, its real address is reported, and it stays up until /stop", async () => {
    let address = "";
    const h = start({ answers: ["start the dev server", "/stop", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "start_process", { command: "npm", args: ["run", "dev"] }), () => ((address = /Local address: (\S+)/.exec(String((h.server.agentCalls()[1]!.body!.result as Sent).output))?.[1] ?? ""), finishTurn(`The dev server is running at ${address}`))];
    // While the first prompt after the task is waiting, the server must still be answering.
    const seen: string[] = [];
    const ask = h.prompter.ask.bind(h.prompter);
    h.prompter.ask = async (prompt: string) => {
      if (address && seen.length === 0) seen.push(await fetch(address).then((response) => response.text(), () => "DOWN"));
      return ask(prompt);
    };
    expect(await runCli([], h.ctx)).toBe(0);

    expect(address).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(seen).toEqual(["ok"]); // it kept running after the task ended
    const screen = h.output();
    expect(screen).toContain("PawOS wants to start, and leave running:");
    expect(screen).toContain("    npm run dev");
    expect(screen).toContain(`The dev server is running at ${address}`);
    expect(screen).toContain(`Left running: npm run dev  ${address}`);
    expect(screen).toContain(`Still running: npm run dev  ${address}  (/stop to stop it)`);
    expect(screen).toContain("Stopped npm run dev");
    expect(h.background.running()).toEqual([]);
    expect(await until(() => down(address), 15_000)).toBe(true);
  }, 180_000);

  it("is stopped when PawOS is left, so nothing keeps running behind it", async () => {
    let address = "";
    const h = start({ answers: ["start the dev server", "/exit"], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "start_process", { command: "node", args: ["server.js"] }), () => ((address = /Local address: (\S+)/.exec(String((h.server.agentCalls()[1]!.body!.result as Sent).output))?.[1] ?? ""), finishTurn("Running."))];
    // `node server.js` runs a program from the project: asked about even in auto mode.
    h.prompter.ask = ((original) => async (prompt: string) => (prompt === COMMAND_QUESTION ? "y" : original(prompt)))(h.prompter.ask.bind(h.prompter));
    expect(await runCli([], h.ctx)).toBe(0);
    expect(address).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(h.output()).toContain("Stopped node server.js.");
    expect(h.background.running()).toEqual([]);
    expect(await until(() => down(address), 15_000)).toBe(true);
  }, 120_000);

  it("in ask mode it waits for a yes, and a no starts nothing", async () => {
    const h = start({ answers: ["start the dev server", "y", "n", null], permissionMode: "ask" });
    h.server.agentTurns = [toolTurn("step-1", "start_process", { command: "npm", args: ["run", "dev"] }), finishTurn("Not started.")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts).toContain(COMMAND_QUESTION);
    expect(results(h)[0]).toMatchObject({ ok: false, denied: true });
    expect(h.background.list()).toEqual([]);
    expect(h.output()).not.toContain("Left running");
  });

  it("with nothing running, /stop says so", async () => {
    const h = start({ answers: ["/stop", null] });
    await runCli([], h.ctx);
    expect(h.output()).toContain("PawOS isn't keeping anything running.");
  });
});

describe("opening the browser is its own step, asked about every time", () => {
  it("even in auto mode it asks, and on a no nothing is opened and the report says so", async () => {
    const h = start({ answers: ["open the app in my browser", "n", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "open_browser", { url: "http://localhost:5173/" }), finishTurn("I did not open the browser. The address is http://localhost:5173/")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts).toEqual(["  > ", OPEN_QUESTION, "  > "]);
    expect(h.output()).toContain("PawOS wants to open in your browser:");
    expect(h.output()).toContain("    http://localhost:5173/");
    expect(h.output()).toContain("PawOS can't see the page: it can only ask your browser to open it.");
    expect(h.output()).toContain("Not opened.");
    expect(results(h)[0]).toMatchObject({ ok: false, denied: true });
    expect(h.output()).not.toContain("Asked your browser to open");
  });

  it("an address that isn't on this computer is never put to the user", async () => {
    const h = start({ answers: ["open the docs", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "open_browser", { url: "https://pawos.revantaai.com/pricing" }), finishTurn("x")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts).toEqual(["  > ", "  > "]);
    expect(results(h)[0]).toMatchObject({ ok: false, denied: true });
  });
});

describe("limits and sessions", () => {
  it("a prompt over the limit is not sent, and says so", async () => {
    const h = start({ answers: [`Redesign the storefront. ${"x".repeat(MAX_TASK_CHARS)}`, null] });
    await runCli([], h.ctx);
    expect(h.output()).toContain("Keep it under 4,000 characters.");
    expect(h.server.agentCalls()).toHaveLength(0);
  });

  it("a long multi-line prompt inside the limit goes whole", async () => {
    const long = Array.from({ length: 40 }, (_, index) => `Requirement ${index + 1}: keep the existing behaviour.`).join("\n");
    expect(long.length).toBeLessThan(MAX_TASK_CHARS);
    const h = start({ answers: [`Fix the storefront.\n${long}`, null] });
    h.server.agentTurns = [finishTurn("Done.")];
    await runCli([], h.ctx);
    expect(h.server.agentCalls()[0]!.body!.goal).toBe(`Fix the storefront.\n${long}`);
  });

  it("a large file is written whole, exactly as PawOS sent it", async () => {
    const content = Array.from({ length: 2000 }, (_, index) => `export const line${index} = "${"x".repeat(40)}";`).join("\n") + "\n";
    const h = start({ answers: ["Add the catalog data", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "write_file", { path: "src/data/catalog.ts", content }), finishTurn("Added.")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(Buffer.byteLength(content)).toBeGreaterThan(100_000);
    expect(read("src/data/catalog.ts")).toBe(content);
    expect(results(h)[0]).toMatchObject({ ok: true, output: "Created src/data/catalog.ts (2,000 lines)." });
  });

  it("a file larger than PawOS writes is refused with the reason, and nothing is left half-written", async () => {
    const h = start({ answers: ["Add the catalog data", null], permissionMode: "auto" });
    // Inside what a step may carry, but more than PawOS writes to one file: refused, with the reason.
    h.server.agentTurns = [toolTurn("step-1", "write_file", { path: "src/data/catalog.ts", content: "€".repeat(190_000) }), finishTurn("That was too large.")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(results(h)[0]!.ok).toBe(false);
    expect(results(h)[0]!.output).toMatch(/larger than PawOS writes/);
    expect(fs.existsSync(path.join(root, "src", "data", "catalog.ts"))).toBe(false);
    expect(h.output()).not.toContain("PawOS made");
  });

  it("a step outside what a step may carry is not run at all, and the task ends saying so — not as done", async () => {
    const h = start({ answers: ["Add the catalog data", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "write_file", { path: "src/data/catalog.ts", content: "x".repeat(600_000) }), finishTurn("never reached")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(results(h)).toHaveLength(0);
    expect(fs.existsSync(path.join(root, "src", "data", "catalog.ts"))).toBe(false);
    expect(h.output()).toContain("PawOS asked for a step this version can't run.");
    expect(h.output()).not.toContain("never reached");
  });

  it("a turn tried again after a write does not write again: the file's result is re-sent, the change is counted once", async () => {
    const busy = (detail: string) => reply({ code: "model_unavailable", message: "Paw couldn't work out the next step. Please try again.", detail }, 502);
    const h = start({ answers: ["Add a note", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "write_file", { path: "NOTES.md", content: "one\n" }), busy("model_unusable_reply"), busy("model_timeout"), finishTurn("Added the note.")];
    expect(await runCli([], h.ctx)).toBe(0);
    const sent = h.server.agentCalls().slice(1).map((call) => JSON.stringify(call.body));
    expect(sent).toHaveLength(3);
    expect(new Set(sent).size).toBe(1); // the very same result, three times
    // Written once: a second write would have reported "Replaced", and counted a second change.
    expect(sent[0]).toContain("Created NOTES.md");
    expect(read("NOTES.md")).toBe("one\n");
    expect(h.output()).toContain("PawOS made 1 change in shopflow:");
    expect(h.output()).toContain("Added the note.");
  });

  it("a model that is briefly unavailable is tried again, and the task carries on", async () => {
    const busy = () => reply({ code: "model_unavailable", message: "Paw couldn't answer just now. Please try again.", detail: "model_http_503" }, 502);
    const h = start({ answers: ["Fix the storefront heading", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "read_file", { path: "src/App.tsx" }), busy(), busy(), toolTurn("step-2", "edit_file", { path: "src/App.tsx", oldText: "ShopFlow", newText: "ShopFlow Store" }), finishTurn("Renamed the heading.")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(read("src/App.tsx")).toContain("ShopFlow Store");
    expect(h.output()).toContain("Renamed the heading.");
    expect(h.output()).not.toContain("Paw couldn't answer just now");
    // The result of the read was sent three times in all; the file was read once.
    expect(h.server.agentCalls()).toHaveLength(5);
    // The schedule's first two steps, each jittered to between half and all of itself.
    expect(h.waited()).toBeGreaterThanOrEqual((2000 + 5000) / 2);
    expect(h.waited()).toBeLessThanOrEqual(2000 + 5000);
  });

  it("a model that stays unavailable ends the task with PawOS's own message — and what was done is still accounted for", async () => {
    const busy = () => reply({ code: "model_unavailable", message: "Paw couldn't answer just now. Please try again." }, 502);
    const h = start({ answers: ["Fix the storefront heading", null], permissionMode: "auto" });
    h.server.agentTurns = [toolTurn("step-1", "edit_file", { path: "src/App.tsx", oldText: "ShopFlow", newText: "ShopFlow Store" }), ...Array.from({ length: 6 }, busy)];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("Paw couldn't answer just now. Please try again.");
    // The change that was made before the model went away is reported, not hidden.
    expect(h.output()).toContain("PawOS made 1 change in shopflow:");
    expect(h.output()).toContain("/undo puts these files back");
    expect(read("src/App.tsx")).toContain("ShopFlow Store");
  });

  it("an expired session mid-task stops the task and asks to sign in again — it is not reported as done", async () => {
    const h = start({ answers: ["Fix the storefront heading", null] });
    h.server.agentTurns = [
      toolTurn("step-1", "read_file", { path: "src/App.tsx" }),
      () => {
        // The session ends while the task is running, and cannot be renewed.
        h.server.validAccess.clear();
        h.server.validRefresh.clear();
        return reply({ code: "not_authenticated", message: "Sign in to continue." }, 401);
      },
    ];
    expect(await runCli([], h.ctx)).toBe(1); // nobody signed in again
    expect(h.output()).toContain(SESSION_EXPIRED_NOTICE);
    expect(h.output()).not.toContain("PawOS made");
    expect(read("src/App.tsx")).toBe(APP);
  });

  it("the plan decides: a refusal from PawOS is shown and nothing is done locally or on GitHub", async () => {
    const h = start({ answers: ["Fix the storefront heading", null] });
    h.server.agentTurns = [reply({ code: "capability_locked", message: "Local project work is available on Paw Pro, Paw Pro Max, Team and Enterprise." }, 403)];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Local project work is available on Paw Pro, Paw Pro Max, Team and Enterprise.");
    expect(read("src/App.tsx")).toBe(APP);
    expect(githubCalls(h)).toEqual([]);
  });
});

describe("the GitHub way still works where it did", () => {
  it("outside any project folder, a GitHub project's task goes to GitHub as before", async () => {
    const h = harness({ signedIn: true, answers: ["Rename the heading", null] });
    cleanups.push(() => h.cleanup());
    h.server.sends = [delivered("r", pushed("r"))];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.server.starts()).toHaveLength(1);
    expect(h.server.agentCalls()).toHaveLength(0);
  });
});
