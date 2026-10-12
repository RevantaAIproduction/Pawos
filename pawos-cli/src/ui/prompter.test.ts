import { PassThrough } from "stream";
import { afterEach, describe, expect, it } from "vitest";
import { CONTINUE_PROMPT, PASTE_WINDOW_MS, createPrompter, type Prompter } from "./prompts";

/**
 * Typing into PawOS. One message can be several lines: a pasted task stays in one piece, and a line
 * ending with a backslash continues on the next. A single typed line works as it always has. The
 * terminal here is a stand-in that says it is one (isTTY), fed the bytes a real terminal would send.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const open: Prompter[] = [];

function terminal() {
  const input = new PassThrough() as PassThrough & { isTTY?: boolean };
  input.isTTY = true;
  const output = new PassThrough();
  let shown = "";
  output.on("data", (data) => (shown += data.toString()));
  const prompter = createPrompter(input, output);
  open.push(prompter);
  return { type: (text: string) => input.write(text), prompter, shown: () => shown, end: () => input.end() };
}

function piped(text: string) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const prompter = createPrompter(input, output);
  open.push(prompter);
  input.end(text);
  return prompter;
}

afterEach(() => {
  for (const prompter of open.splice(0)) prompter.close();
});

describe("a single line, as always", () => {
  it("Enter sends what was typed", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.type("fix the cart total\r");
    expect(await answer).toBe("fix the cart total");
    expect(t.shown()).toContain("  > ");
  });

  it("one line after another are separate messages when they are typed separately", async () => {
    const t = terminal();
    const first = t.prompter.ask("  > ");
    t.type("first message\r");
    expect(await first).toBe("first message");
    const second = t.prompter.ask("  > ");
    await sleep(PASTE_WINDOW_MS * 3);
    t.type("second message\r");
    expect(await second).toBe("second message");
  });

  it("an empty line is an empty answer (Enter for the default)", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  Allow? ");
    t.type("\r");
    expect(await answer).toBe("");
  });

  it("y and n answer a question at once", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  Allow this change? ");
    t.type("y\r");
    expect(await answer).toBe("y");
  });
});

describe("a pasted, multi-line task is one message", () => {
  const TASK = ["Inspect this React + TypeScript project.", "Redesign the ShopFlow storefront with a responsive hero section and a product grid.", "Run the production build and summarize the result."];

  it("every line of the paste is in the one answer, in order", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.type(`${TASK.join("\r")}\r`);
    expect(await answer).toBe(TASK.join("\n"));
  });

  it("none of its lines is left over to answer the next question", async () => {
    const t = terminal();
    const first = t.prompter.ask("  > ");
    t.type(`${TASK.join("\r")}\r`);
    await first;
    // The next prompt — a yes/no question, say — must wait for the user, not take a pasted line as its answer.
    let answered = false;
    const second = t.prompter.ask("  Allow? ").then((value) => ((answered = true), value));
    await sleep(PASTE_WINDOW_MS * 4);
    expect(answered).toBe(false);
    t.type("n\r");
    expect(await second).toBe("n");
  });

  it("blank lines inside the paste are kept", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.type("Redesign the storefront.\r\rKeep the existing cart.\r\r\rThen run the build.\r");
    expect(await answer).toBe("Redesign the storefront.\n\nKeep the existing cart.\n\n\nThen run the build.");
  });

  it("a paste with no final line break waits for Enter, and is still one message", async () => {
    const t = terminal();
    let done = false;
    const answer = t.prompter.ask("  > ").then((value) => ((done = true), value));
    t.type("First line of the task.\rSecond line, with no Enter after it");
    await sleep(PASTE_WINDOW_MS * 5);
    expect(done).toBe(false); // not sent half-finished
    t.type("\r");
    expect(await answer).toBe("First line of the task.\nSecond line, with no Enter after it");
  });

  it("a long prompt arrives whole", async () => {
    const t = terminal();
    const lines = Array.from({ length: 60 }, (_, index) => `Requirement ${index + 1}: ${"detail ".repeat(8).trim()}.`);
    const answer = t.prompter.ask("  > ");
    t.type(`${lines.join("\r")}\r`);
    const got = await answer;
    expect(got).toBe(lines.join("\n"));
    expect(got!.length).toBeGreaterThan(3500);
  });

  it("Windows line endings in the paste make no extra lines", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.type("one\r\ntwo\r\nthree\r\n");
    expect(await answer).toBe("one\ntwo\nthree");
  });
});

describe("continuing a message on purpose", () => {
  it("a line ending with a backslash carries on to the next; Enter on a line without one sends it", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.type("Redesign the storefront \\\r");
    await sleep(PASTE_WINDOW_MS * 3);
    t.type("and keep the cart working \\\r");
    await sleep(PASTE_WINDOW_MS * 3);
    t.type("then run the build\r");
    expect(await answer).toBe("Redesign the storefront \nand keep the cart working \nthen run the build");
    expect(t.shown()).toContain(CONTINUE_PROMPT);
  });

  it("the backslash is not part of the message", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.type("a\\\rb\r");
    expect(await answer).toBe("a\nb");
  });
});

describe("stopping", () => {
  it("Ctrl+C discards what was typed — a half-pasted task is never sent", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.type("First line.\rSecond line not finished");
    await sleep(5);
    t.type("\u0003");
    expect(await answer).toBeNull();
    expect(t.prompter.interrupted).toBe(true);
  });

  it("the end of input is not an answer", async () => {
    const t = terminal();
    const answer = t.prompter.ask("  > ");
    t.end();
    expect(await answer).toBeNull();
    expect(t.prompter.interrupted).toBe(false);
  });
});

describe("history", () => {
  it("Up brings back the last message, as one entry even if it had several lines", async () => {
    const t = terminal();
    const first = t.prompter.ask("  > ");
    t.type("Redesign the hero.\rKeep the cart.\r");
    expect(await first).toBe("Redesign the hero.\nKeep the cart.");
    const second = t.prompter.ask("  > ");
    await sleep(PASTE_WINDOW_MS * 2);
    t.type("\u001b[A"); // Up
    await sleep(10);
    t.type("\r");
    expect(await second).toBe("Redesign the hero. Keep the cart.");
  });

  it("y and n are not kept", async () => {
    const t = terminal();
    const first = t.prompter.ask("  > ");
    t.type("fix the total\r");
    await first;
    const yes = t.prompter.ask("  Allow? ");
    await sleep(PASTE_WINDOW_MS * 2);
    t.type("y\r");
    await yes;
    const again = t.prompter.ask("  > ");
    await sleep(PASTE_WINDOW_MS * 2);
    t.type("\u001b[A");
    await sleep(10);
    t.type("\r");
    expect(await again).toBe("fix the total");
  });
});

describe("piped input", () => {
  it("is one answer per line, so a script's lines stay its answers", async () => {
    const prompter = piped("fix the total\ny\n/exit\n");
    expect(await prompter.ask("> ")).toBe("fix the total");
    expect(await prompter.ask("? ")).toBe("y");
    expect(await prompter.ask("> ")).toBe("/exit");
    expect(await prompter.ask("> ")).toBeNull();
  });

  it("a line ending with a backslash continues on the next", async () => {
    const prompter = piped("Redesign the storefront \\\nand run the build\ny\n");
    expect(await prompter.ask("> ")).toBe("Redesign the storefront \nand run the build");
    expect(await prompter.ask("? ")).toBe("y");
  });

  it("a message still being continued when input ends is sent as it stands", async () => {
    const prompter = piped("only this \\\n");
    expect(await prompter.ask("> ")).toBe("only this ");
    expect(await prompter.ask("> ")).toBeNull();
  });
});
