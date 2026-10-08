import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { REQUEST_ID_PATTERN, newRequestId } from "../shared";
import { PENDING_FILE_NAME } from "../state/pendingTask";
import { HANDOFF, change, completionUrl, delivered, harness, pushed, reply, step } from "../testing/harness";

/** Running a task from `pawos`: sent once, followed to its result, and never sent twice. */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const TASK = "Fix the authentication bug";
const sentId = (h: ReturnType<typeof harness>) => String(h.server.starts()[0]!.body?.requestId);
const pendingFile = (h: ReturnType<typeof harness>) => path.join(h.directory, PENDING_FILE_NAME);
const processing = () => reply({ code: "processing", message: "Your message is still being answered." }, 202);

describe("requestId creation", () => {
  it("every task gets its own id, in the form PawOS accepts", async () => {
    const h = start({ signedIn: true, answers: [TASK, "Another change", null] });
    h.server.sends = [delivered("a", pushed("a")), delivered("b", pushed("b"))];
    h.server.polls = [pushed("x")];
    await runCli([], h.ctx);
    const ids = h.server.starts().map((call) => String(call.body?.requestId));
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) expect(id).toMatch(REQUEST_ID_PATTERN);
    expect(new Set(Array.from({ length: 100 }, () => newRequestId())).size).toBe(100);
  });
});

describe("task submission", () => {
  it("sends exactly { content, requestId, mode: codeChange } to the existing endpoint, as the signed-in account", async () => {
    const h = start({ signedIn: true, answers: [`  ${TASK}  `, null] });
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    expect(await runCli([], h.ctx)).toBe(0);
    const [send] = h.server.starts();
    expect(h.server.starts()).toHaveLength(1);
    expect(send).toMatchObject({ method: "POST", path: "/api/web-chat/messages" });
    expect(send!.body).toEqual({ content: TASK, requestId: sentId(h), mode: "codeChange" });
    expect(send!.authorization).toMatch(/^Bearer access-/);
  });

  it("nothing is sent for an empty line, an over-long task, or exit", async () => {
    const h = start({ signedIn: true, answers: ["", "   ", "x".repeat(4001), "exit", TASK] });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats()).toHaveLength(0);
    expect(h.output()).toContain("Keep it under 4,000 characters.");
  });
});

describe("polling", () => {
  it("polls GET /api/web/changes/{requestId} every 2.5 seconds while PawOS works, and shows each step as PawOS reports it", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    const writing = change("r", { steps: [step("read", "Read the repository", "done"), step("plan", "Choose the files", "done"), step("write", "Write the change", "active")] });
    h.server.polls = [null, change("r"), writing, pushed("r")];
    h.server.sends = [h.server.afterPolls(3, delivered("r", pushed("r")))];
    await runCli([], h.ctx);

    const polls = h.server.calls.filter((call) => call.path.startsWith("/api/web/changes/"));
    expect(polls.length).toBeGreaterThanOrEqual(3);
    expect(new Set(polls.map((call) => call.path))).toEqual(new Set([`/api/web/changes/${sentId(h)}`]));
    expect(h.elapsed() % 2500).toBe(0);
    expect(h.elapsed()).toBeGreaterThanOrEqual(3 * 2500);

    const output = h.output();
    expect(output).toContain("PawOS is working…");
    // The server's own labels, in its order, with its statuses.
    expect(output).toContain("✓ Read the repository  42 files");
    expect(output).toContain("● Choose the files");
    expect(output).toContain("○ Write the change");
    expect(output).toContain("● Write the change");
    expect(output.indexOf("● Choose the files")).toBeLessThan(output.indexOf("● Write the change"));
  });
});

describe("completion", () => {
  it("shows the summary, files, checks, commit and pull request PawOS returned", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    const result = pushed("r", { pullRequestUrl: "https://github.com/acme/site/pull/12", branch: "pawos-web/abc" });
    h.server.sends = [delivered("r", result)];
    h.server.polls = [result];
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain("✓ Task completed");
    expect(output).toMatch(/Summary\n\s+Fixed authentication token handling\./);
    expect(output).toMatch(/Files changed\n\s+src\/auth\/middleware\.ts\n\s+src\/auth\/middleware\.test\.ts/);
    expect(output).toMatch(/Checks\n\s+✓ Passed/);
    expect(output).toMatch(/Commit\n\s+abc1234 {2}on pawos-web\/abc\n\s+https:\/\/github\.com\/acme\/site\/commit\/abc1234def5678/);
    expect(output).toMatch(/Pull Request\n\s+https:\/\/github\.com\/acme\/site\/pull\/12/);
    expect(output).toContain("PawOS works on your connected GitHub project.");
    expect(fs.existsSync(pendingFile(h))).toBe(false); // finished: nothing left to recover
  });

  it("goes back to the prompt for the next task", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(h.output().match(/What would you like to work on\?/g)).toHaveLength(2);
  });

  it("says so when PawOS found nothing to change", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [delivered("r", null, "The files in acme/site already do that — nothing needed to change, so I didn't push anything.")];
    await runCli([], h.ctx);
    expect(h.output()).toContain("No change was made");
    expect(h.output()).toContain("nothing needed to change, so I didn't push anything.");
  });
});

