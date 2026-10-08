import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { INTERRUPT, delivered, harness, pushed, reply } from "../testing/harness";
import { QUESTION } from "./interactive";
import { MAX_ATTACHMENT_BYTES, askPermission, parseMode, readAttachment } from "./workspace";

/**
 * Asking before a code change, opening earlier work, and attaching a file. Each does only what
 * PawOS's service supports, and none of them changes what the account is allowed to do.
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

const TASK = "Fix the login redirect";
const HOME = "C:\\pawos-test";
const NOT_GIT = { kind: "notGit" } as const;
const PERMISSION = "  Allow? [y] allow  [n] deny  [a] always allow\n\n  > ";
const done = () => delivered("r", pushed("r"));
const hello = (text = "Here is a plan.") => reply({ chatId: "chat-1", reply: text, recovered: false, requiresDesktop: false });
const NOW = new Date(2026, 9, 8, 9, 0, 0);
const before = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const CHAT_A = "11111111-1111-4111-8111-111111111111";
const CHAT_B = "22222222-2222-4222-8222-222222222222";
const history = (h: ReturnType<typeof harness>) => {
  h.server.previousChats = [
    { id: CHAT_A, title: "Fix the discount calculation", updatedAt: before(125), surface: "web" },
    { id: CHAT_B, title: "Plan the billing migration", updatedAt: before(60 * 24 * 3), surface: "desktop" },
  ];
  h.server.chatMessages.set(CHAT_A, [
    { id: "m1", role: "user", content: "The cart total is wrong when a discount is applied", createdAt: before(130) },
    { id: "m2", role: "assistant", content: "The discount was applied as a fraction.\n\nI changed src/lib/pricing.ts.", createdAt: before(125) },
  ]);
};

describe("permission: PawOS asks before it changes code", () => {
  it("in ask mode a code change is not sent until the user allows it", async () => {
    const h = start({ signedIn: true, answers: [TASK, "y", null], permissionMode: "ask" });
    h.server.sends = [done()];
    h.server.polls = [pushed("r")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", PERMISSION, "  > "]);
    expect(h.output()).toContain("PawOS will change code in acme/site and push it to GitHub.");
    expect(h.server.starts().map((call) => call.body?.content)).toEqual([TASK]); // the task, not the "y"
    expect(h.output()).toContain("✓ Task completed");
  });

  it.each([["n"], ["no"], ["deny"], [""], ["   "]])("deny (%j): nothing is sent and nothing is changed", async (answer) => {
    const h = start({ signedIn: true, answers: [TASK, answer, null], permissionMode: "ask" });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("Not sent. Nothing was changed.");
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats()).toHaveLength(0);
    expect(h.ctx.pending.read()).toBeNull(); // no task was recorded as started
    expect(h.output().lastIndexOf(QUESTION)).toBeGreaterThan(h.output().indexOf("Not sent."));
  });

  it("Ctrl+C or the end of input at the question is a no", async () => {
    for (const answers of [[TASK, INTERRUPT, "n", null], [TASK]] as const) {
      const h = start({ signedIn: true, answers: [...answers], permissionMode: "ask" });
      await runCli([], h.ctx);
      expect(h.server.starts()).toHaveLength(0);
    }
  });

  it("always allow: this change is sent, and PawOS doesn't ask again in the session", async () => {
    const h = start({ signedIn: true, answers: [TASK, "a", "Add a footer", null], permissionMode: "ask" });
    h.server.sends = [done(), done()];
    h.server.polls = [pushed("r")];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts.filter((prompt) => prompt === PERMISSION)).toHaveLength(1);
    expect(h.output()).toContain("PawOS won't ask again in this session. /mode ask turns it back on.");
    expect(h.server.starts().map((call) => call.body?.content)).toEqual([TASK, "Add a footer"]);
  });

  it("anything else is asked again, and is never sent to PawOS as a task or a message", async () => {
    const h = start({ signedIn: true, answers: [TASK, "sure why not", "y", null], permissionMode: "ask" });
    h.server.sends = [done()];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(h.output()).toContain("Please answer y, n or a.");
    expect(h.server.starts().map((call) => call.body?.content)).toEqual([TASK]);
    expect(h.server.chats()).toHaveLength(0);
  });

  it("is asked for code changes only: chat, /status and the other commands never ask", async () => {
    const h = start({ signedIn: true, answers: ["hii", "/status", "/connections", "/help", null], cwd: HOME, local: NOT_GIT, permissionMode: "ask" });
    await runCli([], h.ctx);
    expect(h.prompter.prompts.every((prompt) => prompt === "  > ")).toBe(true);
    expect(h.server.chats()).toHaveLength(1);
  });

  it("the question by itself: only an explicit yes allows", async () => {
    const run = async (answers: (string | null)[]) => {
      const queue = [...answers];
      return askPermission({ interrupted: false, ask: async () => (queue.length > 0 ? queue.shift()! : null), close: () => undefined }, "acme/site", () => undefined);
    };
    expect(await run(["y"])).toBe("allow");
    expect(await run([" Allow "])).toBe("allow");
    expect(await run(["A"])).toBe("always");
    expect(await run(["always allow"])).toBe("always");
    expect(await run([""])).toBe("deny");
    expect(await run(["what", "n"])).toBe("deny");
    expect(await run([null])).toBe("deny");
  });
});

describe("/mode", () => {
  it("shows the current mode and the choices", async () => {
    const h = start({ signedIn: true, answers: ["/mode", null], permissionMode: "ask" });
    await runCli([], h.ctx);
    expect(h.output()).toContain("  Mode: ask  PawOS asks before every code change (allow, deny or always allow).");
    expect(h.output()).toContain("/mode ask · /mode auto · /mode plan");
  });

  it("auto: code changes are sent without asking; ask turns the question back on", async () => {
    const h = start({ signedIn: true, answers: ["/mode auto", TASK, "/mode manual", "Add a footer", "n", null], permissionMode: "ask" });
    h.server.sends = [done()];
    h.server.polls = [pushed("r")];
    await runCli([], h.ctx);
    expect(h.output()).toContain("  Mode: auto  PawOS makes code changes without asking first.");
    expect(h.server.starts().map((call) => call.body?.content)).toEqual([TASK]);
    expect(h.prompter.prompts.filter((prompt) => prompt === PERMISSION)).toHaveLength(1); // only after going back to ask
    expect(h.output()).toContain("Not sent. Nothing was changed.");
  });

  it("plan: the request is planned in chat and never sent as a code change", async () => {
    const h = start({ signedIn: true, answers: ["/mode plan", TASK, null], permissionMode: "ask" });
    h.server.chatReplies = [hello("1. Find the redirect.\n2. Fix the path.")];
    await runCli([], h.ctx);
    expect(h.output()).toContain("  Mode: plan  PawOS plans the change with you and changes nothing.");
    expect(h.output()).toContain("Plan mode: PawOS will plan this with you. Nothing will be changed.");
    expect(h.server.starts()).toHaveLength(0);
    const [sent] = h.server.chats();
    expect(sent!.body!.mode).toBeUndefined();
    expect(sent!.body!.content).toBe(`Plan this change without making it. Describe the steps and the files likely involved.\n\n${TASK}`);
    expect(h.output()).toContain("1. Find the redirect.");
    expect(h.prompter.prompts.every((prompt) => prompt === "  > ")).toBe(true);
  });

  it("names from other tools are understood and explained honestly: they are the same as auto here", async () => {
    for (const name of ["accept-edits", "accept edits", "bypass", "bypass permissions", "bypass-permissions"]) {
      const h = start({ signedIn: true, answers: [`/mode ${name}`, TASK, null], permissionMode: "ask" });
      h.server.sends = [done()];
      h.server.polls = [pushed("r")];
      await runCli([], h.ctx);
      expect(h.output()).toContain("  Mode: auto  PawOS makes code changes without asking first.");
      expect(h.output()).toContain("PawOS has no separate edit-by-edit approval, so that is the same as auto here.");
      expect(h.server.starts()).toHaveLength(1);
    }
    expect(parseMode("manual")).toEqual({ mode: "ask", alias: false });
    expect(parseMode("AUTO")).toEqual({ mode: "auto", alias: false });
    expect(parseMode("yolo")).toBeNull();
  });

  it("an unknown mode changes nothing", async () => {
    const h = start({ signedIn: true, answers: ["/mode turbo", TASK, "n", null], permissionMode: "ask" });
    await runCli([], h.ctx);
    expect(h.output()).toContain("PawOS has no mode called turbo.");
    expect(h.prompter.prompts.filter((prompt) => prompt === PERMISSION)).toHaveLength(1); // still asking
  });

  it("a mode never changes what PawOS allows: it is not sent to PawOS, and PawOS's refusal still stands", async () => {
    const h = start({ signedIn: true, answers: ["/mode bypass", TASK, null], permissionMode: "ask" });
    h.server.sends = [reply({ code: "capability_locked", message: "Code changes aren't included in your plan." }, 403)];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("Code changes aren't included in your plan.");
    for (const call of h.server.calls) expect(JSON.stringify(call.body ?? {})).not.toMatch(/bypass|permission|"auto"|\bask\b/i);
    expect(Object.keys(h.server.starts()[0]!.body!).sort()).toEqual(["content", "mode", "requestId"]);
    expect(h.server.starts()[0]!.body!.mode).toBe("codeChange");
  });

  it("the mode lasts for the session only: nothing is written to disk for it", async () => {
    const h = start({ signedIn: true, answers: ["/mode auto", null], permissionMode: "ask" });
    await runCli([], h.ctx);
    const written = fs.readdirSync(h.directory).map((name) => fs.readFileSync(path.join(h.directory, name), "utf8")).join("\n");
    expect(written).not.toMatch(/auto|mode|permission/i);
  });
});

describe("/resume: earlier work can be opened and carried on", () => {
  it("lists earlier work, numbered, newest first", async () => {
    const h = start({ signedIn: true, answers: ["/resume", null], cwd: HOME, local: NOT_GIT, now: NOW });
    history(h);
    await runCli([], h.ctx);
    const output = h.output();
    expect(output).toContain(["  Earlier work", "", "   1  Fix the discount calculation  2h ago", "   2  Plan the billing migration  3d ago (Desktop)", "", "  /resume <number> to open one."].join("\n"));
  });

  it("opens one: shows how it ended, and the next message continues that conversation", async () => {
    const h = start({ signedIn: true, answers: ["/resume", "/resume 1", "and round to two decimals", null], cwd: HOME, local: NOT_GIT, now: NOW });
    history(h);
    h.server.chatReplies = [hello("Done in the plan.")];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("  Opened: Fix the discount calculation");
    expect(output).toContain("  You:\n  The cart total is wrong when a discount is applied");
    expect(output).toContain("  PawOS:\n  The discount was applied as a fraction.\n\n  I changed src/lib/pricing.ts.");
    expect(output).toContain("Your next message continues this conversation.");
    // It was read from PawOS, by its id, as the signed-in account…
    const opened = h.server.calls.find((call) => call.path === "/api/web-chat/chats" && call.query);
    expect(opened).toMatchObject({ method: "GET", query: `?chat=${CHAT_A}` });
    expect(opened!.authorization).toMatch(/^Bearer /);
    // …and the next message went to that same conversation.
    expect(h.server.chats()[0]!.body).toMatchObject({ content: "and round to two decimals", chatId: CHAT_A });
  });

  it("/resume <number> works straight away, without listing first", async () => {
    const h = start({ signedIn: true, answers: ["/resume 2", null], cwd: HOME, local: NOT_GIT, now: NOW });
    history(h);
    h.server.chatMessages.set(CHAT_B, [{ role: "user", content: "How should we migrate billing?" }]);
    await runCli([], h.ctx);
    expect(h.output()).toContain("  Opened: Plan the billing migration");
  });

  it("in a GitHub project, opening earlier work switches to Chat — the next message is not a code change", async () => {
    const h = start({ signedIn: true, answers: ["/resume 1", "what did we change?", null], now: NOW });
    history(h);
    await runCli([], h.ctx);
    expect(h.server.starts()).toHaveLength(0);
    expect(h.server.chats()[0]!.body).toMatchObject({ chatId: CHAT_A });
    expect(h.output()).toContain("Chat. /code to make changes in acme/site.");
  });

  it("a number that isn't on the list, or a conversation PawOS no longer has, opens nothing", async () => {
    const h = start({ signedIn: true, answers: ["/resume 9", "/resume abc", "/resume 2", "hello", null], cwd: HOME, local: NOT_GIT, now: NOW });
    history(h); // CHAT_B has no messages on the server: PawOS answers 404
    await runCli([], h.ctx);
    expect(h.output()).toContain("Choose a number from 1 to 2.");
    expect(h.output()).toContain("That chat doesn't exist.");
    expect(h.output()).not.toContain("Opened:");
    expect(h.server.chats()[0]!.body!.chatId).toBeUndefined(); // the next message started a new conversation
  });

  it("with no earlier work it says so", async () => {
    const h = start({ signedIn: true, answers: ["/resume", "/resume 1", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.output()).toContain("There is no earlier PawOS work to open yet.");
    expect(h.output()).not.toContain("Opened:");
  });

  it("what is shown is cleaned and cut short: a long conversation shows its last messages only", async () => {
    const esc = String.fromCharCode(27);
    const h = start({ signedIn: true, answers: ["/resume 1", null], cwd: HOME, local: NOT_GIT, now: NOW });
    history(h);
    h.server.chatMessages.set(CHAT_A, [...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `message ${i}` })), { role: "assistant", content: `last${esc}[2J one` }, { role: "system", content: "internal" }, { role: "user" }]);
    await runCli([], h.ctx);
    expect(h.raw()).not.toContain(esc);
    expect(h.output()).toContain("… 15 earlier messages");
    expect(h.output()).not.toContain("message 3\n");
    expect(h.output()).toContain("last[2J one");
    expect(h.output()).not.toContain("internal");
  });
});

describe("/attach: a text file with the next message", () => {
  const withFile = (name: string, content: string | Buffer) => {
    const h = start({ signedIn: true, answers: [], cwd: HOME, local: NOT_GIT });
    const file = path.join(h.directory, name);
    fs.writeFileSync(file, content);
    return { h, file };
  };

  it("sends the file with the next chat message, once", async () => {
    const { h, file } = withFile("notes.txt", "Remember the edge case.\n");
    const again = start({ signedIn: true, answers: [`/attach ${file}`, "summarise this", "and again", null], cwd: HOME, local: NOT_GIT });
    again.server.chatReplies = [hello("Summary."), hello("Again.")];
    expect(await runCli([], again.ctx)).toBe(0);
    expect(again.output()).toContain("✓ Attached notes.txt  1 KB");
    expect(again.output()).toContain("It goes with your next chat message. /attach none removes it.");
    const [first, second] = again.server.chats();
    expect(first!.body).toMatchObject({ content: "summarise this", attachment: { name: "notes.txt", content: "Remember the edge case.\n" } });
    expect(second!.body!.attachment).toBeUndefined(); // not sent a second time
    expect(again.output()).not.toContain("Remember the edge case."); // its contents are never printed
    h.cleanup();
  });

  it("/attach none removes it before it is sent", async () => {
    const { file } = withFile("notes.txt", "text\n");
    const h = start({ signedIn: true, answers: [`/attach "${file}"`, "/attach none", "hello", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.output()).toContain("Nothing is attached.");
    expect(h.server.chats()[0]!.body!.attachment).toBeUndefined();
  });

  it("only one text file within PawOS's limit: a folder, a missing file, a binary, an empty or an over-large file is refused here", () => {
    const { h, file } = withFile("ok.md", "# Notes\n");
    const dir = h.directory;
    fs.writeFileSync(path.join(dir, "big.txt"), "x".repeat(MAX_ATTACHMENT_BYTES + 1));
    fs.writeFileSync(path.join(dir, "empty.txt"), "   \n");
    fs.writeFileSync(path.join(dir, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0xff, 0xfe]));
    expect(readAttachment(dir, "ok.md")).toMatchObject({ ok: true, attachment: { name: "ok.md", content: "# Notes\n" } });
    expect(readAttachment("C:\\elsewhere", file)).toMatchObject({ ok: true }); // an absolute path works from anywhere
    expect(readAttachment(dir, "")).toEqual({ ok: false, problem: "Which file? For example: /attach notes.txt" });
    expect(readAttachment(dir, "missing.txt")).toEqual({ ok: false, problem: "That file doesn't exist." });
    expect(readAttachment(dir, ".")).toEqual({ ok: false, problem: "That is a folder. PawOS can take one text file with a message, not a folder." });
    expect(readAttachment(dir, "big.txt")).toEqual({ ok: false, problem: "That file is too large. PawOS takes a text file of up to 60 KB." });
    expect(readAttachment(dir, "empty.txt")).toEqual({ ok: false, problem: "That file is empty." });
    expect(readAttachment(dir, "image.png")).toEqual({ ok: false, problem: "Only text and code files can be attached." });
  });

  it("a refused file attaches nothing, and the next message goes without it", async () => {
    const h = start({ signedIn: true, answers: ["/attach nope.txt", "hello", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.output()).toContain("That file doesn't exist.");
    expect(h.server.chats()[0]!.body!.attachment).toBeUndefined();
  });

  it("PawOS decides whether the plan includes attachments: its refusal is shown, and the file is not kept for a retry", async () => {
    const { file } = withFile("notes.txt", "text\n");
    const h = start({ signedIn: true, answers: [`/attach ${file}`, "summarise this", "hello", null], cwd: HOME, local: NOT_GIT });
    h.server.plan = { tier: "go", label: "Paw Go" };
    h.server.chatReplies = [reply({ code: "capability_locked", message: "File attachments aren't included in your plan." }, 403)];
    await runCli([], h.ctx);
    expect(h.output()).toContain("File attachments aren't included in your plan.");
    expect(h.output()).toContain("Plan: Paw Go");
    expect(h.server.chats()[1]!.body!.attachment).toBeUndefined();
  });
});

describe("/help", () => {
  it("lists the new commands", async () => {
    const h = start({ signedIn: true, answers: ["/help", null], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    for (const command of ["/mode [name]", "/resume [number]", "/attach <file>"]) expect(h.output()).toContain(command);
  });
});
