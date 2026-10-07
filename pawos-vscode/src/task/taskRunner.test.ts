import { describe, expect, it } from "vitest";
import { PawosApiError, type SendOutcome } from "../api/pawosClient";
import type { CodeChange, CodeChangeStep, SendResult } from "../api/types";
import { REQUEST_ID_PATTERN, newRequestId } from "./requestId";
import { runTask, type TaskClient, type TaskUpdate } from "./taskRunner";

/** One task, from the send to the result, against a scripted PawOS. */
const REQUEST_ID = "3f0c1a52-7d0e-4c55-9d6e-1f2a3b4c5d6e";

const step = (id: string, status: CodeChangeStep["status"]): CodeChangeStep => ({ id, label: id, status });

function change(overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    requestId: REQUEST_ID,
    repository: "acme/site",
    state: "running",
    steps: [step("read", "done"), step("plan", "active"), step("write", "pending")],
    branch: null,
    commitSha: null,
    commitUrl: null,
    pullRequestUrl: null,
    files: [],
    summary: null,
    previewUrl: null,
    checksState: "pending",
    fixAttempts: 0,
    error: null,
    ...overrides,
  };
}

const pushed = (overrides: Partial<CodeChange> = {}) =>
  change({ state: "pushed", branch: "main", commitSha: "abc1234def", commitUrl: "https://github.com/acme/site/commit/abc1234def", files: ["src/Header.tsx"], summary: "Renamed the button.", ...overrides });

const delivered = (result: Partial<SendResult>): SendOutcome => ({ kind: "delivered", result: { chatId: "chat-1", reply: "Done.", recovered: false, requiresDesktop: false, ...result } });

/**
 * A scripted PawOS: the send settles after `sendAfterPolls` progress polls, and each poll returns
 * the next entry of `polls` (the last one repeats). Time only moves when the runner sleeps.
 */
