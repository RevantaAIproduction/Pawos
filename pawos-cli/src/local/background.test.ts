import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentTurnRequest, AgentTurnResponse, ToolCall, ToolResult } from "../shared";
import { LOOK_ONLY, OPEN_DECLINED, READ_ONLY, runLocalTask } from "./agent";
import { describeProcess, prepareCommand, runPlanned, type CommandPlan } from "./commands";
import { BackgroundProcesses, MAX_BACKGROUND, localUrlProblem, openInBrowser } from "./process";
import { openWorkspace, type Workspace } from "./workspace";

/**
 * Programs PawOS leaves running (a development server), and the browser step. The server here is a
 * real one: a few lines of Node that listen on a free local port and print their address the way a
 * development server does. Everything started is stopped again; the browser is never really opened.
 */
let outer: string;
let root: string;
let workspace: Workspace;
let background: BackgroundProcesses;

const SERVER = "const http = require('http'); const s = http.createServer((q, r) => r.end('ok')); s.listen(0, '127.0.0.1', () => console.log('  VITE ready\\n  Local:   http://localhost:' + s.address().port + '/\\n  press h to show help'));\n";
const write = (relative: string, content: string) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const call = (name: string, args: Record<string, string | number | boolean | string[]> = {}, id = "step-1"): ToolCall => ({ id, name, args }) as ToolCall;
const start = (args: string[], cwd?: string) => call("start_process", { command: "node", args, ...(cwd ? { cwd } : {}) });
const planOf = (asked: ToolCall): CommandPlan => {
  const prepared = prepareCommand(asked, workspace);
  if (!prepared.ok) throw new Error(`refused: ${prepared.result.output}`);
  return prepared.plan;
};
const reach = async (url: string) => (await fetch(url)).text();
const down = async (url: string) => fetch(url).then(() => false, () => true);
const until = async (done: () => boolean | Promise<boolean>, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

beforeEach(() => {
  outer = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "pawos-background-")));
  root = path.join(outer, "shop");
  fs.mkdirSync(root);
  write("server.js", SERVER);
  write("package.json", JSON.stringify({ name: "shop", scripts: { dev: "node server.js" } }));
  write("crash.js", "console.error('Error: Cannot find module vite'); process.exit(1);\n");
  write("quiet.js", "setInterval(() => {}, 1000);\n");
  write(".env", "API_KEY=sk-live-very-secret\n");
  workspace = openWorkspace(root)!;
  background = new BackgroundProcesses();
});

