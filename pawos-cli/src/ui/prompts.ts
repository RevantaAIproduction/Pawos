import * as readline from "readline";

/**
 * Asking the user for a line of text. `ask` resolves null when there is nothing more to read — the
 * user pressed Ctrl+C or Ctrl+D at the prompt, or piped input ran out — which every caller treats
 * as "stop".
 */
export interface Prompter {
  ask(prompt: string): Promise<string | null>;
  /** True when the last `ask` ended because the user pressed Ctrl+C (rather than input running out). */
  readonly interrupted: boolean;
  close(): void;
}

export async function confirm(prompter: Prompter, prompt: string, defaultYes = true): Promise<boolean> {
  const answer = await prompter.ask(`${prompt} ${defaultYes ? "[Y/n]" : "[y/N]"} `);
  if (answer === null) return false; // no answer is never a yes
  const text = answer.trim().toLowerCase();
  if (!text) return defaultYes;
  return text === "y" || text === "yes";
}

/**
 * "Exit PawOS? (y/N)" — asked when the user presses Ctrl+C, so one keypress never ends the session
 * by accident. Yes leaves; No, or just Enter, goes back to the prompt; anything else is asked again.
 * A second Ctrl+C here, or the end of input, means there is nobody to ask: PawOS leaves.
 */
export async function confirmExit(prompter: Prompter, print: (text: string) => void): Promise<boolean> {
  for (;;) {
    print("");
    const answer = await prompter.ask("  Exit PawOS? (y/N)\n\n  > ");
    if (answer === null) return true;
    const text = answer.trim().toLowerCase();
    if (text === "y" || text === "yes") return true;
    if (text === "" || text === "n" || text === "no") return false;
    print("  Please answer y or n.");
  }
}

type Input = NodeJS.ReadableStream & { isTTY?: boolean };

/**
 * How long after a line arrives PawOS waits for more before taking the message as complete.
 * Pasted text arrives all at once, so its lines land well inside this; nobody types a line and
 * presses Enter that fast. It is what keeps a pasted, multi-line task in one piece.
 */
export const PASTE_WINDOW_MS = 40;
/** Shown at the start of each further line of a message continued with a trailing backslash. */
export const CONTINUE_PROMPT = "  … ";
const HISTORY_SIZE = 100;

/**
 * Joins lines that end with a backslash to the line after them. Returns the finished message, or
 * null while the last line still asks to be continued.
 */
function joined(lines: string[]): string {
  return lines.join("\n");
}

/**
 * On a terminal, each question gets its own readline interface, closed as soon as it is answered:
 * between questions the terminal is back in its normal mode, so Ctrl+C during a task reaches the
 * CLI as an ordinary interrupt. Piped input is read line by line by one interface, so no line is lost.
 *
 * One answer can be several lines:
 *   - Pasted text. Every line that arrives together is one message — a pasted task is never cut
 *     into several, and none of its lines is left over to answer the next question by accident.
 *     If the paste doesn't end with a line break, the message waits for Enter.
 *   - A line ending with a backslash continues on the next line.
 * Enter on a line that doesn't end with a backslash sends the message. A single typed line works
 * exactly as it always has.
 */
export function createPrompter(input: Input, output: NodeJS.WritableStream): Prompter {
  if (input.isTTY) {
    let open: readline.Interface | null = null;
    // What was sent earlier in this session, newest first: Up and Down recall it.
    let history: string[] = [];
    const prompter = {
      interrupted: false,
      ask: (prompt: string) =>
        new Promise<string | null>((resolve) => {
          prompter.interrupted = false;
          const rl = readline.createInterface({ input, output, terminal: true, history: [...history], historySize: HISTORY_SIZE });
          open = rl;
          let answered = false;
          let pending: NodeJS.Timeout | undefined;
          const lines: string[] = [];
          const finish = (value: string | null) => {
            if (answered) return;
            answered = true;
            if (pending) clearTimeout(pending);
            open = null;
            // One entry per message, however many lines it had; short answers (y, n) are not worth recalling.
            if (value !== null && value.trim().length > 2) history = [value.replace(/\s*\n\s*/g, " ").trim(), ...history.filter((entry) => entry !== value)].slice(0, HISTORY_SIZE);
            rl.close();
            resolve(value);
          };
          const send = () => {
            // Text still sitting on the input line is the end of a paste that had no final line
            // break: the message isn't complete until Enter is pressed.
            if (rl.line && rl.line.length > 0) return;
            finish(joined(lines));
          };
          rl.on("line", (text) => {
            if (pending) clearTimeout(pending);
            if (text.endsWith("\\")) {
              // Asked for: carry on with the next line.
              lines.push(text.slice(0, -1));
              rl.setPrompt(CONTINUE_PROMPT);
              rl.prompt();
              return;
            }
            lines.push(text);
            pending = setTimeout(send, PASTE_WINDOW_MS);
          });
          rl.on("SIGINT", () => {
            // Ctrl+C at a prompt cancels that prompt. Whatever was typed is discarded, never submitted.
            prompter.interrupted = true;
            output.write("^C\n");
            finish(null);
          });
          rl.on("close", () => finish(null));
          rl.setPrompt(prompt);
          rl.prompt();
        }),
      close: () => open?.close(),
    };
    return prompter;
  }

  const queued: string[] = [];
  const waiting: ((line: string | null) => void)[] = [];
  let ended = false;
  const rl = readline.createInterface({ input, terminal: false });
  rl.on("line", (text) => {
    const next = waiting.shift();
    if (next) next(text);
    else queued.push(text);
  });
  rl.on("close", () => {
    ended = true;
    for (const next of waiting.splice(0)) next(null);
  });
  const nextLine = (): Promise<string | null> => {
    if (queued.length > 0) return Promise.resolve(queued.shift()!);
    if (ended) return Promise.resolve(null);
    return new Promise<string | null>((resolve) => waiting.push(resolve));
  };
  return {
    interrupted: false, // piped input has no Ctrl+C: it simply ends
    ask: async (prompt) => {
      output.write(prompt);
      // Piped input stays one line per answer (a script's lines are its answers), except where a
      // line ends with a backslash and so continues on the next.
      const lines: string[] = [];
      for (;;) {
        const text = await nextLine();
        if (text === null) {
          if (lines.length === 0) return null;
          break;
        }
        if (!text.endsWith("\\")) {
          lines.push(text);
          break;
        }
        lines.push(text.slice(0, -1));
      }
      output.write("\n");
      return joined(lines);
    },
    close: () => rl.close(),
  };
}