function scripted(options: { send: SendOutcome | Error; sendAfterPolls?: number; polls: (CodeChange | null | Error)[]; recover?: (SendOutcome | Error)[] }) {
  let clock = 0;
  let pollCount = 0;
  const sent: { content: string; requestId: string }[] = [];
  const recovered: string[] = [];
  const polled: string[] = [];
  const recoveries = [...(options.recover ?? [])];
  const releaseSend: (() => void)[] = [];

  const client: TaskClient = {
    sendCodeChange(content, requestId) {
      sent.push({ content, requestId });
      return new Promise<SendOutcome>((resolve, reject) => {
        const settle = () => (options.send instanceof Error ? reject(options.send) : resolve(options.send));
        if ((options.sendAfterPolls ?? 0) === 0) settle();
        else releaseSend.push(settle);
      });
    },
    async recoverSend(requestId) {
      recovered.push(requestId);
      const next = recoveries.length > 1 ? recoveries.shift()! : recoveries[0]!;
      if (next instanceof Error) throw next;
      return next;
    },
    async getChange(requestId) {
      polled.push(requestId);
      const next = options.polls[Math.min(pollCount, options.polls.length - 1)] ?? null;
      pollCount += 1;
      if (pollCount === options.sendAfterPolls) releaseSend.shift()?.();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const updates: TaskUpdate[] = [];
  const run = (extra: { resume?: boolean; workTimeoutMs?: number; checksWaitMs?: number } = {}) =>
    runTask({
      client,
      requestId: REQUEST_ID,
      content: "Rename the Sign in button",
      onUpdate: (update) => updates.push(update),
      pollMs: 2_500,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      ...extra,
    });
  return { run, sent, recovered, polled, updates, elapsed: () => clock };
}

describe("requestId generation", () => {
  it("is unique per task and in the form PawOS Web accepts", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(REQUEST_ID_PATTERN);
  });
});

describe("change polling", () => {
  it("polls the change by request id while PawOS works, and reports each step", async () => {
    const final = pushed({ state: "done", checksState: "success" });
    const pawos = scripted({
      send: delivered({ change: pushed() }),
      sendAfterPolls: 3,
      polls: [null, change(), change({ steps: [step("read", "done"), step("plan", "done"), step("write", "active")] }), final],
    });
    const outcome = await pawos.run();

    expect(pawos.sent).toEqual([{ content: "Rename the Sign in button", requestId: REQUEST_ID }]); // sent exactly once
    expect(new Set(pawos.polled)).toEqual(new Set([REQUEST_ID]));
    expect(pawos.updates.filter((u) => u.phase === "working").map((u) => u.change?.steps.find((s) => s.status === "active")?.id ?? null)).toEqual([null, "plan", "write"]);
    expect(outcome.status).toBe("complete");
  });

  it("waits 2.5 seconds between polls", async () => {
    const pawos = scripted({ send: delivered({ change: pushed({ state: "done", checksState: "none" }) }), sendAfterPolls: 4, polls: [change()] });
    await pawos.run();
    expect(pawos.polled).toHaveLength(4);
    expect(pawos.elapsed()).toBe(4 * 2_500);
  });

  it("a poll that fails is not the task failing", async () => {
    const pawos = scripted({
      send: delivered({ change: pushed({ state: "done", checksState: "success" }) }),
      sendAfterPolls: 3,
      polls: [new PawosApiError("server", "PawOS is having trouble right now.", 502), new PawosApiError("network", "offline"), change()],
    });
    expect((await pawos.run()).status).toBe("complete");
  });
});

describe("successful completion", () => {
  it("returns the summary, files, commit and checks once the repository's checks settle", async () => {
    const done = pushed({ state: "done", checksState: "success", previewUrl: "https://site-preview.example.dev" });
    const pawos = scripted({ send: delivered({ reply: "Done — I pushed the change.", change: pushed() }), polls: [pushed(), pushed(), done] });
    const outcome = await pawos.run();
    expect(outcome).toEqual({ status: "complete", change: done, reply: "Done — I pushed the change.", checksPending: false });
    // The change was shown as pushed as soon as PawOS answered, before the checks finished.
    expect(pawos.updates.find((u) => u.phase === "pushed")).toMatchObject({ change: { commitSha: "abc1234def", checksState: "pending" } });
  });

  it("carries the pull request when the default branch is protected", async () => {
    const withPull = pushed({ state: "done", checksState: "none", branch: "pawos-web/3f0c1a52", pullRequestUrl: "https://github.com/acme/site/pull/12" });
    const outcome = await scripted({ send: delivered({ change: withPull }), polls: [withPull] }).run();
    expect(outcome).toMatchObject({ status: "complete", change: { pullRequestUrl: "https://github.com/acme/site/pull/12", branch: "pawos-web/3f0c1a52" } });
  });

  it("stops watching checks that never report, and says they are still pending", async () => {
    const pawos = scripted({ send: delivered({ change: pushed() }), polls: [pushed()] });
    const outcome = await pawos.run({ checksWaitMs: 10_000 });
    expect(outcome).toMatchObject({ status: "complete", checksPending: true });
    expect(pawos.elapsed()).toBe(2_500 + 10_000); // one poll while PawOS answered, then the checks wait
  });

  it("follows an automatic fix through to its result", async () => {
    const fixed = pushed({ state: "done", checksState: "success", fixAttempts: 1, commitSha: "fff0000" });
    const outcome = await scripted({ send: delivered({ change: pushed() }), polls: [pushed({ checksState: "failure" }), pushed({ state: "fixing", checksState: "failure" }), fixed] }).run();
    expect(outcome).toMatchObject({ status: "complete", change: { fixAttempts: 1, checksState: "success", commitSha: "fff0000" } });
  });

  it("says so when PawOS found nothing to change", async () => {
    const outcome = await scripted({ send: delivered({ reply: "The files already do that — nothing needed to change.", change: null }), polls: [null] }).run();
    expect(outcome).toEqual({ status: "noChange", message: "The files already do that — nothing needed to change." });
  });
});

describe("failed task", () => {
  it("a change PawOS could not make fails with PawOS's own explanation and the step that failed", async () => {
    const failedChange = change({ state: "failed", error: "I didn't change anything in acme/site.", steps: [step("read", "done"), step("plan", "failed")] });
    const outcome = await scripted({ send: delivered({ reply: "I didn't change anything in acme/site. It needs PawOS Desktop.", change: failedChange }), polls: [failedChange] }).run();
    expect(outcome).toEqual({ status: "failed", message: "I didn't change anything in acme/site. It needs PawOS Desktop.", change: failedChange });
  });

  it.each([
    ["repository not selected", new PawosApiError("rejected", "Choose a repository for PawOS Web to make changes in.", 409, "repository_not_selected")],
    ["GitHub not connected", new PawosApiError("rejected", "Connect GitHub to make changes from PawOS Web.", 409, "github_not_connected")],
    ["plan doesn't include it", new PawosApiError("forbidden", "Code changes isn't included in your plan.", 403, "capability_locked")],
    ["usage used up", new PawosApiError("rejected", "Your plan's included usage is used up.", 402, "usage_limit_reached")],
    ["too many requests", new PawosApiError("rateLimited", "PawOS is receiving too many requests. Wait a moment and try again.", 429)],
    ["PawOS's own server error", new PawosApiError("server", "Something went wrong. Please try again.", 500, "failed")],
  ])("a refused send fails with its reason: %s", async (_name, error) => {
    const pawos = scripted({ send: error, polls: [null] });
    const outcome = await pawos.run();
    expect(outcome).toMatchObject({ status: "failed", message: error.message, error });
    expect(pawos.recovered).toHaveLength(0); // a clear refusal is never retried
  });

  it("a session that ends mid-task fails as unauthenticated", async () => {
    const expired = new PawosApiError("unauthenticated", "Your PawOS session has expired. Sign in again.", 401);
    const outcome = await scripted({ send: delivered({ change: pushed() }), sendAfterPolls: 5, polls: [change(), expired] }).run();
    expect(outcome).toMatchObject({ status: "failed", error: { kind: "unauthenticated" } });
  });
});

describe("a dropped connection never runs the change twice", () => {
  it("asks PawOS about the same request id instead of sending it again", async () => {
    const pawos = scripted({
      send: new PawosApiError("network", "PawOS couldn't be reached."),
      polls: [change()],
      recover: [{ kind: "processing" }, delivered({ change: pushed({ state: "done", checksState: "success" }) })],
    });
    const outcome = await pawos.run();
    expect(outcome.status).toBe("complete");
    expect(pawos.sent).toHaveLength(1);
    expect(pawos.recovered).toEqual([REQUEST_ID, REQUEST_ID]);
  });

  it("reports that nothing changed when PawOS never received it", async () => {
    const outcome = await scripted({ send: new PawosApiError("server", "PawOS is having trouble right now.", 502), polls: [null], recover: [{ kind: "notReceived" }] }).run();
    expect(outcome).toMatchObject({ status: "failed", message: "PawOS didn't receive the task, so nothing was changed. Run it again." });
  });
});

describe("processing timeout", () => {
  it("gives up waiting after the limit and keeps the last progress seen", async () => {
    const pawos = scripted({ send: delivered({}), sendAfterPolls: 10_000, polls: [change()] });
    const outcome = await pawos.run({ workTimeoutMs: 20_000 });
    expect(outcome).toEqual({ status: "timeout", change: change() });
    expect(pawos.elapsed()).toBe(20_000);
    expect(pawos.sent).toHaveLength(1);
  });

  it("checking again only asks about the same task", async () => {
    const pawos = scripted({ send: delivered({}), polls: [pushed()], recover: [delivered({ change: pushed({ state: "done", checksState: "success" }) })] });
    const outcome = await pawos.run({ resume: true });
    expect(outcome.status).toBe("complete");
    expect(pawos.sent).toHaveLength(0);
    expect(pawos.recovered).toEqual([REQUEST_ID]);
  });
});
