import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { delivered, harness, pushed, reply } from "../testing/harness";
import { classifyIntent, isTask } from "./intent";

/**
 * Intent first: what is the user asking PawOS to DO? Conversation (a greeting, a question, a request
 * to explain or plan) is answered as chat and never reaches the permission question, the runner or
 * the repository. Only an instruction to change the project is a task — and then the existing
 * permission and entitlement flow applies exactly as before.
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
const inRepo = (answers: (string | null)[], permissionMode: "ask" | "auto" | "plan" = "ask") => {
  const h = start({ signedIn: true, answers, local: REPO, permissionMode });
  h.server.readiness = { state: "ready", repository: { fullName: "RevantaAIproduction/Pawos", defaultBranch: "main" }, scope: "full" };
  return h;
};
const PERMISSION = "  Allow? [y] allow  [n] deny  [a] always allow\n\n  > ";
const hi = () => reply({ chatId: "chat-1", reply: "Hi! How can I help?", recovered: false, requiresDesktop: false });
const TASK_UI = ["PawOS will change code", "Allow?", "PawOS is exploring", "PawOS is planning", "PawOS is building", "PawOS is verifying", "PawOS is working", "Read the repository", "Investigate and plan", "Choose the files", "Write the change", "Check for problems", "Commit and push", "Preview and checks", "Task completed"];

describe("classifyIntent: the whole request, not a word in it", () => {
  it("the same subject is a task or conversation depending on what is being asked", () => {
    // Every one of these mentions fixing the login bug. Only some ask PawOS to do it.
    expect(classifyIntent("Fix the login bug")).toEqual({ intent: "task", reason: "directive" });
    expect(classifyIntent("Go ahead and fix the login bug")).toEqual({ intent: "task", reason: "request" });
    expect(classifyIntent("Can you fix the login bug?")).toEqual({ intent: "task", reason: "request" });
    expect(classifyIntent("please fix the login bug")).toEqual({ intent: "task", reason: "request" });
    expect(classifyIntent("I want you to fix the login bug")).toEqual({ intent: "task", reason: "request" });
    expect(classifyIntent("ok so fix the login bug")).toEqual({ intent: "task", reason: "directive" });
    expect(classifyIntent("find and fix the login bug")).toEqual({ intent: "task", reason: "directive" });

    expect(classifyIntent("Explain how I could fix the login bug")).toEqual({ intent: "chat", reason: "explanation" });
    expect(classifyIntent("explain how to fix the login bug")).toEqual({ intent: "chat", reason: "explanation" });
    expect(classifyIntent("What files would you change to fix the login bug?")).toEqual({ intent: "chat", reason: "question" });
    expect(classifyIntent("How would you fix the login bug?")).toEqual({ intent: "chat", reason: "question" });
    expect(classifyIntent("Should I fix the login bug first?")).toEqual({ intent: "chat", reason: "question" });
    expect(classifyIntent("Can you explain how to fix the login bug?")).toEqual({ intent: "chat", reason: "explanation" });
    expect(classifyIntent("could you tell me what you'd change to fix the login bug")).toEqual({ intent: "chat", reason: "explanation" });
    expect(classifyIntent("Why does the login bug happen?")).toEqual({ intent: "chat", reason: "question" });
    expect(classifyIntent("Don't change anything, just tell me how to fix the login bug")).toEqual({ intent: "chat", reason: "no_change_wanted" });
    expect(classifyIntent("fix the login bug?")).toEqual({ intent: "chat", reason: "question" });
    expect(classifyIntent("the login bug is still there")).toEqual({ intent: "chat", reason: "statement" });
    expect(classifyIntent("find the login bug")).toEqual({ intent: "chat", reason: "investigation" });
  });

  it.each([
    ["hii"], ["hi"], ["hello"], ["Hello there!"], ["hey paw"], ["how are you?"], ["thanks"], ["thank you so much"], ["good morning"], ["ok"],
    ["what is PawOS?"], ["what can you do?"], ["explain this"], ["explain React"], ["how does this repository work?"], ["what does this function do?"],
    ["why is this error happening?"], ["is this project using TypeScript?"], ["which file handles authentication?"], ["where is the navbar defined?"],
    ["describe the architecture"], ["tell me about the billing module"], ["summarize the recent changes"], ["walk me through the login flow"],
    ["what would you change to add dark mode?"], ["how do I implement GitHub OAuth?"], ["what's the best way to refactor this component?"],
    ["can you recommend a way to update the database schema?"], ["suggest improvements to the navbar"], ["give me ideas for the landing page"],
    ["should we migrate to the new API?"], ["is it possible to add dark mode?"], ["help me understand how the cache works"],
    ["just explain what fix all TypeScript errors would involve"], ["without changing anything, how would you add tests?"],
    ["the build is failing"], ["there is a typo in the footer"], ["run the tests"], ["check the lint config"], ["look at the auth module"],
    ["fix it"], ["do that"], ["go ahead"], ["please"], [""], ["   "],
  ])("conversation: %j", (said) => {
    expect([said, classifyIntent(said).intent]).toEqual([said, "chat"]);
  });

  it.each([
    ["fix the login bug"], ["add dark mode"], ["implement GitHub OAuth"], ["change the navbar"], ["fix all TypeScript errors"], ["refactor this component"],
    ["create a new API endpoint"], ["update the database schema"], ["run the tests and fix failures"], ["find and fix the bug in authentication"],
    ["go ahead and fix the login bug"], ["Go ahead, add dark mode"], ["please rename Header to SiteHeader"], ["could you remove the unused imports"],
    ["can you add a footer to the home page?"], ["feel free to add a sitemap"], ["I want to add tests for cart.ts"], ["I'd like you to migrate the settings page"],
    ["we need to update the README"], ["let's make the heading bigger"], ["now change the title to Welcome"], ["ok, replace the logo with the new one"],
    ["Hey Paw, tidy up the pricing module"], ["check the failing test and fix it properly in cart.ts"], ["investigate the crash, then patch the null check"],
    ["write a migration for the orders table"], ["set up eslint for the web package"], ["FIX THE LOGIN BUG"], ["  fix   the login bug  "], ["\"add dark mode\""],
  ])("a real task: %j", (said) => {
    expect([said, classifyIntent(said).intent]).toEqual([said, "task"]);
  });

  it("does not turn on a keyword: a change word inside a question or an explanation changes nothing", () => {
    for (const word of ["fix", "add", "change", "update", "remove", "implement", "refactor", "create", "delete", "rename"]) {
      expect(isTask(`what would happen if we ${word} the session handling?`)).toBe(false);
      expect(isTask(`explain how to ${word} the session handling`)).toBe(false);
      expect(isTask(`why did someone ${word} the session handling?`)).toBe(false);
      expect(isTask(`is it safe to ${word} the session handling`)).toBe(false);
      expect(isTask(`${word} the session handling`)).toBe(true);
      expect(isTask(`go ahead and ${word} the session handling`)).toBe(true);
    }
    // …and a task needs no particular word either: these have none of the usual ones.
    expect(isTask("tidy up the pricing module")).toBe(true);
    expect(isTask("port the settings page to the new layout")).toBe(true);
  });

  it("when it can't tell, it is conversation", () => {
    for (const unclear of ["dark mode", "the navbar", "login", "asdf qwer", "TypeScript errors everywhere", "maybe later", "hmm"]) expect(classifyIntent(unclear).intent).toBe("chat");
  });

  it("is quick and has no side effects: text in, decision out", () => {
    const before = Date.now();
    for (let i = 0; i < 5000; i++) classifyIntent("can you please go ahead and fix the login bug in the authentication module?");
    expect(Date.now() - before).toBeLessThan(2000);
    expect(classifyIntent("x".repeat(4000)).intent).toBe("chat");
  });
});

describe("conversation in a repository: chat only", () => {
  it.each([["hii"], ["hello"], ["what is PawOS?"], ["how does this repository work?"], ["explain how to fix the login bug"], ["what files would you change to fix the login bug?"]])("%s → the normal response, and nothing else", async (said) => {
    const h = inRepo([said, null]);
    h.server.chatReplies = [hi()];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("  PawOS:\n  Hi! How can I help?");
    // CHAT never invokes the code-change permission flow…
    expect(h.prompter.prompts).toEqual(["  > ", "  > "]);
    // …nor the task UI…
    for (const text of TASK_UI) expect(h.output()).not.toContain(text);
    // …nor the code-change runner or anything about the repository's contents.
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.calls.filter((call) => call.path.startsWith("/api/web/changes/"))).toHaveLength(0);
    expect(h.server.calls.filter((call) => call.method !== "GET" && !call.path.startsWith("/api/auth/device/")).map((call) => call.path)).toEqual(["/api/web-chat/messages"]);
    expect(h.server.chats()[0]!.body).toEqual({ content: said, requestId: h.server.chats()[0]!.body!.requestId });
    expect(h.ctx.pending.read()).toBeNull();
  });

  it("classification comes first: with debug on, the decision is printed before anything else happens", async () => {
    const h = start({ signedIn: true, answers: ["what files would you change to fix the login bug?", "fix the login bug", "n", null], local: REPO, permissionMode: "ask", debug: true });
    h.server.readiness = { state: "ready", repository: { fullName: "RevantaAIproduction/Pawos", defaultBranch: "main" }, scope: "full" };
    await runCli([], h.ctx);
    const output = h.output();
    expect(output.indexOf("debug: intent=chat reason=question")).toBeLessThan(output.indexOf("PawOS is thinking"));
    expect(output.indexOf("debug: intent=task reason=directive")).toBeLessThan(output.indexOf("PawOS will change code"));
  });

  it("/chat still forces chat: even a real task is only talked about", async () => {
    const h = inRepo(["/chat", "fix the login bug", "add dark mode", null]);
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["fix the login bug", "add dark mode"]);
    for (const text of TASK_UI) expect(h.output()).not.toContain(text);
  });
});

describe("a real task: the existing flow, unchanged", () => {
  it.each([["fix the login bug"], ["add dark mode"], ["implement GitHub OAuth"], ["go ahead and fix the login bug"]])("%s → permission first, then the runner and its progress", async (task) => {
    const h = inRepo([task, "y", null]);
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", PERMISSION, "  > "]);
    const output = h.output();
    // The task UI appears only after the classification said "task" AND permission was given.
    expect(output.indexOf("PawOS will change code in RevantaAIproduction/Pawos and push it to GitHub.")).toBeLessThan(output.indexOf("PawOS is working"));
    expect(output).toContain("✓ Task completed");
    expect(h.server.starts().map((call) => call.body?.mode)).toEqual(["codeChange"]);
    expect(h.server.chats()).toHaveLength(0);
  });

  it("denied: no runner, no progress, nothing sent", async () => {
    const h = inRepo(["implement GitHub OAuth", "n", null]);
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    for (const text of ["PawOS is exploring", "PawOS is working", "Read the repository", "Task completed"]) expect(h.output()).not.toContain(text);
  });

  it("the server's own checks still decide: a plan without code changes is refused there, whatever the intent", async () => {
    const h = inRepo(["add dark mode", "y", null]);
    h.server.sends = [reply({ code: "capability_locked", message: "Code changes aren't included in your plan." }, 403)];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Code changes aren't included in your plan.");
    expect(h.output()).not.toContain("Task completed");
    // Nothing about the classification is sent to PawOS: it sees exactly the same request as before.
    expect(Object.keys(h.server.starts()[0]!.body!).sort()).toEqual(["content", "mode", "requestId"]);
  });

  it("usage limits and sign-in still apply to a task exactly as before", async () => {
    const limited = inRepo(["fix the login bug", "y", null]);
    limited.server.sends = [reply({ code: "usage_limit_reached", message: "Your plan's included usage is used up." }, 402)];
    await runCli([], limited.ctx);
    expect(limited.output()).toContain("Your plan's included usage is used up.");
    expect(limited.server.starts()).toHaveLength(1);
  });

  it("the explicit commands are intact: /code switches mode, /code <request> is a task even when it reads like conversation", async () => {
    const h = inRepo(["/code what about the footer", "y", null]);
    h.server.sends = [delivered("r", pushed("r"))];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(h.prompter.prompts).toEqual(["  > ", PERMISSION, "  > "]);
    expect(h.server.starts()[0]!.body).toMatchObject({ content: "what about the footer", mode: "codeChange" });
  });

  it("outside a repository there is no task pipeline at all: an instruction is still just a message", async () => {
    const h = start({ signedIn: true, answers: ["fix the login bug", null], cwd: "C:\\pawos-test", local: { kind: "notGit" }, permissionMode: "ask" });
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats()).toHaveLength(1);
    for (const text of TASK_UI) expect(h.output()).not.toContain(text);
  });
});
