import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { FakeBackend } from "../../../../lib/account/testing/fakeBackend";
import { FakeGitHub } from "../../../../lib/account/testing/fakeGitHub";
import type { AccountContext } from "../../../../lib/account/accountContext";

/**
 * Code changes from PawOS Web, through the real routes. Paw Go: small frontend changes from short
 * prompts, inside its four messages. Paid plans: frontend and backend, on the usage allowance.
 * Every change is pushed straight to the default branch (a protected one gets a branch + pull
 * request), then the repository's own deployments and checks are watched: the preview is reported
 * and a failure is fixed automatically, within the plan's limits. GitHub and the model are fakes.
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

import { POST as send } from "../../web-chat/messages/route";
import { GET as listRepos } from "./repositories/route";
import { DELETE as clearRepo, GET as getRepo, PUT as selectRepo } from "./repository/route";
import { GET as getChange } from "../changes/[requestId]/route";
import { changedLineCount, isEditablePath, isFrontendPath, isFullScopePath, suspiciousEdits, validateEdits } from "../../../../lib/webCode/codePolicy";
import { branchFor, parseModelJson } from "../../../../lib/webCode/codeChange";
import { summariseSignals } from "../../../../lib/webCode/changeWatch";
import { WEB_POLICY, promptTooLongFor } from "../../../../lib/webPolicy/webCapabilities";

const HOST = "pawos.test";
const TOKEN = "gho_user_token_never_shown";
const REPO = "acme/shop";
const headers = { host: HOST, origin: `https://${HOST}`, "content-type": "application/json" };
const post = (body: unknown) => new Request(`https://${HOST}/api/web-chat/messages`, { method: "POST", headers, body: JSON.stringify(body) });
const put = (body: unknown) => new Request(`https://${HOST}/api/web/github/repository`, { method: "PUT", headers, body: JSON.stringify(body) });
const del = () => new Request(`https://${HOST}/api/web/github/repository`, { method: "DELETE", headers });
const change = (requestId: string) => getChange(new Request(`https://${HOST}/api/web/changes/${requestId}`), { params: Promise.resolve({ requestId }) });

let github: FakeGitHub;
let goUser: User;
let proUser: User;
let planReply: unknown;
let editReply: unknown;
let repairReply: unknown;
let fixReply: unknown;
let modelCalls: { system: string }[];
/** Runs once just before GitHub receives the next branch update — to move the branch meanwhile. */
let beforeNextRefUpdate: (() => void) | null;

const HEADER = 'export function Header() {\n  return <h1 className="title">Shop</h1>;\n}\n';
const SHOP_FILES = {
  "src/components/Header.tsx": HEADER,
  "src/styles/button.css": ".btn { color: black; }\n",
  "src/app/page.tsx": "export default function Page() { return null; }\n",
  "server/api.ts": "export function total(a: number, b: number) {\n  return a + b;\n}\n",
  "package.json": '{ "name": "shop" }\n',
  ".env": "SECRET=1\n",
};

function connectGitHub(userId: string) {
  state.backend.addConnection(userId, "github", "connected", { username: "octo" });
  const credential = state.backend.tables.connectivity_credentials.find((row) => row.user_id === userId && row.connector_id === "github");
  Object.assign(credential ?? {}, { secret: TOKEN, refresh_token: null, expires_at: null });
}

async function ready(userId = state.session?.id ?? "pro-user") {
  connectGitHub(userId);
  expect((await selectRepo(put({ fullName: REPO }))).status).toBe(200);
}

