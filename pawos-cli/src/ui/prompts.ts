import * as readline from "readline";
import { StringDecoder } from "string_decoder";

/**
 * Asking the user for a line of text. `ask` resolves null when there is nothing more to read — the
 * user pressed Ctrl+C or Ctrl+D at the prompt, or piped input ran out — which every caller treats
 * as "stop".
 */
export interface AskOptions {
  /**
   * What was typed while PawOS was working, before this question was asked. Only the main prompt
   * keeps it — put back on the input line, visible and editable, never sent without Enter. Every
   * other question (an approval, the exit question, sign-in) starts empty: a key pressed earlier
   * must never answer something the user hasn't seen.
   */
  keepTypedAhead?: boolean;
}

export interface Prompter {
  ask(prompt: string, options?: AskOptions): Promise<string | null>;
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

type Input = NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };

/** Shown when keys typed while PawOS was working are not used to answer the question in front of the user. */
export const TYPED_AHEAD_IGNORED = "  (What you typed while PawOS was working was not used to answer this. It is kept for the main prompt.)";
/** Shown when what was typed while PawOS was working is waiting on the input line. */
export const TYPED_AHEAD_KEPT = "  What you typed while PawOS was working is below. Press Enter to send it.";
/** Same, when more lines are waiting after this one. */
export const typedAheadKeptOf = (waiting: number) => `  What you typed while PawOS was working is below (${waiting} more after it). Press Enter to send it.`;

/**
 * The keyboard between questions. While PawOS works no question is open, so nothing reads the
 * keyboard: the console would keep every key pressed (unechoed, so typing seems to do nothing) and
 * hand them all to whichever question opens next — where a typed-ahead "y" and Enter could answer
 * an approval the user never saw. Instead PawOS reads those keys itself, as lines (each Enter ends
 * one), and each question decides what to do with them (AskOptions). Ctrl+C is still an interrupt.
 */
class TypedAhead {
  /** Lines ended with Enter, oldest first. */
  private lines: string[] = [];
  /** The line being typed. */
  private text = "";
  private listening = false;
  private readonly decoder = new StringDecoder("utf8");
  private readonly onData = (chunk: Buffer | string) => this.take(typeof chunk === "string" ? chunk : this.decoder.write(chunk));

  constructor(
    private readonly input: Input,
    private readonly interrupt: () => void
  ) {}

  /** Starts taking keys: after a question is answered, until the next one is asked. */
  collect(): void {
    if (this.listening) return;
    this.listening = true;
    try {
      this.input.setRawMode?.(true); // so Ctrl+C and Enter arrive here as keys, not to the console
    } catch {
      /* not a console that has a raw mode */
    }
    this.input.on("data", this.onData);
    this.input.resume();
  }

  /** Stops taking keys: a question is about to read the keyboard itself. */
  pause(): void {
    if (!this.listening) return;
    this.listening = false;
    this.input.removeListener("data", this.onData);
  }

  /** Whether anything typed ahead is waiting. */
  get waiting(): boolean {
    return this.lines.length > 0 || this.text.trim().length > 0;
  }

  /**
   * The next thing typed ahead, for the main prompt: the oldest finished line, else the line being
   * typed. What is taken leaves the queue; the rest waits for the next main prompt.
   */
  next(): { text: string; more: number } | null {
    const finished = this.lines.shift();
    if (finished !== undefined) return { text: finished, more: this.lines.length + (this.text.trim() ? 1 : 0) };
    const typing = this.text.replace(/^\s+/, "");
    this.text = "";
    return typing.trim() ? { text: typing, more: 0 } : null;
  }

  /** Back to the console's normal mode (PawOS is leaving). */
  stop(): void {
    const wasListening = this.listening;
    this.pause();
    this.lines = [];
    this.text = "";
    if (!wasListening) return;
    try {
      this.input.setRawMode?.(false);
    } catch {
      /* ignore */
    }
    this.input.pause();
  }

  private take(data: string): void {
    // Arrow keys, Home, F-keys and the like: nothing to keep.
    const keys = data.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001bO.|\u001b./g, "");
    for (const key of keys) {
      if (key === "\u0003") {
        // Stop: whatever was typed ahead goes too.
        this.lines = [];
        this.text = "";
        this.interrupt();
      } else if (key === "\b" || key === "\u007f") {
        this.text = [...this.text].slice(0, -1).join("");
      } else if (key === "\r" || key === "\n") {
        // Enter while PawOS works ends the line but sends nothing: it waits at the main prompt.
        if (this.text.trim()) this.lines.push(this.text.trim());
        this.text = "";
      } else if (key === "\t" || key >= " ") {
        this.text += key === "\t" ? " " : key;
      }
    }
  }
}

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
 * On a terminal, each question gets its own readline interface, closed as soon as it is answered.
 * Between questions PawOS reads the keyboard itself (TypedAhead): Ctrl+C there is an interrupt, and
 * what is typed waits for the main prompt — shown, never sent without Enter, never an answer to an
 * approval. The terminal goes back to its normal mode when PawOS closes. Piped input is read line
 * by line by one interface, so no line is lost.
 *
 * One answer can be several lines:
 *   - Pasted text. Every line that arrives together is one message — a pasted task is never cut
 *     into several, and none of its lines is left over to answer the next question by accident.
 *     If the paste doesn't end with a line break, the message waits for Enter.
 *   - A line ending with a backslash continues on the next line.
 * Enter on a line that doesn't end with a backslash sends the message. A single typed line works
 * exactly as it always has.
 */
export function createPrompter(input: Input, output: NodeJS.WritableStream, options: { onInterrupt?: () => void } = {}): Prompter {
  if (input.isTTY) {
    let open: readline.Interface | null = null;
    // What was sent earlier in this session, newest first: Up and Down recall it.
    let history: string[] = [];
    // Ctrl+C pressed while PawOS works reaches the same handler a console interrupt would.
    const typed = new TypedAhead(input, options.onInterrupt ?? (() => void (process as NodeJS.EventEmitter).emit("SIGINT")));
    const prompter = {
      interrupted: false,
      ask: (prompt: string, askOptions: AskOptions = {}) =>
        new Promise<string | null>((resolve) => {
          prompter.interrupted = false;
          typed.pause();
          // The main prompt offers the next thing typed ahead; any other question leaves it waiting.
          const next = askOptions.keepTypedAhead ? typed.next() : null;
          const ahead = next?.text ?? "";
          if (next) output.write(`${next.more > 0 ? typedAheadKeptOf(next.more) : TYPED_AHEAD_KEPT}\n`);
          else if (!askOptions.keepTypedAhead && typed.waiting) output.write(`${TYPED_AHEAD_IGNORED}\n`);
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
            // From here until the next question, keys are PawOS's to keep (see TypedAhead).
            typed.collect();
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
          // Kept text goes on the input line as if just typed: visible, editable, sent only on Enter.
          if (ahead && askOptions.keepTypedAhead) rl.write(ahead);
        }),
      close: () => {
        open?.close();
        typed.stop();
      },
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
