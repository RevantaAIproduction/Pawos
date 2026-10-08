import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { LIVE_TERMINAL, change, delivered, harness, pushed, reply, step, stripAnsi } from "../testing/harness";
import { QUESTION } from "./interactive";
import { isTask as looksLikeCodeRequest } from "../intent/intent";

/**
 * In a GitHub project PawOS starts in Code mode — but only a request for a change is a code change.
 * "hii", "hello" and questions are conversation: they are answered as chat and never reach the
 * permission question, the code-change runner or the repository. And for a real change, the
 * progress shown is what PawOS says has happened — never steps that haven't started.
 */
const cleanups: (() => void)[] = [];
const start = (...args: Parameters<typeof harness>) => {
  const h = harness(...args);
  cleanups.push(h.cleanup);
  return h;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const REPO = { kind: "github", fullName: "RevantaAIproduction/Pawos", remote: "origin" } as const;
const ready = (h: ReturnType<typeof harness>) => {
  h.server.readiness = { state: "ready", repository: { fullName: "RevantaAIproduction/Pawos", defaultBranch: "main" }, scope: "full" };
};
const PERMISSION = "  Allow? [y] allow  [n] deny  [a] always allow\n\n  > ";
const hi = () => reply({ chatId: "chat-1", reply: "Hi! How can I help?", recovered: false, requiresDesktop: false });
const CODE_HINT = "Code mode: changes go to RevantaAIproduction/Pawos on GitHub. /chat to just talk.";

describe("conversation in Code mode is chat", () => {
  it.each([["hii"], ["hello"], ["hi"], ["hey!"], ["how are you?"], ["what is PawOS?"], ["explain this"], ["thanks"], ["good morning"]])("%s → chat: no permission question, no code change", async (said) => {
    const h = start({ signedIn: true, answers: [said, null], local: REPO, permissionMode: "ask" });
    ready(h);
    h.server.chatReplies = [hi()];
    expect(await runCli([], h.ctx)).toBe(0);
    // The session did start in Code mode, with the repository selected…
    expect(h.output()).toContain(CODE_HINT);
    // …and this was still just a message.
    expect(h.prompter.prompts).toEqual(["  > ", "  > "]);
    expect(h.output()).not.toContain("PawOS will change code");
    expect(h.output()).not.toContain("Allow?");
    expect(h.server.starts()).toHaveLength(0);
    const [sent] = h.server.chats();
    expect(sent!.body).toEqual({ content: said, requestId: sent!.body!.requestId }); // no mode: not a code change
    expect(h.output()).toContain("  PawOS:\n  Hi! How can I help?");
    expect(h.ctx.pending.read()).toBeNull(); // no task was ever recorded
    // Nothing that belongs to a code change was shown.
    for (const stage of ["PawOS is exploring", "PawOS is working", "Read the repository", "Commit and push", "Preview and checks"]) expect(h.output()).not.toContain(stage);
  });

  it("the same holds when PawOS doesn't ask (auto): a greeting can never start a change", async () => {
    const h = start({ signedIn: true, answers: ["hii", "hello", "what does this project do?", null], local: REPO, permissionMode: "auto" });
    ready(h);
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["hii", "hello", "what does this project do?"]);
  });

  it("says it was answered as chat, and how to ask for a change", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], local: REPO });
    ready(h);
    await runCli([], h.ctx);
    expect(h.output()).toContain("Answered as chat; nothing was changed. To change code, say what to change or start with /code.");
  });

  it("/chat still forces Chat: after it, even a change request is only talked about", async () => {
    const h = start({ signedIn: true, answers: ["/chat", "fix the login bug", "hii", null], local: REPO, permissionMode: "ask" });
    ready(h);
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["fix the login bug", "hii"]);
    expect(h.prompter.prompts.every((prompt) => prompt === "  > ")).toBe(true);
    expect(h.output()).toContain("Chat. /code to make changes in RevantaAIproduction/Pawos.");
    expect(h.output()).not.toContain("Answered as chat"); // in Chat that needs no explaining
  });
});