const mainFiles = () => github.filesOn(REPO, "main") ?? {};

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-model-key";
  state.backend = new FakeBackend();
  goUser = state.backend.addUser("go-user");
  proUser = state.backend.addUser("pro-user", { subscription: { active: true, tier: "pro" } });
  state.session = proUser;
  github = new FakeGitHub(TOKEN);
  github.addRepo(REPO, SHOP_FILES);
  github.addRepo("acme/readonly", { "src/App.tsx": "x" }, { canPush: false });
  planReply = { files: ["src/components/Header.tsx"], decline: null };
  editReply = {
    title: "Rename the heading",
    summary: "The heading now says Welcome.",
    changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", ">Welcome<") }],
    decline: null,
  };
  repairReply = { changes: [] };
  fixReply = { summary: "Nothing to fix here.", changes: [] };
  modelCalls = [];
  beforeNextRefUpdate = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.startsWith("https://api.github.com")) {
        if (method === "PATCH" && beforeNextRefUpdate) {
          const hook = beforeNextRefUpdate;
          beforeNextRefUpdate = null;
          hook();
        }
        const result = github.handle(method, url, new Headers(init?.headers).get("authorization"), init?.body ? JSON.parse(String(init.body)) : undefined);
        return new Response(JSON.stringify(result.json), { status: result.status });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        const system = (JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] } }).systemInstruction.parts[0].text;
        modelCalls.push({ system });
        const reply = system.includes("choosing which files")
          ? planReply
          : system.includes("repairing your own code change")
            ? repairReply
            : system.includes("fixing a code change")
              ? fixReply
              : system.includes("making a code change")
                ? editReply
                : "A chat reply.";
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof reply === "string" ? reply : JSON.stringify(reply) }] } }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 200 } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Paw Go: small frontend changes from short prompts, inside its four messages", () => {
  beforeEach(async () => {
    state.session = goUser;
    await ready("go-user");
  });

  it("makes a small change and pushes it to main — one of its four messages, not charged to a usage bucket", async () => {
    const response = await send(post({ content: "Change the heading to Welcome", mode: "codeChange", requestId: "go-change-0001" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reply).toMatch(/pushed the change to `main`/);
    expect(body.allowance).toMatchObject({ messageLimit: 4, messagesUsed: 1, remaining: 3, period: "lifetime" });
    expect(mainFiles()["src/components/Header.tsx"]).toContain(">Welcome<");
    expect(state.backend.usageCalls).toHaveLength(0);
  });

  it("refuses a prompt longer than two lines — in Change and in Ask — before any model call", async () => {
    for (const mode of ["codeChange", undefined]) {
      const response = await send(post({ content: "Change the heading\nand the button\nand the footer", mode }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "prompt_too_long" });
    }
    expect((await send(post({ content: "x".repeat(WEB_POLICY.goMaxPromptChars + 1), mode: "codeChange" }))).status).toBe(400);
    expect(modelCalls).toHaveLength(0);
  });

  it("refuses anything beyond a small frontend change — nothing pushed, no message used", async () => {
    editReply = { title: "x", summary: "x", changes: [{ path: "server/api.ts", content: "export const x = 1;\n" }], decline: null };
    const backend = await send(post({ content: "Change the total function", mode: "codeChange" }));
    expect(backend.status).toBe(422);
    expect(await backend.json()).toMatchObject({ code: "change_refused" });

    const bigPage = Array.from({ length: 60 }, (_, i) => `<p>line ${i}</p>`).join("\n");
    editReply = { title: "x", summary: "x", changes: [{ path: "src/components/Header.tsx", content: bigPage }], decline: null };
    expect((await send(post({ content: "Rewrite the header", mode: "codeChange" }))).status).toBe(422);

    expect(github.writes()).toHaveLength(0);
    const chats = await (await send(post({ content: "hi" }))).json();
    expect(chats.allowance.messagesUsed).toBe(1); // only this last chat message counted
  });

  it("at four messages, no fifth change", async () => {
    for (let i = 0; i < 4; i++) expect((await send(post({ content: `hello ${i}` }))).status).toBe(200);
    expect((await send(post({ content: "Change the heading to Welcome", mode: "codeChange" }))).status).toBe(402);
    expect(github.writes()).toHaveLength(0);
  });
});