afterEach(async () => {
  await background.stopAll();
  fs.rmSync(outer, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("starting a development server", () => {
  it("starts it, leaves it running, and reports the address it printed", async () => {
    const result = await runPlanned(start(["server.js"]), planOf(start(["server.js"])), workspace, { background });
    expect(result.ok).toBe(true);
    const [info] = background.running();
    expect(info).toMatchObject({ id: "p1", display: "node server.js", cwdRelative: ".", running: true, exitCode: null });
    expect(info!.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(result.output).toContain("$ node server.js   (in ., left running)");
    expect(result.output).toContain(`Running as process p1. Local address: ${info!.url}`);
    expect(result.output).toContain("VITE ready");
    // It really is serving, at exactly the address that was reported.
    expect(await reach(info!.url!)).toBe("ok");
  }, 60_000);

  it("through the project's own script, the way a real project does it", async () => {
    const asked = call("start_process", { command: "npm", args: ["run", "dev"] });
    const plan = planOf(asked);
    expect(plan).toMatchObject({ tool: "start_process", display: "npm run dev", level: "auto" });
    const result = await runPlanned(asked, plan, workspace, { background });
    expect(result.ok).toBe(true);
    expect(result.output).toMatch(/Local address: http:\/\/localhost:\d+\//);
    expect(await reach(background.running()[0]!.url!)).toBe("ok");
  }, 90_000);

  it("a server that dies at once is a failure with its exit code — never 'running'", async () => {
    const result = await runPlanned(start(["crash.js"]), planOf(start(["crash.js"])), workspace, { background });
    expect(result).toMatchObject({ ok: false, exitCode: 1 });
    expect(result.output).toContain("It ended straight away with exit code 1. Nothing is running.");
    expect(result.output).toContain("Cannot find module vite");
    expect(result.output).not.toMatch(/Local address/);
    expect(background.running()).toEqual([]);
  }, 60_000);

  it("no address is invented: a program that prints none is reported as running without one", async () => {
    const result = await runPlanned(start(["quiet.js"]), planOf(start(["quiet.js"])), workspace, { background, readyMs: 1500 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("It has not printed a local address yet. Use process_status to look again.");
    expect(result.output).not.toMatch(/http:\/\//);
    expect(background.running()[0]!.url).toBeNull();
  }, 60_000);

  it("is held to every rule a command is: the program, its arguments and the folder", () => {
    for (const asked of [
      call("start_process", { command: "bash", args: ["-c", "node server.js"] }),
      call("start_process", { command: "node", args: ["server.js", "&&", "calc"] }),
      call("start_process", { command: "node", args: ["server.js", "|", "tee", "log"] }),
      call("start_process", { command: "node", args: ["../outside.js"] }),
      call("start_process", { command: "node", args: ["server.js"], cwd: ".." }),
      call("start_process", { command: "node", args: [".env"] }),
      call("start_process", { command: "C:\\Windows\\System32\\cmd.exe", args: ["/c", "start"] }),
      call("start_process", { args: ["server.js"] }),
      call("start_process", { command: "git", args: ["daemon"] }),
    ]) {
      const prepared = prepareCommand(asked, workspace);
      expect(prepared.ok, JSON.stringify(asked.args)).toBe(false);
      expect(!prepared.ok && prepared.result.denied).toBe(true);
    }
    expect(background.list()).toEqual([]);
  });

  it("what it prints is scrubbed and bounded like any output", async () => {
    write("noisy.js", "console.log(process.cwd()); for (let i = 0; i < 20000; i++) console.log('line ' + i + ' ' + 'x'.repeat(40)); console.log('Local: http://localhost:4999/');setInterval(() => {}, 1000);\n");
    const result = await runPlanned(start(["noisy.js"]), planOf(start(["noisy.js"])), workspace, { background });
    expect(result.output.length).toBeLessThan(20_000);
    expect(result.output).not.toContain(outer);
    expect(result.output).toContain("Local address: http://localhost:4999/");
  }, 60_000);

  it("without somewhere to keep it, nothing is started", async () => {
    const result = await runPlanned(start(["server.js"]), planOf(start(["server.js"])), workspace, {});
    expect(result).toMatchObject({ ok: false });
    expect(result.output).toContain("Keeping a program running isn't available here.");
  });

  it("only a few are kept running at once", async () => {
    for (let index = 0; index < MAX_BACKGROUND; index++) expect((await background.start("node", ["quiet.js"], { cwd: root, cwdRelative: ".", display: "node quiet.js", readyMs: 300 })).ok).toBe(true);
    expect(await background.start("node", ["quiet.js"], { cwd: root, cwdRelative: ".", display: "node quiet.js", readyMs: 300 })).toMatchObject({ ok: false, reason: expect.stringMatching(/already keeping 3 programs running/) });
  }, 60_000);
});

describe("asking about it, and stopping it", () => {
  it("process_status says whether it is running, its address, and the end of its output", async () => {
    await runPlanned(start(["server.js"]), planOf(start(["server.js"])), workspace, { background });
    const url = background.running()[0]!.url!;
    const status = describeProcess(call("process_status", { id: "p1" }), background, workspace);
    expect(status.ok).toBe(true);
    expect(status.output).toContain(`Process p1 (node server.js): running. Local address: ${url}`);
    expect(describeProcess(call("process_status", { id: "p9" }), background, workspace)).toMatchObject({ ok: false, output: expect.stringMatching(/isn't keeping a process called p9/) });
    expect(describeProcess(call("process_status", { id: "p1" }), undefined, workspace).ok).toBe(false);
  }, 60_000);

  it("stopping it ends the server: its address stops answering", async () => {
    await runPlanned(start(["server.js"]), planOf(start(["server.js"])), workspace, { background });
    const url = background.running()[0]!.url!;
    expect(await reach(url)).toBe("ok");
    expect(await background.stop("p1")).toBe(true);
    expect(background.running()).toEqual([]);
    expect(await until(() => down(url), 10_000)).toBe(true);
    expect(await background.stop("p1")).toBe(false); // already stopped
    expect(await background.stop("nope")).toBe(false);
  }, 60_000);

  it("a server started through npm is stopped with everything it started", async () => {
    const asked = call("start_process", { command: "npm", args: ["run", "dev"] });
    await runPlanned(asked, planOf(asked), workspace, { background });
    const url = background.running()[0]!.url!;
    expect(await reach(url)).toBe("ok");
    await background.stop("p1");
    // npm was only the parent: the Node process it started is gone too.
    expect(await until(() => down(url), 15_000)).toBe(true);
  }, 90_000);

  it("stopAll leaves nothing running", async () => {
    await background.start("node", ["server.js"], { cwd: root, cwdRelative: ".", display: "node server.js" });
    await background.start("node", ["quiet.js"], { cwd: root, cwdRelative: ".", display: "node quiet.js", readyMs: 300 });
    const urls = background.running().flatMap((entry) => (entry.url ? [entry.url] : []));
    expect((await background.stopAll()).map((entry) => entry.display).sort()).toEqual(["node quiet.js", "node server.js"]);
    expect(background.running()).toEqual([]);
    for (const url of urls) expect(await until(() => down(url), 10_000)).toBe(true);
  }, 60_000);

  it("cancelled while it is starting: it is not left running", async () => {
    const stop = new AbortController();
    const starting = background.start("node", ["quiet.js"], { cwd: root, cwdRelative: ".", display: "node quiet.js", signal: stop.signal });
    setTimeout(() => stop.abort(), 400);
    expect(await starting).toMatchObject({ ok: false, cancelled: true });
    expect(background.running()).toEqual([]);
  }, 60_000);
});

describe("opening the browser", () => {
  it("only a page served from this computer may be opened", () => {
    for (const url of ["http://localhost:5173/", "http://localhost/", "http://127.0.0.1:3000/cart?x=1", "http://[::1]:8080/", "https://localhost:8443/"]) expect(localUrlProblem(url), url).toBeNull();
    for (const url of ["https://example.com/", "http://192.168.1.10:5173/", "http://localhost.evil.example/", "http://evil.example/?localhost", "http://user:pw@localhost:5173/", "file:///C:/Windows/win.ini", "javascript:alert(1)", "chrome://settings", "ms-msdt:/id", "localhost:5173", "", "   "]) {
      expect(localUrlProblem(url), url).toBeTruthy();
    }
  });

  it("the opener itself refuses anything else, on every system, and reports an unknown system honestly", async () => {
    expect(await openInBrowser("https://example.com/")).toEqual({ ok: false, reason: "PawOS only opens pages served from this computer." });
    expect(await openInBrowser("file:///etc/passwd", "linux")).toMatchObject({ ok: false });
    expect(await openInBrowser("http://localhost:5173/", "plan9")).toEqual({ ok: false, reason: "Opening a browser isn't supported on this system." });
  });
});

describe("the loop: a server, a page, and what the model is told", () => {
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
  const tool = (asked: ToolCall, extra: Record<string, unknown> = {}): AgentTurnResponse => ({ turn: { kind: "tool", call: { ...asked, ...extra }, note: null }, turnsLeft: 10 }) as AgentTurnResponse;
  const finish = (summary: string): AgentTurnResponse => ({ turn: { kind: "finish", summary }, turnsLeft: 0 });
  const options = (client: ReturnType<typeof service>["client"]) => ({ client, workspace, branch: null, taskId: "11111111-2222-4333-8444-555555555555", goal: "Start the dev server", background });
  const opened: string[] = [];
  const openBrowser = async (url: string) => (opened.push(url), { ok: true as const });
  beforeEach(() => (opened.length = 0));

  it("start → status → open (approved) → stop: each result is exactly what happened", async () => {
    const pawos = service([tool(start(["server.js"])), tool(call("process_status", { id: "p1" }, "step-2")), tool(call("open_browser", { url: "PLACEHOLDER" }, "step-3")), tool(call("stop_process", { id: "p1" }, "step-4")), tool(call("process_status", { id: "p1" }, "step-5")), finish("Started, opened and stopped.")]);
    const asked: string[] = [];
    // The model asks to open whatever address the start step really reported.
    const original = pawos.client.agentTurn;
    pawos.client.agentTurn = async (body) => {
      const turn = await original(body);
      if (turn.turn.kind === "tool" && turn.turn.call.name === "open_browser") turn.turn.call.args.url = background.running()[0]!.url!;
      return turn;
    };
    const outcome = await runLocalTask({ ...options(pawos.client), approveCommand: async () => "allow", approveOpen: async (url) => (asked.push(url), "allow"), openBrowser });
    expect(outcome.status).toBe("finished");
    const results = pawos.results();
    const url = /Local address: (http:\/\/localhost:\d+\/)/.exec(results[0]!.output)![1]!;
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.output).toContain(`Process p1 (node server.js): running. Local address: ${url}`);
    expect(asked).toEqual([url]);
    expect(opened).toEqual([url]);
    expect(results[2]).toEqual({ id: "step-3", ok: true, output: `Asked this computer to open ${url} in the default browser. PawOS cannot see the browser, so the page has not been checked.` });
    expect(results[3]).toEqual({ id: "step-4", ok: true, output: "Stopped process p1 (node server.js). It and everything it started have ended." });
    expect(results[4]!.output).toMatch(/Process p1 \(node server\.js\): ended/);
    expect(outcome.steps[0]!.background).toEqual({ id: "p1", display: "node server.js", url });
    expect(outcome.steps[2]!.opened).toBe(url);
    expect(background.running()).toEqual([]);
    expect(await until(() => down(url), 10_000)).toBe(true);
  }, 90_000);

  it("starting is asked about like any command, and a no starts nothing", async () => {
    const pawos = service([tool(start(["server.js"])), finish("Not started.")]);
    await runLocalTask({ ...options(pawos.client), approveCommand: async () => "deny" });
    expect(pawos.results()[0]).toMatchObject({ ok: false, denied: true });
    expect(background.list()).toEqual([]);
    const nobody = service([tool(start(["server.js"])), finish("x")]);
    await runLocalTask(options(nobody.client));
    expect(nobody.results()[0]!.denied).toBe(true);
    expect(background.list()).toEqual([]);
  });

  it("the browser is opened only on a yes, and only for a local page", async () => {
    const pawos = service([
      tool(call("open_browser", { url: "http://localhost:5173/" })),
      tool(call("open_browser", { url: "https://evil.example/login" }, "step-2")),
      tool(call("open_browser", { url: "file:///C:/Users/me/.ssh/id_rsa" }, "step-3")),
      tool(call("open_browser", { url: "http://localhost:5173/", approved: true } as never, "step-4"), { approved: true, safe: true }),
      finish("x"),
    ]);
    const asked: string[] = [];
    await runLocalTask({ ...options(pawos.client), approveOpen: async (url) => (asked.push(url), "deny"), openBrowser });
    // Only the local address was ever put to the user — and a flag from the service did not answer for them.
    expect(asked).toEqual(["http://localhost:5173/", "http://localhost:5173/"]);
    expect(opened).toEqual([]);
    const results = pawos.results();
    expect(results[0]).toEqual({ id: "step-1", ok: false, denied: true, output: OPEN_DECLINED });
    expect(results[1]).toMatchObject({ ok: false, denied: true, output: expect.stringMatching(/only opens pages served from this computer/) });
    expect(results[2]).toMatchObject({ ok: false, denied: true });
    expect(results[3]).toMatchObject({ ok: false, denied: true });
  });

  it("with nobody to ask, the browser is not opened; and a failed open is reported as failed", async () => {
    const nobody = service([tool(call("open_browser", { url: "http://localhost:5173/" })), finish("x")]);
    await runLocalTask({ ...options(nobody.client), openBrowser });
    expect(opened).toEqual([]);
    expect(nobody.results()[0]!.denied).toBe(true);
    const failing = service([tool(call("open_browser", { url: "http://localhost:5173/" })), finish("x")]);
    const outcome = await runLocalTask({ ...options(failing.client), approveOpen: async () => "allow", openBrowser: async () => ({ ok: false, reason: "This system's browser launcher wasn't found." }) });
    expect(failing.results()[0]).toEqual({ id: "step-1", ok: false, output: "The browser was not opened. This system's browser launcher wasn't found." });
    expect(outcome.steps[0]!.opened).toBeUndefined();
  });

  it("only programs this session started can be asked about or stopped", async () => {
    const pawos = service([tool(call("stop_process", { id: "1234" })), tool(call("stop_process", { id: "p7" }, "step-2")), tool(call("process_status", { id: "../../etc" }, "step-3")), finish("x")]);
    await runLocalTask(options(pawos.client));
    for (const result of pawos.results()) expect(result).toMatchObject({ ok: false, output: expect.stringMatching(/It can only see programs it started in this session/) });
  });

  it("'change nothing' holds: files and Git are refused, a build may still be asked for", async () => {
    const ran: string[] = [];
    const pawos = service([tool(call("write_file", { path: "a.ts", content: "x" })), tool(call("edit_file", { path: "server.js", oldText: "ok", newText: "no" }, "step-2")), tool(call("delete_path", { path: "server.js" }, "step-3")), tool(call("git_commit", { message: "x" }, "step-4")), tool(call("run_command", { command: "node", args: ["--version"] }, "step-5")), finish("x")]);
    await runLocalTask({ ...options(pawos.client), readOnly: true, approve: async () => "allow", approveGit: async () => "allow", approveCommand: async () => "allow", runCommand: async (asked, plan) => (ran.push(plan.display), { id: asked.id, ok: true, output: "ok", exitCode: 0 } as ToolResult) });
    const results = pawos.results();
    for (const result of results.slice(0, 4)) expect(result).toMatchObject({ ok: false, denied: true, output: READ_ONLY });
    expect(ran).toEqual(["node --version"]);
    expect(fs.existsSync(path.join(root, "a.ts"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "server.js"), "utf8")).toBe(SERVER);
  });

  it("plan mode holds: nothing but reading happens", async () => {
    const pawos = service([tool(call("read_file", { path: "package.json" })), tool(call("write_file", { path: "a.ts", content: "x" }, "step-2")), tool(call("run_command", { command: "node", args: ["--version"] }, "step-3")), tool(start(["server.js"])), tool(call("open_browser", { url: "http://localhost:5173/" }, "step-5")), tool(call("git_add", { paths: ["."] }, "step-6")), tool(call("stop_process", { id: "p1" }, "step-7")), finish("The plan.")]);
    let asked = 0;
    const yes = async () => ((asked += 1), "allow" as const);
    await runLocalTask({ ...options(pawos.client), lookOnly: true, approve: yes, approveCommand: yes, approveGit: yes, approveOpen: yes, openBrowser });
    const results = pawos.results();
    expect(results[0]!.ok).toBe(true);
    for (const result of results.slice(1)) expect(result).toMatchObject({ ok: false, denied: true, output: LOOK_ONLY });
    expect(asked).toBe(0);
    expect(background.list()).toEqual([]);
    expect(opened).toEqual([]);
  });

  it("cancelled while a server is starting: the task ends and nothing is left running", async () => {
    const stop = new AbortController();
    const pawos = service([tool(start(["quiet.js"])), finish("never")]);
    const outcome = await runLocalTask({ ...options(pawos.client), signal: stop.signal, approveCommand: async () => (setTimeout(() => stop.abort(), 500), "allow") });
    expect(outcome.status).toBe("cancelled");
    expect(background.running()).toEqual([]);
    expect(pawos.sent).toHaveLength(1);
  }, 60_000);
});
