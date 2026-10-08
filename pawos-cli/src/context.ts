import type { CliSessionStore } from "./auth/sessionStore";
import type { ProjectContext } from "./git/localRepository";
import type { ApiConfig, ChatOptions, PawosClient, SendResult, SessionManager, TaskOptions, TaskOutcome } from "./shared";
import type { PendingTaskStore } from "./state/pendingTask";
import type { Prompter } from "./ui/prompts";
import type { Timers } from "./ui/spinner";
import type { Terminal } from "./ui/terminal";

/**
 * Everything a command touches outside itself: the screen, the keyboard, the session, PawOS and
 * Git. Commands take it as an argument, so the tests run the real commands against stand-ins and
 * nothing in a test can reach a real account or repository.
 */
export interface CliContext {
  term: Terminal;
  prompter: Prompter;
  version: string;
  config: ApiConfig;
  session: SessionManager;
  store: CliSessionStore;
  client: Pick<PawosClient, "getCapabilities" | "getRepositoryReadiness" | "selectRepository" | "sendCodeChange" | "sendChat" | "recoverSend" | "getChange" | "getOverview" | "listIntegrations" | "startConnect" | "listChats" | "getChat">;
  pending: PendingTaskStore;
  /** The folder the CLI was started in, its Git branch and its GitHub repository — read, never assumed. */
  detectProject: () => Promise<ProjectContext>;
  /** Sends one chat message and waits for the reply (the shared chat sender). Tests replace its timing only. */
  chat?: (options: ChatOptions) => Promise<SendResult>;
  /** Follows one task to its result (the shared task runner). */
  run: (options: TaskOptions) => Promise<TaskOutcome>;
  /** Calls `handler` if the user presses Ctrl+C; returns a function that stops listening. */
  onInterrupt: (handler: () => void) => () => void;
  /** True, once, if the user pressed Ctrl+C while nothing was listening for it (PawOS was starting up). */
  takeInterrupt?: () => boolean;
  timers?: Timers;
  /** The time on this computer, for the greeting. */
  now?: () => Date;
  /** How much PawOS asks before a code change when the session starts (default: ask). */
  permissionMode?: "ask" | "auto" | "plan";
  /** False to skip the startup animation (it is also skipped wherever the terminal can't redraw in place). */
  animateStartup?: boolean;
}
