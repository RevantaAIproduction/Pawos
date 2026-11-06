import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../../lib/account/testing/fakeBackend";
import type { AccountContext } from "../../../../lib/account/accountContext";

/**
 * Connected tools and Autonomous Work for the PawOS CLI, through the real routes. GitHub and Linear
 * are fakes behind fetch; the account's credential lives in the fake connectivity_credentials table,
 * read through read_connectivity_credential() under the caller's own id, as in production.
 */
const state = vi.hoisted(() => ({ backend: null as unknown as FakeBackend, session: null as User | null }));

vi.mock("../../../../lib/account/accountContext", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../lib/account/accountContext")>();
  return {
    ...original,
    getAccountContext: async (): Promise<AccountContext | null> => (state.session ? original.resolveAccountContext(state.backend.client(state.session.id), state.session) : null),
  };
});
vi.mock("../../../../lib/supabase/serviceClient", () => ({ createServiceClient: () => state.backend.client(null, true) }));

import { GET as listTools, POST as runTool } from "./route";
import { POST as preview } from "../autonomous/preview/route";
import { POST as startRun } from "../autonomous/runs/route";
import { POST as finishRun } from "../autonomous/runs/[runId]/route";
import { AUTONOMOUS_WORK_TIERS } from "../../../../lib/webPolicy/webCapabilities";
import { parseTicketRef } from "../../../../lib/autonomous/localAutonomous";

const HOST = "pawos.test";
const GITHUB_TOKEN = "gho_github_token_never_shown";
const LINEAR_TOKEN = "lin_oauth_token_never_shown";
const headers = { host: HOST, origin: `https://${HOST}`, "content-type": "application/json" };
const post = (url: string, body: unknown) => new Request(`https://${HOST}${url}`, { method: "POST", headers, body: JSON.stringify(body) });
const tool = (body: unknown) => runTool(post("/api/web/tools", body));
const finish = (runId: string, body: unknown) => finishRun(post(`/api/web/autonomous/runs/${runId}`, body), { params: Promise.resolve({ runId }) });

let goUser: User;
let proUser: User;
let maxUser: User;
let calls: { url: string; method: string; auth: string | null; body: unknown }[];

function connect(userId: string, connector: "github" | "linear", secret: string, extra: Record<string, unknown> = {}) {
  state.backend.addConnection(userId, connector, "connected", { username: "octo" });
  const credential = state.backend.tables.connectivity_credentials.find((row) => row.user_id === userId && row.connector_id === connector);
  Object.assign(credential ?? {}, { secret, refresh_token: null, expires_at: null, ...extra });
}

