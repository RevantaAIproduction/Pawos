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
import { pathsNamedIn, referencedPaths } from "../../../../lib/webCode/investigate";
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
/** The investigation's replies, in order (the last repeats). */
let analysisReplies: unknown[];
let editReply: unknown;
let repairReply: unknown;
let fixReply: unknown;
let modelCalls: { system: string; user: string }[];
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
  analysisReplies = [{ need: [], rootCause: null, plan: ["In src/components/Header.tsx, change the heading text."], decline: null }];
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
        const sent = JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text?: string }[] }[] };
        const system = sent.systemInstruction.parts[0].text;
        modelCalls.push({ system, user: sent.contents.flatMap((content) => content.parts.map((part) => part.text ?? "")).join("\n") });
        const reply = system.includes("choosing which files")
          ? planReply
          : system.includes("investigating a GitHub repository")
            ? analysisReplies.length > 1
              ? analysisReplies.shift()
              : analysisReplies[0]
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
    // Three model calls: where to start, the investigation, the edit.
    expect(reserves.map((c) => c.args.p_category)).toEqual(["web-code-change", "web-code-change", "web-code-change"]);
    expect(state.backend.usageCalls.filter((c) => c.name === "settle_usage")).toHaveLength(3);
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
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(4);

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
    // Never charged to usage buckets: this tier has none (Desktop doesn't charge its allowance to one either).
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(0);
    for (const row of state.backend.tables.web_chat_requests) row.updated_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect((await send(post({ content: "next week" }))).status).toBe(200);
  });
});

