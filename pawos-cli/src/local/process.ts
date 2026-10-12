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

/** Characters of a background program's output kept (both streams together): the end of it. */
export const BACKGROUND_OUTPUT_CHARS = 40_000;
/** Programs PawOS keeps running at once. */
export const MAX_BACKGROUND = 3;
/** How long a newly started program is watched for the address it serves, before PawOS reports back. */
export const BACKGROUND_READY_MS = 30_000;

/** Terminal colour and cursor codes, which a development server prints around its address. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
/** An address on this computer, as a development server prints it. */
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?(?:\/[^\s"'<>)]*)?/i;

export interface BackgroundInfo {
  id: string;
  /** The command as it was shown to the user. */
  display: string;
  cwdRelative: string;
  running: boolean;
  /** Its exit code once it has ended (null while running, or when it was stopped). */
  exitCode: number | null;
  /** The local address it printed, if it printed one. Never guessed. */
  url: string | null;
  startedAt: number;
}

interface BackgroundEntry extends BackgroundInfo {
  child: ChildProcess;
  output: string;
  closed: Promise<void>;
}

export interface BackgroundStart {
  cwd: string;
  cwdRelative: string;
  display: string;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  readyMs?: number;
}

export type BackgroundStarted = { ok: true; info: BackgroundInfo; output: string } | { ok: false; reason: string; cancelled?: boolean };

/**
 * Programs PawOS started and left running — a development server, most of all. They belong to this
 * PawOS session: each is started the same way as any command (no shell, no keyboard, secrets taken
 * out of its environment), its output is kept bounded, and every one of them is stopped — with
 * everything it started — when it is asked to stop or when PawOS exits. Nothing is left behind.
 */
export class BackgroundProcesses {
  private readonly entries = new Map<string, BackgroundEntry>();
  private next = 1;

  private view(entry: BackgroundEntry): BackgroundInfo {
    return { id: entry.id, display: entry.display, cwdRelative: entry.cwdRelative, running: entry.running, exitCode: entry.exitCode, url: entry.url, startedAt: entry.startedAt };
  }

  list(): BackgroundInfo[] {
    return [...this.entries.values()].map((entry) => this.view(entry));
  }

  running(): BackgroundInfo[] {
    return this.list().filter((entry) => entry.running);
  }

  status(id: string): { info: BackgroundInfo; output: string } | null {
    const entry = this.entries.get(id);
    return entry ? { info: this.view(entry), output: entry.output } : null;
  }

  /**
   * Starts a program and leaves it running. Answers once it has printed a local address, has ended,
   * or has been watched for long enough — whichever comes first. An address is only ever one the
   * program printed.
   */
  start(bin: string, args: string[], options: BackgroundStart): Promise<BackgroundStarted> {
    if (this.running().length >= MAX_BACKGROUND) return Promise.resolve({ ok: false, reason: `PawOS is already keeping ${MAX_BACKGROUND} programs running. Stop one first.` });
    if (options.signal?.aborted) return Promise.resolve({ ok: false, reason: "Stopped.", cancelled: true });
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(bin, args, { cwd: options.cwd, env: options.env ?? childEnvironment(), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
      } catch {
        resolve({ ok: false, reason: "It could not be started." });
        return;
      }
      const id = `p${this.next++}`;
      let ended!: () => void;
      const entry: BackgroundEntry = { id, display: options.display, cwdRelative: options.cwdRelative, running: true, exitCode: null, url: null, startedAt: Date.now(), child, output: "", closed: new Promise<void>((done) => (ended = done)) };
      let answered = false;
      let settle: NodeJS.Timeout | undefined;
      let stopping = false;
      const onAbort = () => {
        // Stopped before it was ready: it is not left running — and this only answers once it has
        // really gone (or has been given long enough to), so nothing of it lingers behind the answer.
        stopping = true;
        stopTree(child);
        void Promise.race([entry.closed, new Promise<void>((done) => setTimeout(done, STOP_GRACE_MS))]).then(() => {
          entry.running = false;
          answer({ ok: false, reason: "Stopped.", cancelled: true });
        });
      };
      const watch = setTimeout(() => report(), options.readyMs ?? BACKGROUND_READY_MS);
      function answer(result: BackgroundStarted) {
        if (answered) return;
        answered = true;
        clearTimeout(watch);
        if (settle) clearTimeout(settle);
        options.signal?.removeEventListener("abort", onAbort);
        resolve(result);
      }
      const view = () => this.view(entry);
      function report() {
        answer({ ok: true, info: view(), output: entry.output });
      }
      const take = (data: Buffer) => {
        const next = entry.output + data.toString("utf8").replace(ANSI, "");
        entry.output = next.length > BACKGROUND_OUTPUT_CHARS ? next.slice(-BACKGROUND_OUTPUT_CHARS) : next;
        if (!entry.url) {
          const found = entry.output.match(LOCAL_URL);
          if (found) {
            entry.url = found[0].replace(/[.,;]+$/, "");
            // A moment more, so the lines printed alongside the address are in the report too.
            if (!answered) settle = setTimeout(report, 400);
          }
        }
      };
      child.stdout?.on("data", take);
      child.stderr?.on("data", take);
      child.once("error", (error: NodeJS.ErrnoException) => {
        entry.running = false;
        ended();
        answer({ ok: false, reason: error.code === "ENOENT" ? "That program isn't installed, or isn't on your PATH." : "It could not be started." });
      });
      child.once("close", (code) => {
        entry.running = false;
        entry.exitCode = code;
        ended();
        if (!stopping) report();
      });
      options.signal?.addEventListener("abort", onAbort, { once: true });
      this.entries.set(id, entry);
    });
  }

  /** Stops one program and everything it started. True when there was something to stop. */
  async stop(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry || !entry.running) return false;
    stopTree(entry.child);
    await Promise.race([entry.closed, new Promise<void>((done) => setTimeout(done, STOP_GRACE_MS))]);
    entry.running = false;
    return true;
  }

  /** Stops everything PawOS left running. Answers with what was stopped. */
  async stopAll(): Promise<BackgroundInfo[]> {
    const running = this.running();
    await Promise.all(running.map((entry) => this.stop(entry.id)));
    return running;
  }
}

/** Why PawOS won't open an address in the browser, or null when it may: only pages served from this computer. */
export function localUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "that isn't an address.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "PawOS only opens web pages.";
  if (url.username || url.password) return "the address carries a name or password.";
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return "PawOS only opens pages served from this computer (localhost).";
  return null;
}

/** The operating system's own way of handing an address to the default browser. */
const BROWSER_OPENERS: Record<string, string> = { win32: "explorer.exe", darwin: "open", linux: "xdg-open" };

/**
 * Asks the operating system to open a local address in the default browser. It is only ever called
 * for an address that passed `localUrlProblem`, after the user said yes to that address. All it can
 * report is that the request was made: PawOS cannot see the browser or the page.
 */
export function openInBrowser(url: string, platform: string = process.platform): Promise<{ ok: true } | { ok: false; reason: string }> {
  const program = BROWSER_OPENERS[platform];
  if (!program) return Promise.resolve({ ok: false, reason: "Opening a browser isn't supported on this system." });
  if (localUrlProblem(url)) return Promise.resolve({ ok: false, reason: "PawOS only opens pages served from this computer." });
  return new Promise((resolve) => {
    execFile(program, [url], { windowsHide: true, timeout: 15_000 }, (error) => {
      // Windows' Explorer reports a non-zero exit code even when it has handed the address on.
      const missing = (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
      resolve(missing ? { ok: false, reason: "This system's browser launcher wasn't found." } : { ok: true });
    });
  });
}