describe("what must be in place first", () => {
  it("needs GitHub connected — on every plan", async () => {
    for (const user of [proUser, goUser]) {
      state.session = user;
      expect((await (await getRepo()).json()).readiness).toEqual({ state: "githubNotConnected" });
      const response = await send(post({ content: "Change the heading", mode: "codeChange" }));
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: "github_not_connected" });
    }
    expect(modelCalls).toHaveLength(0);
  });

  it("needs a repository selected, refused before anything is claimed", async () => {
    connectGitHub("pro-user");
    expect((await (await getRepo()).json()).readiness).toEqual({ state: "noRepository" });
    const response = await send(post({ content: "Change the heading", mode: "codeChange" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "repository_not_selected" });
    expect(state.backend.tables.web_chat_requests).toHaveLength(0);
  });

  it("lists and selects only repositories the account can push to; the browser can't write the selection", async () => {
    connectGitHub("pro-user");
    expect((await (await listRepos()).json()).repositories).toEqual([{ fullName: REPO, defaultBranch: "main", private: true }]);
    expect((await selectRepo(put({ fullName: "acme/readonly" }))).status).toBe(403);
    expect((await selectRepo(put({ fullName: "../etc/passwd" }))).status).toBe(400);
    expect((await (await selectRepo(put({ fullName: REPO }))).json()).readiness).toEqual({ state: "ready", repository: { fullName: REPO, defaultBranch: "main" }, scope: "full" });
    expect((await state.backend.client("pro-user").from("web_repository_selection").insert({ user_id: "pro-user", full_name: "acme/readonly", default_branch: "main" })).error).not.toBeNull();
    expect((await (await clearRepo(del())).json()).readiness).toEqual({ state: "noRepository" });
  });

  it("reports Paw Go's scope as small", async () => {
    state.session = goUser;
    await ready("go-user");
    expect((await (await getRepo()).json()).readiness).toMatchObject({ state: "ready", scope: "small" });
  });
});