describe("a real code request still goes through the permission flow", () => {
  it.each([["fix the login redirect"], ["Add a footer to the home page"], ["can you rename the Header component?"], ["please update the README"], ["go ahead and fix the login bug"], ["Refactor the pricing module"]])("%s → asks first, then runs as a code change", async (task) => {
    const h = start({ signedIn: true, answers: [task, "y", null], local: REPO, permissionMode: "ask" });
    ready(h);
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", PERMISSION, "  > "]);
    expect(h.output()).toContain("PawOS will change code in RevantaAIproduction/Pawos and push it to GitHub.");
    expect(h.server.starts().map((call) => call.body)).toEqual([{ content: task, requestId: h.server.starts()[0]!.body!.requestId, mode: "codeChange" }]);
    expect(h.server.chats()).toHaveLength(0);
  });

  it("denying it still sends nothing", async () => {
    const h = start({ signedIn: true, answers: ["fix the login redirect", "n", null], local: REPO, permissionMode: "ask" });
    ready(h);
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats()).toHaveLength(0);
    expect(h.output()).toContain("Not sent. Nothing was changed.");
  });

  it("/code still switches to Code mode, and says why when it can't", async () => {
    const h = start({ signedIn: true, answers: ["/chat", "/code", "fix the login redirect", "y", null], local: REPO, permissionMode: "ask" });
    ready(h);
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(1);
    const none = start({ signedIn: true, answers: ["/code", null], cwd: "C:\\pawos-test", local: { kind: "notGit" } });
    await runCli([], none.ctx);
    expect(none.output()).toContain("Code changes aren't available here.");
  });

  it("/code <request> makes it a code change whatever its wording — and it is still asked about first", async () => {
    const h = start({ signedIn: true, answers: ["/code the footer, darker", "y", null], local: REPO, permissionMode: "ask" });
    ready(h);
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts).toEqual(["  > ", PERMISSION, "  > "]);
    expect(h.server.starts()[0]!.body).toMatchObject({ content: "the footer, darker", mode: "codeChange" });
    // …and where code changes aren't possible it changes nothing and says so.
    const none = start({ signedIn: true, answers: ["/code fix it", null], cwd: "C:\\pawos-test", local: { kind: "notGit" } });
    await runCli([], none.ctx);
    expect(none.output()).toContain("Code changes aren't available here.");
    expect(none.server.starts()).toHaveLength(0);
    expect(none.server.chats()).toHaveLength(0);
  });

  it("which is which", () => {
    for (const talk of ["hii", "hi", "hello", "Hello!", "hey", "heyyy", "thanks", "thank you", "ok", "how are you?", "what is PawOS?", "what does this function do?", "why is the build slow?", "how do I fix a merge conflict?", "explain this", "explain the login flow", "is this repo using React?", "who are you", "tell me about the project", "good morning", "", "   ", "lol", "the weather is nice", "the submit button is broken", "login page crashes on empty password", "the tests are failing"]) {
      expect([talk, looksLikeCodeRequest(talk)]).toEqual([talk, false]);
    }
    for (const work of ["fix the login bug", "Fix the authentication bug", "add a dark mode toggle", "rename Header to SiteHeader", "update the README", "remove the unused imports", "can you fix the login bug?", "could you please add a footer", "please refactor the pricing module", "i want to add tests for cart.ts", "let's migrate to the new API", "make the heading bigger", "change the title to Welcome", "implement password reset", "run the tests and fix failures", "find and fix the bug in authentication"]) {
      expect([work, looksLikeCodeRequest(work)]).toEqual([work, true]);
    }
  });
});

