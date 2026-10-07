import type { CliSessionStore } from "./auth/sessionStore";
import type { LocalRepository } from "./git/localRepository";
import type { ApiConfig, PawosClient, SessionManager, TaskOptions, TaskOutcome } from "./shared";
import type { PendingTaskStore } from "./state/pendingTask";
import type { Prompter } from "./ui/prompts";
import type { Timers } from "./ui/spinner";
import type { Terminal } from "./ui/terminal";

/**
 * Everything a command touches outside itself — the screen, the keyboard, the session, PawOS, Git,
 * the browser. Commands take it as an argument, so the tests run the real commands against
 * stand-ins and nothing in a test can reach a real account, repository or browser.
 */
export interface CliContext {
  term: Terminal;
  prompter: Prompter;
  version: string;
  config: ApiConfig;
  session: SessionManager;
  store: CliSessionStore;
  client: Pick<PawosClient, "getCapabilities" | "getRepositoryReadiness" | "selectRepository" | "sendCodeChange" | "recoverSend" | "getChange">;
  pending: PendingTaskStore;
  /** The GitHub repository of the folder the CLI was started in. */
  detectRepository: () => Promise<LocalRepository>;
  openBrowser: (url: string) => Promise<boolean>;
  /** Follows one task to its result (the shared task runner). */
  run: (options: TaskOptions) => Promise<TaskOutcome>;
  /** Calls `handler` if the user presses Ctrl+C; returns a function that stops listening. */
  onInterrupt: (handler: () => void) => () => void;
  timers?: Timers;
}