describe("usage is counted where PawOS Desktop counts it", () => {
  it("the admin-granted access tier: Web messages come out of its included Paw Compute, not on top of it", async () => {
    const startsAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // day 11 of the grant: week 2 began 3 days ago
    state.backend.addUser("admin-tier-2", { buildStatus: "active", buildStartsAt: startsAt.toISOString(), buildEndsAt: new Date(startsAt.getTime() + 56 * 24 * 60 * 60 * 1000).toISOString() });
    state.session = { id: "admin-tier-2", email: "b@example.com", user_metadata: {} } as unknown as User;
    const ago = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const usage = state.backend.tables.web_build_usage;
    const report = (weekPcUsed: number, windowPcUsed = 0) => {
      state.backend.tables.pawos_build_usage_reports = [
        { user_id: "admin-tier-2", report: { weekPcUsed, weekPcLimit: 1500, weekResetsAt: Date.now() + 4 * 24 * 60 * 60 * 1000, windowPcUsed, windowPcLimit: 500, windowResetsAt: Date.now() + 60 * 60 * 1000 } },
      ];
    };

    // Desktop used 1,400 PC this week; Web used 99 → 1,499: one more message is allowed…
    report(1400);
    usage.push({ user_id: "admin-tier-2", request_key: "old-1", pc: 99, created_at: ago(30) });
    usage.push({ user_id: "admin-tier-2", request_key: "last-week", pc: 900, created_at: ago(24 * 4) }); // previous grant week: not counted
    const allowed = await send(post({ content: "hello" }));
    expect(allowed.status).toBe(200);
    // …and its cost is recorded against the same allowance, priced from the model's price row.
    const recorded = usage.filter((row) => String(row.request_key).startsWith("web-chat:"));
    expect(recorded).toHaveLength(1);
    expect(Number(recorded[0].pc)).toBeGreaterThan(0);

    // At 1,500 (Desktop and Web together) the week is used up: refused before anything is claimed.
    usage.push({ user_id: "admin-tier-2", request_key: "old-2", pc: 1, created_at: ago(29) });
    const claimsBefore = state.backend.tables.web_chat_requests.length;
    const refused = await send(post({ content: "more" }));
    expect(refused.status).toBe(402);
    expect((await refused.json()).message).toMatch(/PawOS Desktop and Web together/);
    expect(state.backend.tables.web_chat_requests).toHaveLength(claimsBefore);

    // The 5-hour window too: 450 on Desktop + 50 on Web in the last 5 hours.
    state.backend.tables.web_build_usage = [{ user_id: "admin-tier-2", request_key: "recent", pc: 50, created_at: ago(1) }];
    report(600, 450);
    expect((await send(post({ content: "window" }))).status).toBe(402);
    // Once Desktop's reported week and window have reset, only Web's own use counts.
    state.backend.tables.pawos_build_usage_reports[0].report = { weekPcUsed: 1500, weekPcLimit: 1500, weekResetsAt: Date.now() - 1000, windowPcUsed: 500, windowResetsAt: Date.now() - 1000 };
    expect((await send(post({ content: "after reset" }))).status).toBe(200);
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(0);
  });

  it("the admin-granted access tier: every model call of a code change is recorded against its allowance", async () => {
    state.backend.addUser("admin-tier-3", { buildStatus: "active" });
    state.session = { id: "admin-tier-3", email: "c@example.com", user_metadata: {} } as unknown as User;
    await ready();
    expect((await send(post({ content: "Rename the button", mode: "codeChange", requestId: "build-change-01" }))).status).toBe(200);
    const keys = state.backend.tables.web_build_usage.map((row) => String(row.request_key));
    expect(keys.filter((key) => key.startsWith("web-change:build-change-01:")).length).toBeGreaterThanOrEqual(2);
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(0);
  });

  it("Team: each message is charged to the member's own seat usage — never an organization pool", async () => {
    state.backend.addUser("team-member");
    state.backend.joinOrganization("team-member", { id: "org-team", name: "Team", tier: "team" }, "member");
    state.session = { id: "team-member", email: "t@example.com", user_metadata: {} } as unknown as User;
    expect((await send(post({ content: "one" }))).status).toBe(200);
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage").length).toBeGreaterThan(0);
    expect(state.backend.usageCalls.filter((c) => c.name === "increment_organization_usage")).toHaveLength(0);
    expect(state.backend.organizationUsage.size).toBe(0);
    // When the seat's usage is used up, the member is refused — nobody else's usage is borrowed.
    state.backend.reserveResult = { ok: false, reason: "plan_exhausted" };
    expect((await send(post({ content: "two" }))).status).toBe(402);
    expect(state.backend.organizationUsage.size).toBe(0);
  });

  it("Enterprise: one unit of the organization's pool per message, never the member's own buckets", async () => {
    state.backend.addUser("ent-member-2");
    state.backend.joinOrganization("ent-member-2", { id: "org-ent-2", name: "Ent", tier: "enterprise" }, "member");
    state.session = { id: "ent-member-2", email: "e2@example.com", user_metadata: {} } as unknown as User;
    state.backend.organizationLimit = 2;
    expect((await send(post({ content: "one" }))).status).toBe(200);
    expect((await send(post({ content: "two" }))).status).toBe(200);
    expect(state.backend.organizationUsage.get("org-ent-2")).toBe(2);
    const refused = await send(post({ content: "three" }));
    expect(refused.status).toBe(402);
    expect((await refused.json()).message).toMatch(/organization's shared usage/);
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(0);
    expect(state.backend.tables.web_chat_messages.filter((m) => m.content === "three")).toHaveLength(0);
  });

  it("Enterprise: a code change is one unit of the pool, whatever model calls it makes", async () => {
    state.backend.addUser("ent-member");
    state.backend.joinOrganization("ent-member", { id: "org-ent", name: "Ent", tier: "enterprise" }, "member");
    state.session = { id: "ent-member", email: "e@example.com", user_metadata: {} } as unknown as User;
    await ready();
    expect((await send(post({ content: "Rename the button", mode: "codeChange", requestId: "ent-change-0001" }))).status).toBe(200);
    expect(state.backend.organizationUsage.get("org-ent")).toBe(1);
    expect(state.backend.usageCalls.filter((c) => c.name === "reserve_usage")).toHaveLength(0);
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

/**
 * What a paid plan's change actually does before it writes anything: it reads the code, follows
 * what that code refers to, and plans from the contents. Then what it does when the repository's
 * own checks fail, and what it says when nothing verified the change at all.
 */
describe("investigation: read the code, follow it, plan from it", () => {
  const CART = "acme/cart";
  const PAGE = 'import { cartTotal } from "@/lib/cart";\n\nexport default function CartPage() {\n  return <p>Total: {cartTotal([{ price: 100 }], 10)}</p>;\n}\n';
  const CART_LIB = 'import { applyDiscount } from "./pricing";\n\nexport function cartTotal(items: { price: number }[], percent: number) {\n  return items.reduce((sum, item) => sum + applyDiscount(item.price, percent), 0);\n}\n';
  const PRICING = "export function applyDiscount(price: number, percent: number) {\n  return price - price * percent;\n}\n";
  const PRICING_FIXED = PRICING.replace("price * percent", "(price * percent) / 100");
  const CART_FILES = {
    "src/app/cart/page.tsx": PAGE,
    "src/lib/cart.ts": CART_LIB,
    "src/lib/pricing.ts": PRICING,
    "src/lib/format.ts": "export const money = (n: number) => `$${n}`;\n",
    "README.md": "# Cart\n",
    ".env": "SECRET=1\n",
  };
  const analyses = () => modelCalls.filter((call) => call.system.includes("investigating a GitHub repository"));
  const edits = () => modelCalls.filter((call) => call.system.includes("making a code change"));
  const cartFiles = () => github.filesOn(CART, "main") ?? {};

  beforeEach(async () => {
    connectGitHub("pro-user");
    github.addRepo(CART, CART_FILES);
    expect((await selectRepo(put({ fullName: CART }))).status).toBe(200);
    planReply = { files: ["src/app/cart/page.tsx"], decline: null };
    analysisReplies = [
      { need: ["src/lib/cart.ts"], rootCause: null, plan: [], decline: null },
      { need: ["src/lib/pricing.ts"], rootCause: null, plan: [], decline: null },
      { need: [], rootCause: "applyDiscount in src/lib/pricing.ts multiplies by the percentage without dividing by 100.", plan: ["In src/lib/pricing.ts, divide the percentage by 100 in applyDiscount."], decline: null },
    ];
    editReply = { title: "Fix the discount", summary: "The discount is now a percentage.", changes: [{ path: "src/lib/pricing.ts", content: PRICING_FIXED }], decline: null };
  });

  it("multi-file investigation: it follows the code from the page to the root cause, two files away, and changes that file", async () => {
    const response = await send(post({ content: "The cart total is wrong when a discount is applied", mode: "codeChange", requestId: "investigate-001" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    // Three looks at the code: each one saw more of it than the last.
    expect(analyses()).toHaveLength(3);
    expect(analyses()[0].user).toContain("--- FILE: src/app/cart/page.tsx");
    expect(analyses()[0].user).not.toContain("--- FILE: src/lib/cart.ts");
    expect(analyses()[1].user).toContain("--- FILE: src/lib/cart.ts");
    expect(analyses()[1].user).not.toContain("--- FILE: src/lib/pricing.ts");
    expect(analyses()[2].user).toContain(`--- FILE: src/lib/pricing.ts\n${PRICING}`);
    // The file that was changed is the one with the bug — not the one the request seemed to be about.
    expect(cartFiles()["src/lib/pricing.ts"]).toBe(PRICING_FIXED);
    expect(cartFiles()["src/app/cart/page.tsx"]).toBe(PAGE);
    expect(body.change.files).toEqual(["src/lib/pricing.ts"]);
    expect(body.change.steps.map((s: { id: string; status: string }) => [s.id, s.status])).toEqual([["read", "done"], ["plan", "done"], ["write", "done"], ["check", "done"], ["push", "done"], ["preview", "active"]]);
  });

  it("relevant-file discovery: the files the code imports are worked out from the code itself and offered, not guessed", async () => {
    await send(post({ content: "The cart total is wrong", mode: "codeChange" }));
    // page.tsx imports "@/lib/cart"; cart.ts imports "./pricing". Neither path was in the request.
    expect(analyses()[0].user).toContain("Files the code you have read refers to, not read yet:\nsrc/lib/cart.ts");
    expect(analyses()[1].user).toContain("Files the code you have read refers to, not read yet:\nsrc/lib/pricing.ts");
    expect(analyses()[2].user).not.toContain("not read yet"); // nothing left to follow
    expect(analyses()[0].user).not.toContain("src/lib/format.ts\n\nFiles you have read"); // an unrelated file is not offered as a reference
  });

  it("planning based on inspected files: the edit is written from the files read and the plan made from them", async () => {
    const body = await (await send(post({ content: "The cart total is wrong", mode: "codeChange" }))).json();
    expect(edits()).toHaveLength(1);
    const edit = edits()[0].user;
    for (const path of ["src/app/cart/page.tsx", "src/lib/cart.ts", "src/lib/pricing.ts"]) expect(edit).toContain(`--- FILE: ${path}`);
    expect(edit).toContain("Root cause: applyDiscount in src/lib/pricing.ts multiplies by the percentage without dividing by 100.");
    expect(edit).toContain("Plan:\n- In src/lib/pricing.ts, divide the percentage by 100 in applyDiscount.");
    // And the task panel says what was actually done: files read, files followed, the cause found.
    const plan = body.change.steps.find((s: { id: string }) => s.id === "plan");
    expect(plan.label).toBe("Investigate and plan");
    expect(plan.detail).toMatch(/^3 files read \(2 followed from the code\) · 1 step planned · Cause: applyDiscount in src\/lib\/pricing\.ts/);
    expect(body.change.steps.find((s: { id: string }) => s.id === "read").detail).toBe("5 files listed · 1 read");
  });

  it("a change that needs no more files is planned in one look", async () => {
    analysisReplies = [{ need: [], rootCause: null, plan: ["In src/app/cart/page.tsx, change the label."], decline: null }];
    editReply = { title: "Label", summary: "Label changed.", changes: [{ path: "src/app/cart/page.tsx", content: PAGE.replace("Total:", "Sum:") }] };
    const body = await (await send(post({ content: "Rename the Total label to Sum", mode: "codeChange" }))).json();
    expect(analyses()).toHaveLength(1);
    expect(body.change.steps.find((s: { id: string }) => s.id === "plan").detail).toBe("1 files read · 1 step planned");
    expect(cartFiles()["src/app/cart/page.tsx"]).toContain("Sum:");
  });

  it("it only ever reads files the plan may read: a secret, a path outside the repository or a file that doesn't exist is never fetched", async () => {
    analysisReplies = [{ need: [".env", "../../etc/passwd", "src/lib/nope.ts", ".github/workflows/ci.yml"], rootCause: null, plan: ["In src/app/cart/page.tsx, change the label."], decline: null }];
    editReply = { title: "Label", summary: "Label changed.", changes: [{ path: "src/app/cart/page.tsx", content: PAGE.replace("Total:", "Sum:") }] };
    expect((await send(post({ content: "Rename the label", mode: "codeChange" }))).status).toBe(200);
    for (const call of modelCalls) {
      expect(call.user).not.toContain("SECRET=1");
      expect(call.user).not.toContain("--- FILE: .env");
    }
    expect(github.calls.filter((call) => call.method === "GET" && /contents\/(\.env|\.github)/.test(call.path))).toHaveLength(0);
  });

  it("the investigation is bounded: after the plan's rounds it must plan with what it has, and if it can't, nothing is written or pushed", async () => {
    const head = github.headOf(CART, "main");
    analysisReplies = [
      { need: ["src/lib/cart.ts"], plan: [] },
      { need: ["src/lib/pricing.ts"], plan: [] },
      { need: ["src/lib/format.ts"], plan: [] },
    ];
    const body = await (await send(post({ content: "The cart total is wrong", mode: "codeChange", requestId: "investigate-bound" }))).json();
    expect(analyses()).toHaveLength(WEB_POLICY.codeChange.full.investigationRounds + 1);
    expect(analyses().at(-1)?.user).toContain("No more files can be read for this change");
    expect(analyses().at(-1)?.user).not.toContain("--- FILE: src/lib/format.ts"); // the extra file was never read
    expect(edits()).toHaveLength(0);
    expect(github.headOf(CART, "main")).toBe(head);
    expect(body.reply).toMatch(/I didn't change anything in acme\/cart/);
    expect(body.change.state).toBe("failed");
    expect(body.change.commitSha ?? null).toBeNull(); // no commit is reported, because none was made
    expect(body.change.pullRequestUrl ?? null).toBeNull();
    expect(body.change.files ?? []).toEqual([]);
    expect(body.change.steps.find((s: { id: string }) => s.id === "plan").status).toBe("failed");
  });

  it("never reads more files than the plan allows, however many are asked for", async () => {
    const many: Record<string, string> = { "src/index.ts": Array.from({ length: 30 }, (_, i) => `import "./m${i}";`).join("\n") + "\n" };
    for (let i = 0; i < 30; i++) many[`src/m${i}.ts`] = `export const v${i} = ${i};\n`;
    github.addRepo("acme/many", many);
    expect((await selectRepo(put({ fullName: "acme/many" }))).status).toBe(200);
    planReply = { files: ["src/index.ts"], decline: null };
    analysisReplies = [{ need: Array.from({ length: 30 }, (_, i) => `src/m${i}.ts`), plan: [] }, { need: [], plan: ["In src/index.ts, add a comment."] }];
    editReply = { title: "Comment", summary: "Added a comment.", changes: [{ path: "src/index.ts", content: `// entry\n${many["src/index.ts"]}` }] };
    expect((await send(post({ content: "Add a comment to the entry file", mode: "codeChange" }))).status).toBe(200);
    const read = (edits()[0].user.match(/^--- FILE: /gm) ?? []).length;
    expect(read).toBe(WEB_POLICY.codeChange.full.maxFilesRead);
  });

  it("failure handling: an investigation that declines, or can't be read, changes nothing", async () => {
    const head = github.headOf(CART, "main");
    analysisReplies = [{ need: [], rootCause: null, plan: [], decline: "That needs a database migration run by hand, which needs PawOS Desktop." }];
    const declined = await (await send(post({ content: "Add a column to the orders table", mode: "codeChange" }))).json();
    expect(declined.reply).toMatch(/I didn't change anything in acme\/cart\. That needs a database migration run by hand/);
    expect(declined.requiresDesktop).toBe(true);

    analysisReplies = ["I think the bug is somewhere in the cart."]; // not the JSON it was asked for
    expect((await send(post({ content: "The cart total is wrong", mode: "codeChange", requestId: "investigate-bad1" }))).status).toBe(502);
    const failed = (await (await change("investigate-bad1")).json()).change;
    expect(failed.state).toBe("failed");
    expect(failed.commitSha ?? null).toBeNull();
    expect(edits()).toHaveLength(0);
    expect(github.headOf(CART, "main")).toBe(head);
  });

  it("real files, commit and pull request only: what is reported is what GitHub has", async () => {
    github.repos.get(CART)?.protectedBranches.add("main");
    const body = await (await send(post({ content: "The cart total is wrong", mode: "codeChange", requestId: "investigate-pr01" }))).json();
    const branch = branchFor("investigate-pr01");
    expect(body.change.branch).toBe(branch);
    expect(body.change.commitSha).toBe(github.headOf(CART, branch));
    expect(body.change.pullRequestUrl).toMatch(/^https:\/\/github\.com\/acme\/cart\/pull\/\d+$/);
    expect(github.filesOn(CART, branch)?.["src/lib/pricing.ts"]).toBe(PRICING_FIXED);
    expect(cartFiles()["src/lib/pricing.ts"]).toBe(PRICING); // main itself was not changed
    expect(body.change.files).toEqual(["src/lib/pricing.ts"]);
    // The model's summary is reported as its summary; the commit and files come from the push.
    expect(body.reply).toContain(body.change.pullRequestUrl);
  });

  it("every look at the code is charged to the plan's allowance like any other model call — and nothing is charged when the allowance is gone", async () => {
    expect((await send(post({ content: "The cart total is wrong", mode: "codeChange" }))).status).toBe(200);
    const reserves = state.backend.usageCalls.filter((c) => c.name === "reserve_usage");
    expect(reserves).toHaveLength(5); // choose, three looks, write
    expect(new Set(reserves.map((c) => c.args.p_category))).toEqual(new Set(["web-code-change"]));
    expect(new Set(reserves.map((c) => c.args.p_request_key)).size).toBe(5); // each its own key: none can be charged twice
    expect(state.backend.usageCalls.filter((c) => c.name === "settle_usage")).toHaveLength(5);

    modelCalls = [];
    state.backend.usagePool = 0;
    expect((await send(post({ content: "And again", mode: "codeChange" }))).status).toBe(402);
    expect(modelCalls).toHaveLength(0);
  });

  it("Paw Go is unchanged: no investigation, the same two calls inside its four messages", async () => {
    state.session = goUser;
    await ready("go-user");
    planReply = { files: ["src/components/Header.tsx"], decline: null };
    editReply = { title: "Rename", summary: "Renamed.", changes: [{ path: "src/components/Header.tsx", content: HEADER.replace(">Shop<", ">Welcome<") }] };
    modelCalls = [];
    const body = await (await send(post({ content: "Change the heading to Welcome", mode: "codeChange" }))).json();
    expect(analyses()).toHaveLength(0);
    expect(modelCalls).toHaveLength(2);
    expect(body.change.scope).toBe("small");
    expect(body.change.steps.find((s: { id: string }) => s.id === "plan")).toMatchObject({ label: "Choose the files", status: "done" });
    expect(body.allowance).toMatchObject({ messagesUsed: 1 });
  });
});

describe("verification and repair: only what the repository's own checks report", () => {
  const recheckNow = (requestId: string) => {
    const row = state.backend.tables.web_code_changes.find((r) => r.request_id === requestId);
    if (row) row.last_checked_at = null;
  };
  const fixes = () => modelCalls.filter((call) => call.system.includes("fixing a code change"));
  const PAGE_FIXED = 'import { Header } from "../components/Header";\n\nexport default function Page() { return <Header />; }\n';

  beforeEach(async () => {
    await ready();
  });

  async function pushed(requestId: string) {
    expect((await send(post({ content: "Rename the heading", mode: "codeChange", requestId }))).status).toBe(200);
    return github.headOf(REPO, "main") as string;
  }

  it("failed verification → repair: the failure names a file the change didn't touch, so that file is read and fixed", async () => {
    const sha = await pushed("repair-0001");
    github.signals.set(sha, { checks: [{ id: 21, name: "typecheck", status: "completed", conclusion: "failure", title: "1 error", annotations: [{ path: "src/app/page.tsx", start_line: 1, message: "Module '../components/Header' has no exported member 'Title'" }] }] });
    fixReply = { summary: "page.tsx imported a name the header no longer exports.", changes: [{ path: "src/app/page.tsx", content: PAGE_FIXED }] };
    const fixing = await (await change("repair-0001")).json();

    // The fix saw the real report and the real contents of both the changed file and the failing one.
    expect(fixes()).toHaveLength(1);
    expect(fixes()[0].user).toContain("src/app/page.tsx:1 failure: Module '../components/Header' has no exported member 'Title'");
    expect(fixes()[0].user).toContain("Files the change touched: src/components/Header.tsx");
    expect(fixes()[0].user).toContain("Other files the reports name: src/app/page.tsx");
    expect(fixes()[0].user).toContain(`--- FILE: src/app/page.tsx\n${SHOP_FILES["src/app/page.tsx"]}`);
    expect(fixes()[0].user).toContain("--- FILE: src/components/Header.tsx");
    expect(fixes()[0].user).toContain("What the change did:\nThe heading now says Welcome.");

    // The correction went to the file that failed, and is on GitHub.
    const fixSha = github.headOf(REPO, "main") as string;
    expect(fixSha).not.toBe(sha);
    expect(mainFiles()["src/app/page.tsx"]).toBe(PAGE_FIXED);
    expect(fixing.change).toMatchObject({ state: "pushed", fixAttempts: 1, checksState: "pending", commitSha: fixSha });
    // Every file actually changed is tracked — the fix's file too.
    expect(fixing.change.files).toEqual(["src/components/Header.tsx", "src/app/page.tsx"]);
    expect(fixing.change.steps.find((s: { id: string }) => s.id === "fix")).toMatchObject({ status: "done" });
    // It is not called fixed until the checks say so on the new commit.
    expect(fixing.change.steps.find((s: { id: string }) => s.id === "preview")).toMatchObject({ status: "active" });

    github.signals.set(fixSha, { checks: [{ id: 22, name: "typecheck", status: "completed", conclusion: "success" }] });
    recheckNow("repair-0001");
    const done = await (await change("repair-0001")).json();
    expect(done.change).toMatchObject({ state: "done", checksState: "success" });
    expect(done.change.steps.find((s: { id: string }) => s.id === "preview")).toMatchObject({ status: "done", detail: "Checks passed" });
  });

  it("a repair never reads or writes a file the plan may not touch, even when the failure names it", async () => {
    const sha = await pushed("repair-0002");
    github.signals.set(sha, { checks: [{ id: 23, name: "build", status: "completed", conclusion: "failure", annotations: [{ path: ".env", start_line: 1, message: "SECRET is not set" }, { path: ".github/workflows/ci.yml", start_line: 3, message: "bad step" }] }] });
    fixReply = { summary: "Set the secret.", changes: [{ path: ".env", content: "SECRET=2\n" }] };
    const body = await (await change("repair-0002")).json();
    expect(fixes()[0].user).not.toContain("SECRET=1");
    expect(fixes()[0].user).not.toContain("--- FILE: .env");
    expect(fixes()[0].user).not.toContain("Other files the reports name");
    expect(mainFiles()[".env"]).toBe("SECRET=1\n");
    expect(github.headOf(REPO, "main")).toBe(sha);
    expect(body.change).toMatchObject({ state: "failed", checksState: "failure" });
  });

  it("Paw Go's repair is unchanged: it sees, and may edit, only the files its change touched — whatever the failure names", async () => {
    state.session = goUser;
    await ready("go-user");
    expect((await send(post({ content: "Change the heading to Welcome", mode: "codeChange", requestId: "go-repair-001" }))).status).toBe(200);
    const sha = github.headOf(REPO, "main") as string;
    github.signals.set(sha, { checks: [{ id: 31, name: "typecheck", status: "completed", conclusion: "failure", annotations: [{ path: "src/app/page.tsx", start_line: 1, message: "broken import" }] }] });
    fixReply = { summary: "Fixed the page.", changes: [{ path: "src/app/page.tsx", content: PAGE_FIXED }] };
    const body = await (await change("go-repair-001")).json();
    expect(fixes()).toHaveLength(1);
    expect(fixes()[0].user).toContain("--- FILE: src/components/Header.tsx");
    expect(fixes()[0].user).not.toContain("--- FILE: src/app/page.tsx");
    expect(fixes()[0].user).not.toContain("Other files the reports name");
    // A file it never read is not one it may change: nothing is pushed.
    expect(mainFiles()["src/app/page.tsx"]).toBe(SHOP_FILES["src/app/page.tsx"]);
    expect(github.headOf(REPO, "main")).toBe(sha);
    expect(body.change).toMatchObject({ state: "failed", checksState: "failure" });
    expect(github.calls.filter((call) => call.method === "GET" && call.path.includes("/git/trees/")).length).toBe(1); // the repair listed nothing
  });

  it("a repair always sees every file the change touched, however large they are together", async () => {
    const big = (name: string) => `export const ${name} = [\n${Array.from({ length: 2900 }, (_, i) => `  "${name}-${String(i).padStart(6, "0")}-padding-padding",`).join("\n")}\n];\n`;
    const files = { "src/a.ts": big("a"), "src/b.ts": big("b"), "src/c.ts": big("c"), "src/d.ts": big("d") };
    github.addRepo("acme/big", files);
    expect((await selectRepo(put({ fullName: "acme/big" }))).status).toBe(200);
    expect(Object.values(files).reduce((sum, text) => sum + text.length, 0)).toBeGreaterThan(WEB_POLICY.codeChange.full.maxContextBytes);
    // A change that touched all four (recorded as PawOS records it), then a failing check.
    planReply = { files: ["src/a.ts"], decline: null };
    editReply = { title: "Mark a", summary: "Marked a.", changes: [{ path: "src/a.ts", content: `// a\n${files["src/a.ts"]}` }] };
    expect((await send(post({ content: "Add a comment", mode: "codeChange", requestId: "big-repair-01" }))).status).toBe(200);
    const row = state.backend.tables.web_code_changes.find((r) => r.request_id === "big-repair-01");
    if (row) row.files = Object.keys(files);
    const sha = github.headOf("acme/big", "main") as string;
    github.signals.set(sha, { checks: [{ id: 32, name: "build", status: "completed", conclusion: "failure" }] });
    fixReply = { summary: "Fixed d.", changes: [{ path: "src/d.ts", content: `// d\n${files["src/d.ts"]}` }] };
    await change("big-repair-01");
    for (const path of Object.keys(files)) expect(fixes()[0].user).toContain(`--- FILE: ${path}`);
    expect(github.filesOn("acme/big", "main")?.["src/d.ts"]?.startsWith("// d\n")).toBe(true); // and the fix to the last one was accepted
  });

  it("a failure that can't be fixed here is reported as a failure — never as done", async () => {
    const sha = await pushed("repair-0003");
    github.signals.set(sha, { checks: [{ id: 24, name: "e2e", status: "completed", conclusion: "failure", title: "Runner out of disk space" }] });
    fixReply = { summary: "The runner ran out of disk space; nothing in these files caused it.", changes: [] };
    const body = await (await change("repair-0003")).json();
    expect(body.change).toMatchObject({ state: "failed", checksState: "failure", error: "Checks failed on the pushed change." });
    expect(body.change.steps.find((s: { id: string }) => s.id === "fix")).toMatchObject({ status: "failed", detail: "The runner ran out of disk space; nothing in these files caused it." });
    expect(github.headOf(REPO, "main")).toBe(sha);
  });

  it("successful verification: reported as passed only because the repository's checks passed", async () => {
    const sha = await pushed("verify-0001");
    expect((await (await change("verify-0001")).json()).change).toMatchObject({ state: "pushed", checksState: "pending" }); // nothing reported yet: not a pass
    github.signals.set(sha, { checks: [{ id: 25, name: "test", status: "completed", conclusion: "success" }, { id: 26, name: "build", status: "completed", conclusion: "success" }] });
    recheckNow("verify-0001");
    const body = await (await change("verify-0001")).json();
    expect(body.change).toMatchObject({ state: "done", checksState: "success", fixAttempts: 0 });
    expect(fixes()).toHaveLength(0);
  });

  it("no verification evidence: the change is never called verified or passed", async () => {
    const sent = await (await send(post({ content: "Rename the heading", mode: "codeChange", requestId: "noevidence-01" }))).json();
    expect(sent.reply).not.toMatch(/checks passed|verified|tests pass/i);
    expect(sent.change.checksState).toBe("pending");
    const row = state.backend.tables.web_code_changes.find((r) => r.request_id === "noevidence-01");
    if (row) row.pushed_at = new Date(Date.now() - (WEB_POLICY.codeChange.previewWaitSeconds + 5) * 1000).toISOString();
    const body = await (await change("noevidence-01")).json();
    expect(body.change.checksState).toBe("none");
    const preview = body.change.steps.find((s: { id: string }) => s.id === "preview");
    expect(preview.status).toBe("skipped"); // not "done": nothing checked it
    expect(preview.detail).toBe("No deployments or checks reported for this repository — the change was not verified");
    expect(JSON.stringify(body.change)).not.toMatch(/checks passed/i);
  });
});

describe("following the code (pure helpers)", () => {
  const known = new Set(["src/app/page.tsx", "src/lib/cart.ts", "src/lib/cart.test.ts", "src/lib/pricing.ts", "src/lib/util/index.ts", "src/styles/base.css", "src/styles/theme.css", "lib/shared.js", "app/models/user.py", "app/models/__init__.py", "app/db.py", "page.tsx", "README.md"]);

  it("resolves what a file imports to files that exist — relative, aliased, compiled-name and index imports", () => {
    expect(referencedPaths("src/app/page.tsx", 'import { a } from "@/lib/cart";\nimport b from "../lib/pricing";\nconst c = require("../lib/util");\nawait import("../lib/cart.js");\nimport "../styles/base.css";\n', known)).toEqual(["src/lib/cart.ts", "src/lib/pricing.ts", "src/lib/util/index.ts", "src/styles/base.css"]);
    expect(referencedPaths("src/lib/cart.ts", 'export { x } from "./pricing";\nimport shared from "lib/shared";\n', known)).toEqual(["src/lib/pricing.ts", "lib/shared.js"]);
    expect(referencedPaths("src/styles/base.css", '@import "./theme.css";\n', known)).toEqual(["src/styles/theme.css"]);
    expect(referencedPaths("app/models/user.py", "from ..db import session\nfrom . import base\nimport app.models\n", known)).toEqual(["app/db.py", "app/models/__init__.py"]);
  });

  it("never resolves a package, a URL, a path outside the repository or a file that isn't there", () => {
    expect(referencedPaths("src/app/page.tsx", 'import React from "react";\nimport x from "@scope/pkg";\nimport y from "https://cdn.example/x.js";\nimport z from "../../../../etc/passwd";\nimport w from "./missing";\nimport fs from "node:fs";\n', known)).toEqual([]);
    expect(referencedPaths("src/lib/cart.ts", 'import self from "./cart";\n', known)).toEqual([]);
  });

  it("finds the repository files a failure report names, whole paths only", () => {
    const report = "error TS2305 at src/lib/pricing.ts:12:3\n  in ./src/app/page.tsx (line 4)\nFAIL src\\lib\\cart.test.ts\nsee notsrc/lib/cart.tsx and src/lib/cart.tsbackup";
    expect(pathsNamedIn(report, known)).toEqual(["src/lib/pricing.ts", "src/app/page.tsx", "src/lib/cart.test.ts"]);
    expect(pathsNamedIn("nothing here", known)).toEqual([]);
    expect(pathsNamedIn("", known)).toEqual([]);
    expect(pathsNamedIn("/etc/passwd and ../.env and node_modules/x/index.js", known)).toEqual([]);
  });
});