describe("failure", () => {
  it("shows PawOS's reason, the step that failed and the request id", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    const failed = change("r", { state: "failed", error: "I didn't push anything.", steps: [step("read", "Read the repository", "done"), step("plan", "Choose the files", "done"), step("check", "Check for problems", "failed")] });
    h.server.sends = [delivered("r", failed, "I didn't push anything to acme/site: the change still looked broken after a repair. Try rephrasing it, or continue in PawOS Desktop.")];
    h.server.polls = [failed];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("✕ PawOS could not complete the task");
    expect(output).toMatch(/Reason\n\s+I didn't push anything to acme\/site: the change still looked broken after a repair\./);
    expect(output).toContain("✕ Check for problems");
    expect(output).toMatch(new RegExp(`Request ID\\n\\s+${sentId(h)}`));
    expect(output).toContain("You can run PawOS again to continue investigating.");
  });

  it.each([
    [reply({ code: "usage_limit_reached", message: "Your plan's included usage is used up. Add usage or upgrade to keep going." }, 402), "Your plan's included usage is used up."],
    [reply({ code: "repository_not_selected", message: "Choose a repository for PawOS Web to make changes in." }, 409), "Choose a repository for PawOS Web to make changes in."],
    [reply({ code: "capability_locked", message: "Code changes isn't included in your plan." }, 403), "Code changes isn't included in your plan."],
    [reply({}, 429), "PawOS is receiving too many requests. Wait a moment and try again."],
    [reply({ code: "change_refused", message: "That's bigger than a small change." }, 422), "That's bigger than a small change."],
  ])("a refused task shows PawOS's own reason and is not retried", async (answer, message) => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [answer];
    await runCli([], h.ctx);
    expect(h.output()).toContain("PawOS could not complete the task");
    expect(h.output()).toContain(message);
    expect(h.server.starts()).toHaveLength(1);
    expect(h.server.recovers()).toHaveLength(0);
    expect(fs.existsSync(pendingFile(h))).toBe(false);
  });

  it("a session that ends mid-task is cleared, and PawOS returns to sign-in without sending the task again", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [
      () => {
        h.server.validAccess.clear();
        h.server.validRefresh.clear();
        return reply({ code: "not_authenticated", message: "Sign in to continue." }, 401);
      },
    ];
    expect(await runCli([], h.ctx)).toBe(1); // the user left at the sign-in prompt
    const output = h.output();
    expect(output).toContain("Your PawOS session has expired. Sign in again.");
    expect(output.indexOf("To sign in, open this URL in your browser:")).toBeGreaterThan(output.indexOf("PawOS could not complete the task"));
    expect(h.keyring!.value).toBeNull(); // the dead session is gone from the credential store
    expect(h.server.starts()).toHaveLength(1);
    // One refresh attempt for the refused token, and no loop.
    expect(h.server.calls.filter((call) => call.path === "/api/auth/device/refresh").length).toBeLessThanOrEqual(2);
  });

  it("after signing in again the same PawOS session carries on", async () => {
    const h = start({ signedIn: true, answers: [TASK, completionUrl(), null] });
    h.server.handoffs.set(HANDOFF, "valid");
    h.server.sends = [
      () => {
        h.server.validAccess.clear();
        h.server.validRefresh.clear();
        return reply({ code: "not_authenticated", message: "Sign in to continue." }, 401);
      },
    ];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("Signed in as alice@example.com");
    expect(output.match(/What would you like to work on\?/g)).toHaveLength(2); // back at the prompt
    expect(h.server.starts()).toHaveLength(1);
  });
});

describe("timeout", () => {
  it("stops waiting after the limit, keeps the request id, and does not send the task again", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [h.server.afterPolls(1_000_000, delivered("r", pushed("r")))];
    h.server.polls = [change("r")];
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain("PawOS is still working on this task");
    expect(output).toContain(sentId(h));
    expect(output).toContain("It was not sent again.");
    expect(h.elapsed()).toBe(6 * 60 * 1000);
    expect(h.server.starts()).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(pendingFile(h), "utf8"))).toMatchObject({ requestId: sentId(h), content: TASK, repository: "acme/site" });
  });
});