const ISSUE = { number: 7, title: "Checkout button does nothing", state: "open", html_url: "https://github.com/acme/shop/issues/7", body: "Clicking Pay does nothing.", user: { login: "dana" }, labels: [{ name: "bug" }], assignees: [], comments: 1, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" };
const PR_AS_ISSUE = { ...ISSUE, number: 8, title: "Fix checkout", comments: 0, pull_request: {} };
const PULL = { number: 3, title: "Fix checkout", state: "open", html_url: "https://github.com/acme/shop/pull/3", body: "Fixes #7", user: { login: "dana" }, draft: false, merged_at: null, head: { ref: "fix" }, base: { ref: "main" }, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" };
const LINEAR_ISSUE = { id: "11111111-2222-4333-8444-555555555555", identifier: "ENG-12", title: "Cart total rounds wrong", description: "Totals are off by a cent.", url: "https://linear.app/acme/issue/ENG-12", state: { name: "Todo" }, labels: { nodes: [{ name: "Bug" }] }, priorityLabel: "High", dueDate: null, assignee: { name: "Dana" }, creator: { name: "Lee" } };

function fakeService(url: string, method: string, body: unknown): { status: number; json: unknown } {
  if (url.startsWith("https://api.linear.app/graphql")) {
    const query = String((body as { query?: string }).query ?? "");
    const variables = ((body as { variables?: Record<string, unknown> }).variables ?? {}) as Record<string, unknown>;
    if (query.includes("viewer")) return { status: 200, json: { data: { viewer: { assignedIssues: { nodes: [LINEAR_ISSUE] } } } } };
    if (query.includes("issueSearch")) return { status: 200, json: { data: { issueSearch: { nodes: [LINEAR_ISSUE] } } } };
    if (query.includes("commentCreate")) return { status: 200, json: { data: { commentCreate: { success: variables.issueId === LINEAR_ISSUE.id, comment: { id: "c1", url: "https://linear.app/acme/issue/ENG-12#comment-c1" } } } } };
    if (query.includes("issue(id")) return variables.id === "ENG-12" || variables.id === LINEAR_ISSUE.id ? { status: 200, json: { data: { issue: LINEAR_ISSUE } } } : { status: 200, json: { data: null, errors: [{ message: "Entity not found", extensions: { code: "ENTITY_NOT_FOUND" } }] } };
    return { status: 400, json: { errors: [{ message: "bad query" }] } };
  }
  const u = new URL(url);
  const p = u.pathname;
  if (method === "POST" && p === "/repos/acme/shop/issues/7/comments") return { status: 201, json: { html_url: "https://github.com/acme/shop/issues/7#issuecomment-1" } };
  if (method !== "GET") return { status: 405, json: {} };
  if (p === "/user/repos") return { status: 200, json: [{ full_name: "acme/shop", description: "The shop", default_branch: "main", private: true, html_url: "https://github.com/acme/shop", open_issues_count: 2, pushed_at: "2026-10-02T00:00:00Z", permissions: { push: true } }] };
  if (p === "/repos/acme/shop") return { status: 200, json: { full_name: "acme/shop", description: "The shop", default_branch: "main", private: true, html_url: "https://github.com/acme/shop", open_issues_count: 2 } };
  if (p === "/repos/acme/shop/issues") return { status: 200, json: [ISSUE, PR_AS_ISSUE] };
  if (p === "/repos/acme/shop/issues/7") return { status: 200, json: ISSUE };
  if (p === "/repos/acme/shop/issues/8") return { status: 200, json: PR_AS_ISSUE };
  if (p === "/repos/acme/shop/issues/7/comments") return { status: 200, json: [{ user: { login: "lee" }, body: "Same here.", created_at: "2026-10-02T00:00:00Z", html_url: "https://github.com/acme/shop/issues/7#c" }] };
  if (p === "/repos/acme/shop/pulls") return { status: 200, json: [PULL] };
  if (p === "/repos/acme/shop/pulls/3") return { status: 200, json: PULL };
  if (p === "/repos/acme/shop/pulls/3/files") return { status: 200, json: [{ filename: "src/Checkout.tsx", status: "modified", additions: 4, deletions: 1 }] };
  if (p === "/repos/acme/shop/contents/README.md") return { status: 200, json: { type: "file", encoding: "base64", content: Buffer.from("# Shop\n").toString("base64"), size: 7 } };
  return { status: 404, json: { message: "Not Found" } };
}

beforeEach(() => {
  state.backend = new FakeBackend();
  goUser = state.backend.addUser("go-user");
  proUser = state.backend.addUser("pro-user", { subscription: { active: true, tier: "pro" } });
  maxUser = state.backend.addUser("max-user", { subscription: { active: true, tier: "proMax" } });
  state.session = proUser;
  calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, auth: new Headers(init?.headers).get("authorization"), body });
      if (url.startsWith("https://api.github.com") || url.startsWith("https://api.linear.app")) {
        const answer = fakeService(url, method, body);
        return new Response(JSON.stringify(answer.json), { status: answer.status });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connected tools: the list", () => {
  it("lists every tool with what this plan includes (GitHub on every plan, Linear from Pro Max)", async () => {
    const pro = await (await listTools()).json();
    expect(pro.available).toBe(true);
    const byName = Object.fromEntries(pro.tools.map((t: { name: string; entitled: boolean; availableOn: string | null }) => [t.name, t]));
    expect(byName["github.issues"]).toMatchObject({ entitled: true, access: "read" });
    expect(byName["github.comment"]).toMatchObject({ entitled: true, access: "write" });
    expect(byName["linear.issue"]).toMatchObject({ entitled: false, availableOn: "Paw Pro Max" });
    state.session = maxUser;
    const max = await (await listTools()).json();
    expect(max.tools.find((t: { name: string }) => t.name === "linear.issue").entitled).toBe(true);
  });

  it("needs a signed-in account", async () => {
    state.session = null;
    expect((await listTools()).status).toBe(401);
    expect((await tool({ tool: "github.repositories" })).status).toBe(401);
  });
});

describe("connected tools: GitHub reads with the account's own connection", () => {
  beforeEach(() => connect("pro-user", "github", GITHUB_TOKEN));

  it("repositories, issues (without pull requests), one issue with comments, pull requests and a file", async () => {
    expect((await (await tool({ tool: "github.repositories" })).json()).data.repositories[0]).toMatchObject({ fullName: "acme/shop", canPush: true });
    const issues = await (await tool({ tool: "github.issues", args: { repo: "acme/shop" } })).json();
    expect(issues.data.issues.map((i: { number: number }) => i.number)).toEqual([7]);
    const issue = await (await tool({ tool: "github.issue", args: { repo: "acme/shop", number: 7 } })).json();
    expect(issue.data.issue).toMatchObject({ number: 7, body: "Clicking Pay does nothing.", labels: ["bug"] });
    expect(issue.data.comments).toEqual([expect.objectContaining({ author: "lee", body: "Same here." })]);
    expect((await (await tool({ tool: "github.pulls", args: { repo: "acme/shop" } })).json()).data.pulls[0]).toMatchObject({ number: 3, head: "fix" });
    expect((await (await tool({ tool: "github.pull", args: { repo: "acme/shop", number: 3 } })).json()).data.files).toEqual([{ path: "src/Checkout.tsx", status: "modified", additions: 4, deletions: 1 }]);
    expect((await (await tool({ tool: "github.file", args: { repo: "acme/shop", path: "README.md" } })).json()).data.content).toBe("# Shop\n");
  });

  it("the token is used on the server only: sent to GitHub, never returned", async () => {
    const response = await tool({ tool: "github.issue", args: { repo: "acme/shop", number: 7 } });
    expect(calls.every((c) => c.auth === `Bearer ${GITHUB_TOKEN}`)).toBe(true);
    expect(JSON.stringify(await response.json())).not.toContain(GITHUB_TOKEN);
  });

  it("never reads secrets, keys, lockfiles or CI files, and rejects bad arguments before calling GitHub", async () => {
    for (const p of [".env", "config/.env.production", "keys/server.pem", "package-lock.json", ".github/workflows/ci.yml", "../outside"]) {
      const response = await tool({ tool: "github.file", args: { repo: "acme/shop", path: p } });
      expect([400, 403]).toContain(response.status);
    }
    for (const args of [{ repo: "not a repo" }, { repo: "acme/shop", number: -1 }, { repo: "acme/shop", number: 7, extra: 1 }]) {
      expect((await tool({ tool: "github.issue", args })).status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("a write needs the user's confirmation; with it, the comment is posted", async () => {
    const unconfirmed = await tool({ tool: "github.comment", args: { repo: "acme/shop", number: 7, body: "Fixed in #3." } });
    expect(unconfirmed.status).toBe(428);
    expect((await unconfirmed.json()).code).toBe("confirmation_required");
    expect(calls).toHaveLength(0);
    const confirmed = await (await tool({ tool: "github.comment", args: { repo: "acme/shop", number: 7, body: "Fixed in #3." }, confirmed: true })).json();
    expect(confirmed.data).toMatchObject({ commented: true, url: "https://github.com/acme/shop/issues/7#issuecomment-1" });
    expect(calls).toEqual([expect.objectContaining({ method: "POST", body: { body: "Fixed in #3." } })]);
  });

  it("unknown tools are refused", async () => {
    expect((await tool({ tool: "github.deleteRepository", args: { repo: "acme/shop" } })).status).toBe(404);
  });
});

describe("connected tools: Linear (Pro Max and up)", () => {
  it("is refused on a plan without the Linear connector, before any credential is read", async () => {
    connect("pro-user", "linear", LINEAR_TOKEN);
    const response = await tool({ tool: "linear.myIssues" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "not_entitled", availableOn: "Paw Pro Max" });
    expect(calls).toHaveLength(0);
  });

  it("reads my issues, one issue and a search; comments only when confirmed", async () => {
    state.session = maxUser;
    connect("max-user", "linear", LINEAR_TOKEN);
    expect((await (await tool({ tool: "linear.myIssues" })).json()).data.issues[0]).toMatchObject({ key: "ENG-12", priority: "High" });
    expect((await (await tool({ tool: "linear.issue", args: { id: "eng-12" } })).json()).data.issue).toMatchObject({ key: "ENG-12", description: "Totals are off by a cent.", reporter: "Lee" });
    expect((await (await tool({ tool: "linear.search", args: { query: "cart" } })).json()).data.issues).toHaveLength(1);
    expect((await tool({ tool: "linear.issue", args: { id: "ENG-999" } })).status).toBe(404);
    expect((await tool({ tool: "linear.comment", args: { id: "ENG-12", body: "On it." } })).status).toBe(428);
    expect((await (await tool({ tool: "linear.comment", args: { id: "ENG-12", body: "On it." }, confirmed: true })).json()).data).toMatchObject({ commented: true });
    expect(calls.every((c) => c.auth === `Bearer ${LINEAR_TOKEN}`)).toBe(true);
  });

  it("says to reconnect when Linear isn't connected or its token has expired", async () => {
    state.session = maxUser;
    const missing = await tool({ tool: "linear.myIssues" });
    expect(missing.status).toBe(409);
    expect((await missing.json()).code).toBe("not_connected");
    connect("max-user", "linear", LINEAR_TOKEN, { expires_at: "2020-01-01T00:00:00Z" });
    const expired = await tool({ tool: "linear.myIssues" });
    expect((await expired.json()).code).toBe("needs_reauth");
    expect(calls).toHaveLength(0);
  });

  it("another account's credential is never used", async () => {
    connect("pro-user", "github", GITHUB_TOKEN);
    state.session = goUser;
    const response = await tool({ tool: "github.repositories" });
    expect(response.status).toBe(409);
    expect(calls).toHaveLength(0);
  });
});

describe("Autonomous Work from the CLI", () => {
  const wallet = (userId: string, usd: number) => state.backend.tables.user_task_credits.push({ user_id: userId, balance_usd: usd, balance_pc: usd * 100, balance_reserved: 0 });

  it("reads tickets as Linear keys or GitHub issues", () => {
    expect(parseTicketRef("eng-12")).toEqual({ source: "linear", id: "ENG-12" });
    expect(parseTicketRef("linear:ENG-12")).toEqual({ source: "linear", id: "ENG-12" });
    expect(parseTicketRef("acme/shop#7")).toEqual({ source: "github", repo: "acme/shop", number: 7 });
    expect(parseTicketRef("https://github.com/acme/shop/issues/7")).toEqual({ source: "github", repo: "acme/shop", number: 7 });
    expect(parseTicketRef("drop table")).toBeNull();
  });

  it("is Pro Max, Team and Enterprise only — the desktop's autonomousTaskBilling tiers", async () => {
    const desktop = fs.readFileSync(path.resolve(__dirname, "../../../../../../src/main/billing/EntitlementService.ts"), "utf8");
    const block = (name: string) => new RegExp(`const\\s+${name}:\\s*FeatureId\\[\\]\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(desktop)?.[1] ?? "";
    expect(block("PRO_MAX_FEATURES")).toContain("'autonomousTaskBilling'");
    expect(block("PRO_FEATURES")).not.toContain("autonomousTaskBilling");
    expect(block("BUILD_FEATURES")).not.toContain("autonomousTaskBilling");
    expect(block("TEAM_FEATURES")).toContain("...PRO_MAX_FEATURES");
    expect(block("ENTERPRISE_FEATURES")).toContain("...TEAM_FEATURES");
    expect([...AUTONOMOUS_WORK_TIERS]).toEqual(["proMax", "team", "enterprise"]);

    connect("pro-user", "github", GITHUB_TOKEN);
    wallet("pro-user", 50);
    const refused = await preview(post("/api/web/autonomous/preview", { ticket: "acme/shop#7" }));
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("capability_locked");
    expect(calls).toHaveLength(0);
  });

  describe("on Pro Max", () => {
    beforeEach(() => {
      state.session = maxUser;
      connect("max-user", "github", GITHUB_TOKEN);
      connect("max-user", "linear", LINEAR_TOKEN);
    });

    it("previews the ticket, balance and price rule without starting or charging anything", async () => {
      wallet("max-user", 50);
      const body = await (await preview(post("/api/web/autonomous/preview", { ticket: "ENG-12" }))).json();
      expect(body).toMatchObject({ canStart: true, minimumUsd: 5, ticket: { key: "ENG-12", title: "Cart total rounds wrong" }, balance: { availableUsd: 50 } });
      expect(state.backend.autonomousCalls).toHaveLength(0);
    });

    it("refuses to start without the user's authorization, or below the start minimum", async () => {
      wallet("max-user", 3);
      expect((await startRun(post("/api/web/autonomous/runs", { ticket: "ENG-12" }))).status).toBe(428);
      const low = await startRun(post("/api/web/autonomous/runs", { ticket: "ENG-12", authorized: true }));
      expect(low.status).toBe(402);
      expect((await low.json()).message).toMatch(/needs at least \$5\.00/);
      expect(state.backend.autonomousCalls).toHaveLength(0);
    });

    it("refuses a ticket it can't read (not found, or a pull request)", async () => {
      wallet("max-user", 50);
      expect((await startRun(post("/api/web/autonomous/runs", { ticket: "ENG-999", authorized: true }))).status).toBe(404);
      expect((await startRun(post("/api/web/autonomous/runs", { ticket: "acme/shop#8", authorized: true }))).status).toBe(422);
      expect(state.backend.autonomousCalls).toHaveLength(0);
    });

    it("starts once per ticket, completes with verified evidence, and charges once", async () => {
      wallet("max-user", 50);
      const started = await (await startRun(post("/api/web/autonomous/runs", { ticket: "acme/shop#7", authorized: true }))).json();
      expect(started).toMatchObject({ alreadyActive: false, run: { status: "running" }, ticket: { key: "acme/shop#7" } });
      const again = await (await startRun(post("/api/web/autonomous/runs", { ticket: "acme/shop#7", authorized: true }))).json();
      expect(again).toMatchObject({ alreadyActive: true, run: { id: started.run.id } });

      expect((await finish(started.run.id, { outcome: "completed", filesChanged: 2, linesChanged: 30, comment: "Fixed in #3." })).status).toBe(428);
      expect((await finish(started.run.id, { outcome: "completed", filesChanged: 2, linesChanged: 30, prUrl: "https://github.com/acme/shop/pull/99" })).status).toBe(422);
      const done = await (await finish(started.run.id, { outcome: "completed", filesChanged: 2, linesChanged: 30, prUrl: "https://github.com/acme/shop/pull/3", comment: "Fixed in #3.", commentConfirmed: true })).json();
      expect(done).toMatchObject({ run: { status: "completed" }, chargedUsd: 5, prVerified: true, ticketVerified: true });
      expect(state.backend.tables.organization_billing_events).toEqual([expect.objectContaining({ amount_usd: 5, completion_source: "connector_verified" })]);
      // Completing again is the same completed run: never a second charge.
      await finish(started.run.id, { outcome: "completed", filesChanged: 2, linesChanged: 30 });
      expect(state.backend.tables.organization_billing_events).toHaveLength(1);
      expect(state.backend.tables.user_task_credits[0]).toMatchObject({ balance_usd: 45 });
    });

    it("a run with no changes can't be completed; a failed run is ended without a charge", async () => {
      wallet("max-user", 50);
      const started = await (await startRun(post("/api/web/autonomous/runs", { ticket: "ENG-12", authorized: true }))).json();
      expect((await finish(started.run.id, { outcome: "completed", filesChanged: 0, linesChanged: 0 })).status).toBe(422);
      expect((await (await finish(started.run.id, { outcome: "failed" })).json()).run.status).toBe("failed");
      expect(state.backend.tables.organization_billing_events).toHaveLength(0);
    });

    it("another account can't finish this account's run", async () => {
      wallet("max-user", 50);
      const started = await (await startRun(post("/api/web/autonomous/runs", { ticket: "ENG-12", authorized: true }))).json();
      const other = state.backend.addUser("max-2", { subscription: { active: true, tier: "proMax" } });
      state.session = other;
      expect((await finish(started.run.id, { outcome: "cancelled" })).status).toBe(404);
    });
  });
});