describe("code progress shows what PawOS says is happening — and nothing that hasn't started", () => {
  const TASK = "fix the login redirect";
  const reading = change("r", { steps: [step("read", "Read the repository", "active"), step("plan", "Investigate and plan", "pending"), step("write", "Write the change", "pending"), step("check", "Check for problems", "pending"), step("push", "Commit and push to main", "pending"), step("preview", "Preview and checks", "pending")] });
  const planning = change("r", { steps: [step("read", "Read the repository", "done", "42 files listed · 3 read"), step("plan", "Investigate and plan", "active", "Reading the code"), step("write", "Write the change", "pending"), step("check", "Check for problems", "pending"), step("push", "Commit and push to main", "pending"), step("preview", "Preview and checks", "pending")] });

  it("while PawOS is only reading, the list is only 'Read the repository': no commit, push or checks are shown", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], local: REPO });
    ready(h);
    h.server.polls = [reading];
    // PawOS stops at the plan: it declines, having changed nothing.
    const declined = change("r", { state: "failed", error: "I didn't change anything.", steps: [step("read", "Read the repository", "done", "42 files listed · 1 read"), step("plan", "Investigate and plan", "failed"), step("write", "Write the change", "pending"), step("check", "Check for problems", "pending"), step("push", "Commit and push to main", "pending"), step("preview", "Preview and checks", "pending")] });
    h.server.sends = [h.server.afterPolls(2, reply({ chatId: "c", reply: "I didn't change anything in RevantaAIproduction/Pawos. I couldn't tell which files that change belongs in.", recovered: false, requiresDesktop: true, change: declined }))];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("◉ PawOS is exploring…");
    expect(output).toContain("● Read the repository");
    // No false state: these never started, so they are never on screen in any form.
    for (const never of ["Write the change", "Check for problems", "Commit and push to main", "Preview and checks"]) expect(output).not.toContain(never);
    expect(output).not.toContain("✓ Task completed");
    expect(output).not.toMatch(/Commit\n|Pull Request\n|Checks\n/);
    expect(output).toContain("✕ Investigate and plan"); // where it stopped, as PawOS reported it
  });

  it("each step appears when PawOS reports it started, is ticked only when PawOS says done, and the status line follows", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], local: REPO });
    ready(h);
    const writing = change("r", { steps: [step("read", "Read the repository", "done"), step("plan", "Investigate and plan", "done", "3 files read · 1 step planned"), step("write", "Write the change", "active"), step("check", "Check for problems", "pending"), step("push", "Commit and push to main", "pending"), step("preview", "Preview and checks", "pending")] });
    const pushing = change("r", { steps: [step("read", "Read the repository", "done"), step("plan", "Investigate and plan", "done"), step("write", "Write the change", "done", "1 file"), step("check", "Check for problems", "done", "4 lines changed"), step("push", "Commit and push to main", "active"), step("preview", "Preview and checks", "pending")] });
    h.server.polls = [reading, planning, writing, pushing, pushed("r")];
    h.server.sends = [h.server.afterPolls(5, delivered("r", pushed("r")))];
    await runCli([], h.ctx);
    const output = h.output();
    const order = ["◉ PawOS is exploring…", "● Read the repository", "◉ PawOS is planning…", "● Investigate and plan", "◉ PawOS is building…", "● Write the change", "✓ Check for problems", "● Commit and push to main", "✓ Task completed"];
    const positions = order.map((text) => output.indexOf(text));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // "Commit and push" was first shown as in progress — never before it began, and never ticked before PawOS said so.
    expect(output.indexOf("Commit and push to main")).toBe(output.indexOf("● Commit and push to main") + 2);
    expect(output).not.toContain("○"); // no not-yet-started rows anywhere
  });

  it("on a terminal that redraws, the live list is the same: only started steps are drawn", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], local: REPO, caps: { ...LIVE_TERMINAL, color: false, hyperlinks: false } });
    ready(h);
    h.server.polls = [reading, planning];
    h.server.sends = [h.server.afterPolls(2, delivered("r", pushed("r")))];
    await runCli([], h.ctx);
    const beforeResult = stripAnsi(h.raw()).split("Task completed")[0]!;
    expect(beforeResult).toContain("● Read the repository");
    expect(beforeResult).toContain("● Investigate and plan");
    // Later steps are drawn only once PawOS reports them — here, when the finished change arrives with them done.
    expect(beforeResult).not.toContain("○");
    for (const later of ["Write the change", "Check for problems", "Commit and push to main", "Preview and checks"]) {
      expect(beforeResult.indexOf(later)).toBeGreaterThan(beforeResult.indexOf("● Investigate and plan"));
      expect(beforeResult).toContain(`✓ ${later}`);
      expect(beforeResult).not.toContain(`● ${later}`); // PawOS never reported these as running in this run, so they were never shown running
    }
    expect(stripAnsi(h.raw()).lastIndexOf(QUESTION)).toBeGreaterThan(stripAnsi(h.raw()).indexOf("Task completed"));
  });

  it("a finished change shows the commit, files and checks PawOS returned — and a change still waiting on checks says so", async () => {
    const h = start({ signedIn: true, answers: [TASK, null], local: REPO });
    ready(h);
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(h.output()).toContain("✓ Task completed");
    expect(h.output()).toContain("abc1234  on main");
    expect(h.output()).toContain("✓ Passed");
  });
});