describe("paid plans: frontend and backend, pushed to the default branch", () => {
  beforeEach(async () => {
    await ready();
  });

  it("pushes straight to main, records each step, and charges every model call to the plan's allowance", async () => {
    const before = github.headOf(REPO, "main");
    const response = await send(post({ content: "Rename the heading to Welcome", mode: "codeChange", requestId: "pro-change-001" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const head = github.headOf(REPO, "main");
    expect(head).not.toBe(before);
    expect(github.commitMessage(REPO, head as string)).toMatch(/Pushed from PawOS Web/);
    expect(mainFiles()["src/components/Header.tsx"]).toContain(">Welcome<");
    expect(body.change).toMatchObject({ requestId: "pro-change-001", state: "pushed", branch: "main", commitSha: head, pullRequestUrl: null, files: ["src/components/Header.tsx"] });
    expect(body.change.steps.map((s: { id: string; status: string }) => [s.id, s.status])).toEqual([
      ["read", "done"],
      ["plan", "done"],
      ["write", "done"],
      ["check", "done"],
      ["push", "done"],
      ["preview", "active"],
    ]);
    const reserves = state.backend.usageCalls.filter((c) => c.name === "reserve_usage");
    expect(reserves.map((c) => c.args.p_category)).toEqual(["web-code-change", "web-code-change"]);
    expect(state.backend.usageCalls.filter((c) => c.name === "settle_usage")).toHaveLength(2);
    expect(body.reply).toMatch(/doesn't build or run your code itself/);
  });

  it("can change backend code", async () => {
    planReply = { files: ["server/api.ts"], decline: null };
    editReply = { title: "Round totals", summary: "Totals are rounded.", changes: [{ path: "server/api.ts", content: "export function total(a: number, b: number) {\n  return Math.round(a + b);\n}\n" }] };
    expect((await send(post({ content: "Round the totals", mode: "codeChange" }))).status).toBe(200);
    expect(mainFiles()["server/api.ts"]).toContain("Math.round");
  });

  it("never touches secrets, CI workflows or lockfiles — nothing is pushed", async () => {
    for (const path of [".env", ".github/workflows/ci.yml", "package-lock.json", "../outside.ts", "keys/server.pem"]) {
      editReply = { title: "x", summary: "x", changes: [{ path, content: "changed" }] };
      const body = await (await send(post({ content: `change ${path}`, mode: "codeChange" }))).json();
      expect(body.reply).toMatch(/didn't change anything/);
    }
    expect(github.writes()).toHaveLength(0);
  });

  it("a protected default branch gets a branch and a pull request instead — and the reply says so", async () => {
    github.repos.get(REPO)?.protectedBranches.add("main");
    const body = await (await send(post({ content: "Rename the heading", mode: "codeChange", requestId: "protected-0001" }))).json();
    expect(mainFiles()["src/components/Header.tsx"]).toBe(HEADER);
    expect(github.filesOn(REPO, branchFor("protected-0001"))?.["src/components/Header.tsx"]).toContain(">Welcome<");
    expect(body.change).toMatchObject({ branch: branchFor("protected-0001"), pullRequestUrl: `https://github.com/${REPO}/pull/1` });
    expect(body.reply).toMatch(/protected/);
  });

  it("if main moved meanwhile, it builds on the new head — unless the same file changed, then nothing is pushed", async () => {
    beforeNextRefUpdate = () => github.pushAsSomeoneElse(REPO, "main", { "README.md": "unrelated" });
    expect((await send(post({ content: "Rename the heading", mode: "codeChange" }))).status).toBe(200);
    expect(mainFiles()["README.md"]).toBe("unrelated");
    expect(mainFiles()["src/components/Header.tsx"]).toContain(">Welcome<");

    editReply = { title: "x", summary: "x", changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", ">Hello<").replace(">Welcome<", ">Hello<") }] };
    planReply = { files: ["src/components/Header.tsx"] };
    beforeNextRefUpdate = () => github.pushAsSomeoneElse(REPO, "main", { "src/components/Header.tsx": "someone else's header" });
    const body = await (await send(post({ content: "Say Hello", mode: "codeChange" }))).json();
    expect(body.reply).toMatch(/changed on main while I was working/);
    expect(mainFiles()["src/components/Header.tsx"]).toBe("someone else's header");
  });

  it("a change that looks broken is repaired before it is pushed; still broken means nothing is pushed", async () => {
    editReply = { title: "x", summary: "x", changes: [{ path: "src/components/Header.tsx", content: "export function Header() {\n  return (<div>{{{{\n" }] };
    repairReply = { changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", ">Fixed<") }] };
    expect((await send(post({ content: "Rename the heading", mode: "codeChange" }))).status).toBe(200);
    expect(mainFiles()["src/components/Header.tsx"]).toContain(">Fixed<");
    expect(modelCalls.some((call) => call.system.includes("repairing"))).toBe(true);

    const pushes = github.writes().length;
    repairReply = { changes: [] };
    const body = await (await send(post({ content: "Rename it again", mode: "codeChange" }))).json();
    expect(body.reply).toMatch(/still looked broken/);
    expect(github.writes().length).toBe(pushes);
  });

  it("an exhausted allowance is refused before any model call or push", async () => {
    state.backend.usagePool = 0;
    expect((await send(post({ content: "Rename the heading", mode: "codeChange" }))).status).toBe(402);
    expect(modelCalls).toHaveLength(0);
    expect(github.writes()).toHaveLength(0);
  });

  it("a retried request never pushes twice", async () => {
    expect((await send(post({ content: "Rename the heading", mode: "codeChange", requestId: "retry-change-01" }))).status).toBe(200);
    const head = github.headOf(REPO, "main");
    // The exchange was lost after the push; the same request is sent again.
    state.backend.tables.web_chat_messages = [];
    const request = state.backend.tables.web_chat_requests.find((r) => r.request_id === "retry-change-01");
    if (request) request.state = "failed";
    const again = await (await send(post({ content: "Rename the heading", mode: "codeChange", requestId: "retry-change-01" }))).json();
    expect(again.reply).toContain(head?.slice(0, 7) ?? "missing");
    expect(github.headOf(REPO, "main")).toBe(head);
  });
});

describe("preview and automatic fixes", () => {
  async function pushed(requestId: string) {
    expect((await send(post({ content: "Rename the heading", mode: "codeChange", requestId }))).status).toBe(200);
    return github.headOf(REPO, "main") as string;
  }
  const recheckNow = (requestId: string) => {
    const row = state.backend.tables.web_code_changes.find((r) => r.request_id === requestId);
    if (row) row.last_checked_at = null;
  };

  beforeEach(async () => {
    await ready();
  });

  it("reports the preview the repository's deployment published, and finishes when checks pass", async () => {
    const sha = await pushed("preview-0001");
    github.signals.set(sha, { deployments: [{ environment: "Preview", state: "success", url: "https://shop-git-main.vercel.app" }], checks: [{ id: 1, name: "build", status: "completed", conclusion: "success" }] });
    const body = await (await change("preview-0001")).json();
    expect(body.change).toMatchObject({ state: "done", checksState: "success", previewUrl: "https://shop-git-main.vercel.app/" });
    expect(body.change.steps.at(-1)).toMatchObject({ id: "preview", status: "done" });
  });

  it("while checks run, keeps waiting (and shows a preview as soon as there is one)", async () => {
    const sha = await pushed("preview-0002");
    github.signals.set(sha, { statuses: [{ context: "Vercel – Preview", state: "success", target_url: "https://preview.example.com" }], checks: [{ id: 2, name: "tests", status: "in_progress" }] });
    const body = await (await change("preview-0002")).json();
    expect(body.change).toMatchObject({ state: "pushed", checksState: "pending", previewUrl: "https://preview.example.com/" });
  });

  it("fixes a failed check automatically and pushes the fix, then finishes when it passes", async () => {
    const sha = await pushed("autofix-0001");
    github.signals.set(sha, { checks: [{ id: 7, name: "typecheck", status: "completed", conclusion: "failure", title: "1 error", annotations: [{ path: "src/components/Header.tsx", start_line: 2, message: "Cannot find name 'Shop'" }] }] });
    fixReply = { summary: "Quoted the heading text.", changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", ">Welcome!<") }] };
    const fixing = await (await change("autofix-0001")).json();
    expect(fixing.change).toMatchObject({ state: "pushed", fixAttempts: 1, checksState: "pending" });
    expect(fixing.change.steps.find((s: { id: string }) => s.id === "fix")).toMatchObject({ status: "done" });
    const fixSha = github.headOf(REPO, "main") as string;
    expect(fixSha).not.toBe(sha);
    expect(mainFiles()["src/components/Header.tsx"]).toContain(">Welcome!<");
    // The fix model call was charged to the allowance like any other.
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(3);

    github.signals.set(fixSha, { checks: [{ id: 8, name: "typecheck", status: "completed", conclusion: "success" }] });
    recheckNow("autofix-0001");
    expect((await (await change("autofix-0001")).json()).change).toMatchObject({ state: "done", checksState: "success" });
  });

  it("two tabs asking at once start only one fix", async () => {
    const sha = await pushed("autofix-0002");
    github.signals.set(sha, { checks: [{ id: 9, name: "build", status: "completed", conclusion: "failure" }] });
    fixReply = { summary: "Fixed.", changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", ">Fixed<") }] };
    await Promise.all([change("autofix-0002"), change("autofix-0002")]);
    expect(modelCalls.filter((call) => call.system.includes("fixing a code change"))).toHaveLength(1);
  });

  it("stops after the plan's automatic fixes and says so", async () => {
    const sha = await pushed("autofix-0003");
    const failing = { checks: [{ id: 10, name: "build", status: "completed" as const, conclusion: "failure" as const }] };
    github.signals.set(sha, failing);
    github.onPush = (_repo, _branch, newSha) => github.signals.set(newSha, failing);
    let n = 0;
    fixReply = { summary: "Tried.", changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", `>Try ${++n}<`) }] };
    for (let i = 0; i < WEB_POLICY.codeChange.full.autoFixAttempts + 1; i++) {
      fixReply = { summary: "Tried.", changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", `>Try ${i}<`) }] };
      recheckNow("autofix-0003");
      await change("autofix-0003");
    }
    const body = await (await change("autofix-0003")).json();
    expect(body.change).toMatchObject({ state: "failed", fixAttempts: WEB_POLICY.codeChange.full.autoFixAttempts });
    expect(modelCalls.filter((call) => call.system.includes("fixing a code change"))).toHaveLength(WEB_POLICY.codeChange.full.autoFixAttempts);
  });

  it("a repository with no deployments or checks is reported honestly after the wait", async () => {
    await pushed("nopreview-001");
    const row = state.backend.tables.web_code_changes.find((r) => r.request_id === "nopreview-001");
    if (row) row.pushed_at = new Date(Date.now() - (WEB_POLICY.codeChange.previewWaitSeconds + 5) * 1000).toISOString();
    const body = await (await change("nopreview-001")).json();
    expect(body.change).toMatchObject({ state: "done", checksState: "none", previewUrl: null });
  });

  it("another account's change is 404", async () => {
    await pushed("private-chg-01");
    state.session = goUser;
    expect((await change("private-chg-01")).status).toBe(404);
  });
});

describe("the admin-granted access tier: 12 Web messages a week", () => {
  it("allows twelve in a rolling week, refuses the thirteenth, and gives them back as the week rolls", async () => {
    state.backend.addUser("admin-tier", { buildStatus: "active" });
    state.session = { id: "admin-tier", email: "a@example.com", user_metadata: {} } as unknown as User;
    for (let i = 0; i < 12; i++) expect((await send(post({ content: `message ${i}` }))).status).toBe(200);
    const refused = await send(post({ content: "thirteenth" }));
    expect(refused.status).toBe(402);
    expect((await refused.json()).message).toMatch(/this week/);
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(12); // also on the usage allowance
    for (const row of state.backend.tables.web_chat_requests) row.updated_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect((await send(post({ content: "next week" }))).status).toBe(200);
  });
});

describe("the token stays on the server", () => {
  it("no response carries it", async () => {
    await ready();
    const bodies = [await (await listRepos()).text(), await (await getRepo()).text(), await (await send(post({ content: "Rename it", mode: "codeChange", requestId: "token-chk-0001" }))).text(), await (await change("token-chk-0001")).text()];
    for (const body of bodies) expect(body).not.toContain(TOKEN);
  });
});

describe("policies", () => {
  it("Paw Go accepts prompts of up to two lines", () => {
    expect(promptTooLongFor({ tier: "go" }, "Change the heading to Welcome")).toBeNull();
    expect(promptTooLongFor({ tier: "go" }, "line one\nline two")).toBeNull();
    expect(promptTooLongFor({ tier: "go" }, "one\ntwo\nthree")).toMatch(/up to 2 lines/);
    expect(promptTooLongFor({ tier: "pro" }, "one\ntwo\nthree\nfour")).toBeNull();
  });

  it.each([
    ["src/components/Button.tsx", true, true],
    ["src/styles/site.module.css", true, true],
    ["server/index.ts", false, true],
    ["src/app/api/orders/route.ts", false, true],
    ["supabase/migrations/1.sql", false, true],
    ["package.json", false, true],
    ["tailwind.config.ts", false, true],
    ["Dockerfile", false, true],
    [".env", false, false],
    [".env.local", false, false],
    [".env.example", false, true],
    [".github/workflows/ci.yml", false, false],
    ["package-lock.json", false, false],
    ["pnpm-lock.yaml", false, false],
    ["keys/server.pem", false, false],
    ["node_modules/x/index.js", false, false],
    ["dist/app.js", false, false],
    ["../secrets.ts", false, false],
    ["assets/logo.png", false, false],
  ])("%s → small %s, full %s", (path, small, full) => {
    expect(isFrontendPath(path)).toBe(small);
    expect(isEditablePath(path, "small")).toBe(small);
    expect(isFullScopePath(path)).toBe(full);
    expect(isEditablePath(path, "full")).toBe(full);
  });

  it("a small change is small", () => {
    const originals = new Map([["src/components/A.tsx", "a\nb\nc\n"]]);
    expect(validateEdits([{ path: "src/components/A.tsx", content: "a\nB\nc\n" }], "small", originals)).toMatchObject({ ok: true });
    expect(validateEdits([{ path: "src/components/A.tsx", content: Array.from({ length: 50 }, (_, i) => `x${i}`).join("\n") }], "small", originals)).toEqual({ ok: false, reason: "too_large" });
    expect(validateEdits(["a", "b", "c"].map((n) => ({ path: `src/components/${n}.tsx`, content: n })), "small")).toEqual({ ok: false, reason: "too_many_files" });
    expect(changedLineCount("a\nb\nc", "a\nX\nc")).toBe(2);
  });

  it("Paw Go edits existing files only and never adds assets; paid plans may", () => {
    const originals = new Map([["src/components/Hero.tsx", '<h1>Hello</h1>\n<img src="/logo.png" />\n']]);
    // A heading text change is fine — the existing image stays as it was.
    expect(validateEdits([{ path: "src/components/Hero.tsx", content: '<h1>Welcome</h1>\n<img src="/logo.png" />\n' }], "small", originals)).toMatchObject({ ok: true });
    // A new file is refused.
    expect(validateEdits([{ path: "src/components/New.tsx", content: "export const A = 1;\n" }], "small", originals)).toEqual({ ok: false, reason: "new_file" });
    // New image, icon, inline SVG, data URL or font: refused.
    for (const added of ['<img src="/hero.jpg" />', "<svg viewBox='0 0 1 1'></svg>", '<img src="data:image/png;base64,AAAA" />', "font: url(/fonts/x.woff2);", '<img src="/logo.png" />']) {
      expect(validateEdits([{ path: "src/components/Hero.tsx", content: `<h1>Hello</h1>\n<img src="/logo.png" />\n${added}\n` }], "small", originals), added).toEqual({ ok: false, reason: "adds_asset" });
    }
    // SVG files are assets: not editable on Paw Go, editable on paid plans.
    expect(isEditablePath("src/components/icon.svg", "small")).toBe(false);
    expect(isEditablePath("src/components/icon.svg", "full")).toBe(true);
    // Paid plans may create files and add images.
    expect(validateEdits([{ path: "src/components/New.tsx", content: '<img src="/hero.jpg" />\n' }], "full", originals)).toMatchObject({ ok: true });
  });

  it("flags edits that look broken", () => {
    expect(suspiciousEdits([{ path: "a.json", content: "{ nope" }])).toEqual([{ path: "a.json", problem: "invalid JSON" }]);
    expect(suspiciousEdits([{ path: "a.ts", content: "<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b" }])[0].problem).toMatch(/merge-conflict/);
    expect(suspiciousEdits([{ path: "a.tsx", content: "function a() {\n  if (x) {\n    call({\n" }])[0].problem).toMatch(/cut off/);
    expect(suspiciousEdits([{ path: "a.tsx", content: 'const url = "https://x.test/{"; // {\nexport const ok = () => ({ a: [1, 2] });\n' }])).toEqual([]);
  });

  it("reads the model's JSON even inside a code fence", () => {
    expect(parseModelJson('```json\n{"files": ["a"]}\n```')).toEqual({ files: ["a"] });
    expect(parseModelJson("not json")).toBeNull();
  });

  it("sums up what GitHub reported", () => {
    expect(summariseSignals([], 1000).checks).toBe("pending");
    expect(summariseSignals([], (WEB_POLICY.codeChange.previewWaitSeconds + 1) * 1000).checks).toBe("none");
    expect(
      summariseSignals(
        [
          { kind: "deployment", name: "Preview", state: "success", url: "https://p.example.com", detail: "", checkRunId: null },
          { kind: "check", name: "lint", state: "failure", url: null, detail: "", checkRunId: 1 },
        ],
        0
      )
    ).toMatchObject({ previewUrl: "https://p.example.com", checks: "failure" });
  });
});
