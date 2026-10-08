import { PassThrough } from "stream";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli";
import { CHAT_TIMEOUT_MS, PawosApiError, PawosClient, sendChatMessage } from "../shared";
import { API, INTERRUPT, LIVE_TERMINAL, change, delivered, harness, pushed, reply, stripAnsi } from "../testing/harness";
import { confirmExit, createPrompter } from "../ui/prompts";
import { QUESTION, STILL_THINKING_AFTER_SECONDS } from "./interactive";

/**
 * Two things a session must never do: sit on "PawOS is thinking…" with no end, and vanish on one
 * Ctrl+C. A message always ends in a reply or a plain error and the prompt; Ctrl+C always asks.
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

const HOME = "C:\\pawos-test";
const NOT_GIT = { kind: "notGit" } as const;
const ESC = String.fromCharCode(27);
const EXIT_PROMPT = "  Exit PawOS? (y/N)\n\n  > ";
const hello = () => reply({ chatId: "chat-1", reply: "Hi! How can I help?", recovered: false, requiresDesktop: false });
const afterPrompt = (h: ReturnType<typeof harness>, text: string) => h.output().lastIndexOf(QUESTION) > h.output().indexOf(text);
const cursorIsBack = (raw: string) => raw.lastIndexOf(`${ESC}[?25h`) >= raw.lastIndexOf(`${ESC}[?25l`);

describe("a chat message always comes back", () => {
  it("successful chat response: the reply is shown under PawOS:, and the prompt returns", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [hello()];
    expect(await runCli([], h.ctx)).toBe(0);
    const output = h.output();
    expect(output).toContain("  ◉ PawOS is thinking…\n\n  PawOS:\n  Hi! How can I help?\n");
    expect(afterPrompt(h, "Hi! How can I help?")).toBe(true);
    // What was sent: the user's own session, and exactly the message — no mode, so it is a chat.
    const [sent] = h.server.chats();
    expect(sent!.authorization).toMatch(/^Bearer access-\d+\.jwt\.sig$/);
    expect(sent!.body).toEqual({ content: "hii", requestId: sent!.body!.requestId });
    expect(String(sent!.body!.requestId)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it("the answer is one JSON reply, read whole — PawOS does not stream it, and nothing is left waiting for more", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [hello()];
    await runCli([], h.ctx);
    expect(h.server.calls.filter((call) => call.path === "/api/web-chat/messages")).toHaveLength(1); // no polling after a delivered reply
    expect(h.timers.active).toBe(0);
  });

  it("HTTP error: the spinner stops, PawOS's own safe message is shown, and the prompt returns", async () => {
    for (const [answer, shown] of [
      [reply({ code: "model_unavailable", message: "Paw couldn't answer just now. Please try again." }, 502), "Paw couldn't answer just now. Please try again."],
      [reply({ code: "failed", message: "Something went wrong. Please try again." }, 500), "Something went wrong. Please try again."],
      [reply({ code: "invalid_message", message: "Write a message of up to 4,000 characters." }, 400), "Write a message of up to 4,000 characters."],
      [reply({ code: "forbidden", message: "Cross-origin request rejected." }, 403), "Cross-origin request rejected."],
    ] as const) {
      const h = start({ signedIn: true, answers: ["hii", "/help", null], cwd: HOME, local: NOT_GIT, caps: LIVE_TERMINAL });
      h.server.chatReplies = [answer];
      expect(await runCli([], h.ctx)).toBe(0);
      const seen = stripAnsi(h.raw());
      expect(seen).toContain(shown);
      expect(seen).not.toMatch(/Error:|at \w+ \(|\{"ok"|model_unavailable|undefined/);
      expect(seen.lastIndexOf(QUESTION)).toBeGreaterThan(seen.indexOf(shown));
      expect(seen).toContain("/connections"); // and the session carried on: /help was answered
      expect(h.timers.active).toBe(0); // spinner stopped
      expect(cursorIsBack(h.raw())).toBe(true);
    }
  });

  it("malformed response: a 200 the CLI can't read is said plainly — it is never shown as a reply and never sent again", async () => {
    for (const answer of [reply({ chatId: "c" }), reply({ reply: "Hi" }), reply({ chatId: 7, reply: ["Hi"] }), reply({})]) {
      const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT });
      h.server.chatReplies = [answer];
      expect(await runCli([], h.ctx)).toBe(0);
      expect(h.output()).toContain("PawOS answered, but not in a form this version can read. Check PawOS Web for the reply.");
      expect(h.output()).not.toContain("PawOS:");
      expect(h.server.chats()).toHaveLength(1);
      expect(h.server.recovers()).toHaveLength(0);
      expect(afterPrompt(h, "PawOS answered, but not")).toBe(true);
    }
  });

  it("an answer that isn't JSON at all (a gateway page) is followed by a lookup, and ends in a plain message", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [new Response("<html>504 Gateway Time-out</html>", { status: 504 })];
    h.server.recoveries = [reply({ code: "not_found", message: "That message wasn't received." }, 404)];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).toContain("PawOS didn't receive the message. Send it again.");
    expect(h.output()).not.toContain("<html>");
    expect(h.server.chats()).toHaveLength(1);
    expect(afterPrompt(h, "PawOS didn't receive the message")).toBe(true);
  });

  it("network timeout: a chat request is given up on after its own timeout — not the five and a half minutes a code change gets", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const timeouts: number[] = [];
    const realTimeout = AbortSignal.timeout;
    AbortSignal.timeout = (ms: number) => {
      timeouts.push(ms);
      return realTimeout.call(AbortSignal, ms);
    };
    try {
      const client = new PawosClient(() => API, async () => "token", async () => undefined, async (_input, init) => {
        signals.push(init?.signal);
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      });
      await expect(client.sendChat("hii", "request-0001")).rejects.toMatchObject({ kind: "network", message: "PawOS couldn't be reached. Check your connection and try again." });
      await expect(client.sendCodeChange("fix it", "request-0002")).rejects.toMatchObject({ kind: "network" });
    } finally {
      AbortSignal.timeout = realTimeout;
    }
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true); // every request can be abandoned
    expect(timeouts).toEqual([CHAT_TIMEOUT_MS, 330_000]);
    expect(CHAT_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });

  it("a PawOS that never answers can't hold the session: the wait ends, the message is not sent twice, and the prompt returns", async () => {
    const h = start({ signedIn: true, answers: ["hii", "/help", null], cwd: HOME, local: NOT_GIT, caps: LIVE_TERMINAL });
    h.server.chatReplies = [new Error("The operation was aborted due to timeout")];
    h.server.recoveries = [new Error("The operation was aborted due to timeout")];
    expect(await runCli([], h.ctx)).toBe(0);
    const seen = stripAnsi(h.raw());
    expect(seen).toContain("PawOS couldn't be reached. Check your connection and try again.");
    expect(seen).not.toContain("aborted");
    expect(h.server.chats()).toHaveLength(1);
    expect(h.server.recovers().length).toBeLessThanOrEqual(6);
    expect(seen.lastIndexOf(QUESTION)).toBeGreaterThan(seen.indexOf("couldn't be reached"));
    expect(h.timers.active).toBe(0);
    expect(cursorIsBack(h.raw())).toBe(true);
  });

  it("the overall wait is bounded too: a message PawOS keeps calling 'processing' ends with a clear message", async () => {
    let time = 0;
    const calls: string[] = [];
    await expect(
      sendChatMessage({
        client: { sendChat: async () => (calls.push("send"), { kind: "processing" }), recoverSend: async () => (calls.push("recover"), { kind: "processing" }) },
        content: "hii",
        requestId: "request-0003",
        sleep: async (ms) => void (time += ms),
        now: () => time,
      })
    ).rejects.toThrow("PawOS is taking longer than expected to answer.");
    expect(time).toBeLessThanOrEqual(170_000);
    expect(calls.filter((call) => call === "send")).toHaveLength(1);

    time = 0;
    await expect(
      sendChatMessage({
        client: {
          sendChat: async () => {
            time += CHAT_TIMEOUT_MS;
            throw new PawosApiError("network", "PawOS couldn't be reached.");
          },
          recoverSend: async () => {
            time += 90_000;
            throw new PawosApiError("network", "PawOS couldn't be reached.");
          },
        },
        content: "hii",
        requestId: "request-0004",
        sleep: async (ms) => void (time += ms),
        now: () => time,
      })
    ).rejects.toThrow("PawOS didn't answer in time.");
  });

  it("spinner stops on success: no timer left, the live line erased, the cursor back", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT, caps: LIVE_TERMINAL });
    h.server.chatReplies = [hello()];
    await runCli([], h.ctx);
    expect(h.timers.active).toBe(0);
    expect(cursorIsBack(h.raw())).toBe(true);
    const seen = stripAnsi(h.raw());
    expect(seen.indexOf("Hi! How can I help?")).toBeGreaterThan(seen.lastIndexOf("PawOS is thinking"));
  });

  it("a slow answer says it is still thinking instead of looking stuck", async () => {
    const h = start({ signedIn: true, answers: ["hii", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [
      () => {
        h.timers.tick(STILL_THINKING_AFTER_SECONDS); // twenty seconds pass before PawOS answers
        return hello();
      },
    ];
    await runCli([], h.ctx);
    expect(h.output()).toContain("◉ PawOS is still thinking… Ctrl+C stops waiting.");
    expect(h.output()).toContain("Hi! How can I help?");
    expect(h.timers.active).toBe(0);
  });
});

describe("Ctrl+C asks before leaving", () => {
  it("Ctrl+C at the prompt: the exit confirmation appears, and nothing is submitted", async () => {
    const h = start({ signedIn: true, answers: [INTERRUPT, "n", null], cwd: HOME, local: NOT_GIT });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", EXIT_PROMPT, "  > "]);
    expect(h.output()).toContain("\n  Exit PawOS? (y/N)\n\n  > ");
    expect(h.server.chats()).toHaveLength(0);
  });

  it.each([["y"], ["Y"], ["yes"]])("%s exits PawOS cleanly", async (answer) => {
    const h = start({ signedIn: true, answers: [INTERRUPT, answer, "never read"], cwd: HOME, local: NOT_GIT, caps: LIVE_TERMINAL });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toHaveLength(2);
    expect(h.server.chats()).toHaveLength(0);
    expect(h.timers.active).toBe(0);
    expect(cursorIsBack(h.raw())).toBe(true);
    expect(h.listening()).toBe(0);
  });

  it.each([["n"], ["N"], ["no"], [""], ["   "]])("%j returns to the prompt, and PawOS carries on", async (answer) => {
    const h = start({ signedIn: true, answers: [INTERRUPT, answer, "hii", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [hello()];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts).toEqual(["  > ", EXIT_PROMPT, "  > ", "  > "]);
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["hii"]);
    expect(h.output()).toContain("Hi! How can I help?");
  });

  it("anything else is asked again — it never exits by accident and is never sent to PawOS", async () => {
    const h = start({ signedIn: true, answers: [INTERRUPT, "maybe", "fix the bug", "n", "hii", null], cwd: HOME, local: NOT_GIT });
    h.server.chatReplies = [hello()];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts.filter((prompt) => prompt === EXIT_PROMPT)).toHaveLength(3);
    expect(h.output().split("Please answer y or n.").length - 1).toBe(2);
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["hii"]);
  });

  it("a second Ctrl+C at the confirmation, or the end of input, leaves — there is nobody left to ask", async () => {
    const twice = start({ signedIn: true, answers: [INTERRUPT, INTERRUPT, "never read"], cwd: HOME, local: NOT_GIT });
    expect(await runCli([], twice.ctx)).toBe(0);
    expect(twice.prompter.prompts).toHaveLength(2);
    const ended = start({ signedIn: true, answers: [INTERRUPT], cwd: HOME, local: NOT_GIT });
    expect(await runCli([], ended.ctx)).toBe(0);
  });

  it("Ctrl+D (the end of input) still leaves straight away, with no confirmation", async () => {
    const h = start({ signedIn: true, answers: [null], cwd: HOME, local: NOT_GIT });
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.output()).not.toContain("Exit PawOS?");
  });

  it("ordinary messages and commands are never asked to confirm", async () => {
    const h = start({ signedIn: true, answers: ["hii", "/status", "/help", "/exit"], cwd: HOME, local: NOT_GIT });
    await runCli([], h.ctx);
    expect(h.output()).not.toContain("Exit PawOS?");
  });

  it("Ctrl+C while waiting for a reply: the wait is stopped safely, then the confirmation appears; No returns to the prompt", async () => {
    const h = start({ signedIn: true, answers: ["hii", "n", "again", null], cwd: HOME, local: NOT_GIT, caps: LIVE_TERMINAL });
    h.server.chatReplies = [
      () => {
        queueMicrotask(h.interrupt); // Ctrl+C while the spinner is up
        return new Promise<Response>(() => undefined) as unknown as Response; // PawOS never answers this one
      },
      hello(),
    ];
    expect(await runCli([], h.ctx)).toBe(0);
    const seen = stripAnsi(h.raw());
    expect(seen).toContain("Stopped waiting. Your message was sent once; the reply will be in your PawOS chats.");
    expect(seen.indexOf("Exit PawOS? (y/N)")).toBeGreaterThan(seen.indexOf("Stopped waiting."));
    // The spinner was stopped before the question was asked, and nothing was left running.
    const raw = h.raw();
    expect(raw.slice(0, raw.indexOf("Exit PawOS?")).lastIndexOf(`${ESC}[?25h`)).toBeGreaterThan(raw.slice(0, raw.indexOf("Exit PawOS?")).lastIndexOf(`${ESC}[?25l`));
    expect(h.listening()).toBe(0);
    expect(h.timers.active).toBe(0);
    // No: back at the prompt, and another message works. The interrupted one was never sent again.
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["hii", "again"]);
    expect(seen).toContain("Hi! How can I help?");
  });

  it("Ctrl+C while waiting for a reply, then Yes: PawOS exits cleanly", async () => {
    const h = start({ signedIn: true, answers: ["hii", "y", "never read"], cwd: HOME, local: NOT_GIT, caps: LIVE_TERMINAL });
    h.server.chatReplies = [
      () => {
        queueMicrotask(h.interrupt);
        return new Promise<Response>(() => undefined) as unknown as Response;
      },
    ];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.server.chats()).toHaveLength(1);
    expect(h.timers.active).toBe(0);
    expect(cursorIsBack(h.raw())).toBe(true);
    expect(h.listening()).toBe(0);
  });

  it("Ctrl+C during a code task: the display stops, the task carries on at PawOS, and No returns to the prompt", async () => {
    const h = start({ signedIn: true, answers: ["Fix the bug", "n", "/chat", "hii", null], caps: LIVE_TERMINAL });
    h.server.polls = [change("r")];
    h.server.sends = [
      () => {
        queueMicrotask(h.interrupt);
        return h.server.afterPolls(1_000_000, delivered("r", pushed("r")))() as unknown as Response;
      },
    ];
    h.server.chatReplies = [hello()];
    expect(await runCli([], h.ctx)).toBe(0);
    const seen = stripAnsi(h.raw());
    expect(seen).toContain("Stopped watching. The task was not cancelled: it continues on PawOS.");
    expect(seen.indexOf("Exit PawOS? (y/N)")).toBeGreaterThan(seen.indexOf("Stopped watching."));
    expect(h.server.starts()).toHaveLength(1); // never sent again
    expect(h.ctx.pending.read()?.content).toBe("Fix the bug"); // and its request id is kept
    expect(h.server.chats().map((call) => call.body?.content)).toEqual(["hii"]); // the session carried on
    expect(h.timers.active).toBe(0);
  });

  it("Ctrl+C while PawOS is starting up is not lost and does not kill it: it asks at the first prompt", async () => {
    const h = start({ signedIn: true, answers: ["n", "hii", null], cwd: HOME, local: NOT_GIT });
    h.interrupt(); // nothing is listening yet
    h.server.chatReplies = [hello()];
    expect(await runCli([], h.ctx)).toBe(0);
    expect(h.prompter.prompts[0]).toBe(EXIT_PROMPT);
    expect(h.server.chats()).toHaveLength(1);
  });

  it("the confirmation by itself: only an explicit yes leaves", async () => {
    const run = async (answers: (string | null)[]) => {
      const printed: string[] = [];
      const queue = [...answers];
      const leave = await confirmExit({ interrupted: false, ask: async () => (queue.length > 0 ? queue.shift()! : null), close: () => undefined }, (text) => printed.push(text));
      return { leave, printed };
    };
    expect((await run(["y"])).leave).toBe(true);
    expect((await run([" YES "])).leave).toBe(true);
    expect((await run(["n"])).leave).toBe(false);
    expect((await run([""])).leave).toBe(false);
    expect((await run(["yep", "exit", "n"])).leave).toBe(false);
    expect((await run(["q", "y"])).printed.filter((text) => text.includes("Please answer y or n."))).toHaveLength(1);
    expect((await run([null])).leave).toBe(true);
  });
});

describe("the terminal is handed back in its normal state", () => {
  /** A stand-in for a real keyboard: a TTY whose raw mode can be watched. */
  function keyboard() {
    const input = new PassThrough() as PassThrough & { isTTY: boolean; isRaw: boolean; setRawMode: (raw: boolean) => unknown; modes: boolean[] };
    input.isTTY = true;
    input.isRaw = false;
    input.modes = [];
    input.setRawMode = (raw: boolean) => {
      input.isRaw = raw;
      input.modes.push(raw);
      return input;
    };
    const written: string[] = [];
    const output = new PassThrough();
    output.on("data", (chunk) => written.push(String(chunk)));
    return { input, output, written };
  }
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it("Ctrl+C at a prompt: the question ends with nothing submitted, ^C is shown, and raw mode is switched off", async () => {
    const { input, output, written } = keyboard();
    const prompter = createPrompter(input, output);
    const asked = prompter.ask("  > ");
    await settle();
    expect(input.isRaw).toBe(true); // while typing
    input.write("half a mess");
    input.write(String.fromCharCode(3)); // Ctrl+C
    expect(await asked).toBeNull();
    expect(prompter.interrupted).toBe(true);
    expect(input.isRaw).toBe(false); // the terminal is back in its normal mode
    expect(written.join("")).toContain("^C\n");
    prompter.close();
  });

  it("after cancelling the exit, the next prompt works normally and leaves the terminal normal again", async () => {
    const { input, output } = keyboard();
    const prompter = createPrompter(input, output);
    const first = prompter.ask("  > ");
    await settle();
    input.write(String.fromCharCode(3));
    expect(await first).toBeNull();

    const confirm = confirmExit(prompter, () => undefined);
    await settle();
    input.write("n\r");
    expect(await confirm).toBe(false);
    expect(input.isRaw).toBe(false);

    const next = prompter.ask("  > ");
    await settle();
    input.write("hii\r");
    expect(await next).toBe("hii");
    expect(prompter.interrupted).toBe(false);
    expect(input.isRaw).toBe(false);
    expect(input.modes.filter((raw) => raw).length).toBe(input.modes.filter((raw) => !raw).length); // every switch on was switched off
    prompter.close();
  });

  it("after choosing to exit, nothing is left in raw mode or still reading", async () => {
    const { input, output } = keyboard();
    const prompter = createPrompter(input, output);
    const first = prompter.ask("  > ");
    await settle();
    input.write(String.fromCharCode(3));
    await first;
    const confirm = confirmExit(prompter, () => undefined);
    await settle();
    input.write("y\r");
    expect(await confirm).toBe(true);
    prompter.close();
    expect(input.isRaw).toBe(false);
    expect(input.listenerCount("keypress")).toBe(0);
  });
});
