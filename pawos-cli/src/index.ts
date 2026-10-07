import { CliSessionStore, keyringServiceFor, openSystemKeyring } from "./auth/sessionStore";
import { runCli } from "./cli";
import { VERSION, apiConfig, configDirectory } from "./config";
import type { CliContext } from "./context";
import { detectProject } from "./git/localRepository";
import { DEFAULT_API_BASE_URL, PawosClient, SessionManager, runTask } from "./shared";
import { PendingTaskStore } from "./state/pendingTask";
import { createPrompter } from "./ui/prompts";
import { Terminal, detectCapabilities } from "./ui/terminal";

/** The real `pawos`: the screen, the keyboard, the credential store, Git and PawOS itself. */
function createContext(): CliContext {
  const env = process.env;
  const config = apiConfig(env);
  const directory = configDirectory(env);
  const baseUrl = () => {
    if (!config.ok) throw new Error(config.problem);
    return config.config.apiBaseUrl;
  };
  const store = new CliSessionStore(openSystemKeyring(keyringServiceFor(config.ok ? config.config.apiBaseUrl : DEFAULT_API_BASE_URL, DEFAULT_API_BASE_URL)), directory, process.cwd());
  const session = new SessionManager({ storage: store, getApiBaseUrl: baseUrl });
  return {
    term: new Terminal(process.stdout, detectCapabilities(process.stdout, env)),
    prompter: createPrompter(process.stdin, process.stdout),
    version: VERSION,
    config,
    session,
    store,
    client: new PawosClient(baseUrl, (forceRefresh) => session.getAccessToken(forceRefresh), () => session.expire()),
    pending: new PendingTaskStore(directory),
    // Wherever the user ran `pawos` — not where the package is installed.
    detectProject: () => detectProject(process.cwd()),
    run: runTask,
    onInterrupt: (handler) => {
      process.once("SIGINT", handler);
      return () => process.removeListener("SIGINT", handler);
    },
  };
}

async function main(): Promise<number> {
  const ctx = createContext();
  try {
    return await runCli(process.argv.slice(2), ctx);
  } finally {
    ctx.term.endLive(); // whatever happened, the cursor comes back
    ctx.prompter.close();
  }
}

main().then(
  (code) => process.exit(code),
  () => {
    // Never a stack trace or an error object: either could carry something that shouldn't be printed.
    process.stderr.write("PawOS stopped unexpectedly. Please try again.\n");
    process.exit(1);
  }
);
