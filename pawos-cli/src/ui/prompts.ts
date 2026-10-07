import * as readline from "readline";

/**
 * Asking the user for a line of text. `ask` resolves null when there is nothing more to read — the
 * user pressed Ctrl+C or Ctrl+D at the prompt, or piped input ran out — which every caller treats
 * as "stop".
 */
export interface Prompter {
  ask(prompt: string): Promise<string | null>;
  close(): void;
}

export async function confirm(prompter: Prompter, prompt: string, defaultYes = true): Promise<boolean> {
  const answer = await prompter.ask(`${prompt} ${defaultYes ? "[Y/n]" : "[y/N]"} `);
  if (answer === null) return false; // no answer is never a yes
  const text = answer.trim().toLowerCase();
  if (!text) return defaultYes;
  return text === "y" || text === "yes";
}

type Input = NodeJS.ReadableStream & { isTTY?: boolean };

/**
 * On a terminal, each question gets its own readline interface, closed as soon as it is answered:
 * between questions the terminal is back in its normal mode, so Ctrl+C during a task reaches the
 * CLI as an ordinary interrupt. Piped input is read line by line by one interface, so no line is lost.
 */
export function createPrompter(input: Input, output: NodeJS.WritableStream): Prompter {
  if (input.isTTY) {
    let open: readline.Interface | null = null;
    return {
      ask: (prompt) =>
        new Promise<string | null>((resolve) => {
          const rl = readline.createInterface({ input, output, terminal: true });
          open = rl;
          let answered = false;
          const finish = (value: string | null) => {
            if (answered) return;
            answered = true;
            open = null;
            rl.close();
            resolve(value);
          };
          rl.on("SIGINT", () => {
            output.write("\n");
            finish(null);
          });
          rl.on("close", () => finish(null));
          rl.question(prompt, (answer) => finish(answer));
        }),
      close: () => open?.close(),
    };
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
  return {
    ask: (prompt) => {
      output.write(prompt);
      if (queued.length > 0) return Promise.resolve(queued.shift()!).then((text) => (output.write("\n"), text));
      if (ended) return Promise.resolve(null);
      return new Promise<string | null>((resolve) => waiting.push((text) => (output.write("\n"), resolve(text))));
    },
    close: () => rl.close(),
  };
}
