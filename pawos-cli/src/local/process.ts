import { execFile, type ChildProcess } from "child_process";
import spawn from "cross-spawn";

/**
 * Starts one program on this computer and waits for it — the only place in the local runtime that
 * does. What is started is decided elsewhere (local/commands.ts, after local/commandPolicy.ts and
 * the user have had their say); this file only runs it safely:
 *
 *   - as a program and a list of arguments, with no shell (cross-spawn, shell: false — the same
 *     library and setting PawOS Desktop's shellExec.ts uses, which is also what lets Windows start
 *     npm, npx, yarn and pnpm without turning the shell option on);
 *   - with nothing to read from the keyboard, so a program can't sit waiting for an answer;
 *   - with an environment that has had its secrets taken out;
 *   - with a time limit, and a way to stop it (Ctrl+C) that takes the whole process tree with it;
 *   - keeping only the end of what it prints, so a noisy program can't fill memory.
 */

/** Characters of each stream kept in memory (PawOS Desktop's ProcessManager keeps the same). */
export const STREAM_CHARS = 200_000;
/** How long a stopped program is given to actually go away before PawOS stops waiting for it. */
const STOP_GRACE_MS = 5000;

export interface ProcessOutcome {
  /** The program's exit code; null when it was stopped or never started. */
  exitCode: number | null;
  /** The signal that ended it, when one did. */
  signal: string | null;
  stdout: string;
  stderr: string;
  /** More was printed than was kept. */
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  /** Why it could not be started at all (the program isn't installed, for example). */
  failedToStart: string | null;
  durationMs: number;
}

export interface ProcessOptions {
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  streamChars?: number;
}

/** Names of environment variables that hold secrets. They are not given to programs PawOS starts. */
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSW|_PWD|CREDENTIAL|AUTH|COOKIE|SESSION_|PRIVATE|DSN|CONNECTION|DATABASE_URL|WEBHOOK|^PAWOS_/i;
/** Needed for ordinary work and not secrets, despite their names. */
const KEPT_ANYWAY = new Set(["SSH_AUTH_SOCK", "GPG_AGENT_INFO"]);

export const isSecretName = (name: string) => SECRET_NAME.test(name) && !KEPT_ANYWAY.has(name.toUpperCase());

/**
 * The environment a started program gets: this one, without its secrets, and with the settings
 * that keep development tools from stopping to ask a question or opening a pager.
 */
export function childEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) if (value !== undefined && !isSecretName(name)) kept[name] = value;
  return { ...kept, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0", GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat", PAGER: "cat", npm_config_fund: "false", npm_config_update_notifier: "false" };
}

/** The values of this environment's secrets, so they can be blanked out of anything a program prints. */
export function secretValues(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) if (value && value.length >= 8 && isSecretName(name)) values.add(value);
  return [...values].sort((a, b) => b.length - a.length);
}

/**
 * Stops a program and everything it started. On Windows a program started through a script file is
 * a grandchild, so killing the child alone would orphan it: `taskkill /T /F` takes the whole tree
 * (what Desktop's ProcessManager does). Elsewhere the program was started as the leader of its own
 * process group, and the group is signalled.
 */
export function stopTree(child: ChildProcess, platform: string = process.platform): void {
  const pid = child.pid;
  if (!pid) {
    child.kill();
    return;
  }
  if (platform === "win32") {
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {
      // Already gone, or it could not be found: either way there is nothing left to stop.
    });
    return;
  }
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // Already gone.
      }
    }
  };
  signalGroup("SIGTERM");
  setTimeout(() => signalGroup("SIGKILL"), 2000).unref();
}

export function runProcess(bin: string, args: string[], options: ProcessOptions): Promise<ProcessOutcome> {
  const keep = options.streamChars ?? STREAM_CHARS;
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let giveUp: NodeJS.Timeout | undefined;

    const settle = (exitCode: number | null, signal: string | null, failedToStart: string | null = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (giveUp) clearTimeout(giveUp);
      options.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode: timedOut || cancelled ? null : exitCode, signal, stdout, stderr, truncated, timedOut, cancelled, failedToStart, durationMs: Date.now() - started });
    };

    if (options.signal?.aborted) {
      cancelled = true;
      settle(null, null, null);
      return;
    }

    let child: ChildProcess;
    try {
      child = spawn(bin, args, {
        cwd: options.cwd,
        env: options.env ?? childEnvironment(),
        shell: false,
        windowsHide: true,
        // Nothing to read: a program that asks a question gets "end of input", not a hung terminal.
        stdio: ["ignore", "pipe", "pipe"],
        // Its own process group (not on Windows, where the tree is found by process id).
        detached: process.platform !== "win32",
      });
    } catch {
      settle(null, null, "It could not be started.");
      return;
    }

    const stop = () => {
      stopTree(child);
      // If it somehow never reports that it has gone, stop waiting.
      giveUp = setTimeout(() => settle(null, null, null), STOP_GRACE_MS);
    };
    function onAbort() {
      if (settled || cancelled) return;
      cancelled = true;
      stop();
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      if (settled || cancelled) return;
      timedOut = true;
      stop();
    }, options.timeoutMs);

    // Only the end of each stream is kept: the last thing a failing build prints is what matters.
    child.stdout?.on("data", (data: Buffer) => {
      const next = stdout + data.toString("utf8");
      if (next.length > keep) truncated = true;
      stdout = next.length > keep ? next.slice(-keep) : next;
    });
    child.stderr?.on("data", (data: Buffer) => {
      const next = stderr + data.toString("utf8");
      if (next.length > keep) truncated = true;
      stderr = next.length > keep ? next.slice(-keep) : next;
    });
    child.once("error", (error: NodeJS.ErrnoException) => settle(null, null, error.code === "ENOENT" ? "That program isn't installed, or isn't on your PATH." : "It could not be started."));
    child.once("close", (code, signal) => settle(code, signal));
  });
}