describe("dropped connection", () => {
  it("asks PawOS about the same request id instead of sending the task again", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [new Error("socket hang up")];
    h.server.polls = [change("r"), pushed("r")];
    h.server.recoveries = [processing(), delivered("r", pushed("r"))];
    await runCli([], h.ctx);
    expect(h.output()).toContain("✓ Task completed");
    expect(h.server.starts()).toHaveLength(1);
    expect(h.server.recovers().length).toBeGreaterThanOrEqual(2);
    for (const call of h.server.recovers()) expect(call.body).toEqual({ requestId: sentId(h), recoverOnly: true });
    expect(h.output()).not.toContain("socket hang up");
  });

  it("a gateway error page is treated the same way", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [new Response("<html>504 Gateway Time-out</html>", { status: 504 })];
    h.server.polls = [pushed("r")];
    h.server.recoveries = [delivered("r", pushed("r"))];
    await runCli([], h.ctx);
    expect(h.output()).toContain("✓ Task completed");
    expect(h.server.starts()).toHaveLength(1);
  });

  it("says nothing was changed when PawOS never received it", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [new Error("offline")];
    h.server.recoveries = [reply({ code: "not_found", message: "That message wasn't received." }, 404)];
    await runCli([], h.ctx);
    expect(h.output()).toContain("PawOS didn't receive the task, so nothing was changed. Run it again.");
    expect(h.server.starts()).toHaveLength(1);
  });

  it("if the connection never comes back, the request id is kept for the next run", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    h.server.sends = [new Error("offline")];
    h.server.recoveries = [new Error("offline")];
    await runCli([], h.ctx);
    expect(h.output()).toContain("PawOS could not complete the task");
    expect(h.output()).toContain("PawOS couldn't be reached. Check your connection and try again.");
    expect(h.server.starts()).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(pendingFile(h), "utf8")).requestId).toBe(sentId(h));
  });
});

describe("recovery without duplicate submission", () => {
  it("Ctrl+C stops watching — the task is not cancelled, its id is kept, and it is not sent again", async () => {
    const h = start({ signedIn: true, answers: [TASK, "y"] }); // Ctrl+C, then yes to leaving
    h.server.polls = [change("r")];
    h.server.sends = [
      () => {
        queueMicrotask(h.interrupt); // the user presses Ctrl+C while PawOS is working
        return h.server.afterPolls(1_000_000, delivered("r", pushed("r")))() as unknown as Response;
      },
    ];
    expect(await runCli([], h.ctx)).toBe(130);
    const output = h.output();
    expect(output).toContain("Stopped watching. The task was not cancelled: it continues on PawOS.");
    expect(output).toContain(sentId(h));
    expect(output).toContain("It will not be sent twice.");
    expect(h.server.starts()).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(pendingFile(h), "utf8")).requestId).toBe(sentId(h));
    expect(h.listening()).toBe(0); // the interrupt listener is gone
  });

  it("the next run finds the earlier task and asks PawOS for its result — with recoverOnly, never a new send", async () => {
    const h = start({ signedIn: true, answers: ["y", null] });
    const requestId = "3f0c1a52-7d0e-4c55-9d6e-1f2a3b4c5d6e";
    h.ctx.pending.write({ requestId, content: TASK, repository: "acme/site", startedAt: "2026-10-07T10:00:00.000Z" });
    h.server.recoveries = [delivered(requestId, pushed(requestId))];
    h.server.polls = [pushed(requestId)];
    expect(await runCli([], h.ctx)).toBe(0);

    const output = h.output();
    expect(output).toContain("An earlier task hasn't reported its result:");
    expect(output).toContain(TASK);
    expect(h.prompter.prompts[0]).toBe("  Check on it? [Y/n] ");
    expect(output).toContain("✓ Task completed");
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.recovers()[0]!.body).toEqual({ requestId, recoverOnly: true });
    expect(h.server.calls.some((call) => call.path === `/api/web/changes/${requestId}`)).toBe(true);
    expect(fs.existsSync(pendingFile(h))).toBe(false);
  });

  it("declining leaves the earlier task alone and forgets it", async () => {
    const h = start({ signedIn: true, answers: ["n", null] });
    const requestId = "3f0c1a52-7d0e-4c55-9d6e-1f2a3b4c5d6e";
    h.ctx.pending.write({ requestId, content: TASK, repository: "acme/site", startedAt: "" });
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.recovers()).toHaveLength(0);
    expect(h.output()).toContain(`Its request ID was ${requestId}.`);
    expect(fs.existsSync(pendingFile(h))).toBe(false);
  });

  it("the task is recorded before it is sent, so an interruption at any point can be picked up", async () => {
    const h = start({ signedIn: true, answers: [TASK, null] });
    let recordedAtSend: string | null = null;
    h.server.sends = [
      () => {
        recordedAtSend = JSON.parse(fs.readFileSync(pendingFile(h), "utf8")).requestId as string;
        return delivered("r", pushed("r"));
      },
    ];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(recordedAtSend).toBe(sentId(h));
  });

  it("a damaged or foreign pending file is ignored", async () => {
    const h = start({ signedIn: true, answers: [null] });
    fs.writeFileSync(pendingFile(h), JSON.stringify({ requestId: "../../etc/passwd", content: "x" }));
    await runCli([], h.ctx);
    expect(h.output()).not.toContain("An earlier task");
    expect(h.server.recovers()).toHaveLength(0);
  });
});
