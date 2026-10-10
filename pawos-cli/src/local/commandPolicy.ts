/**
 * What may be run on this computer, and how carefully. Decided here, from the program's name and
 * its arguments alone — nothing PawOS's service sends can mark a command as safe or approved.
 *
 * The first two layers are PawOS Desktop's own command safety (its commandSafety.ts), carried over: an allowlist of programs, and a blanket refusal of anything a
 * shell would read as "run something else". A test in this package fails if the two drift apart.
 * The CLI is stricter than Desktop in one way: a command arrives as a program and a list of
 * arguments and is started that way, so there is never a command line to parse at all.
 *
 * The third layer is the CLI's own: every command is sorted into
 *   auto    a normal development command — in auto mode it runs without a question
 *   ask     always put to the user, in every mode (installs, anything that changes dependencies,
 *           anything forced, and anything not recognised as harmless)
 *   refuse  never run — which includes every Git command that is not a plain read: Git is changed
 *           only through PawOS's own Git tools (local/gitChanges.ts), never through a command line
 */

/** Programs PawOS will start. A subset of Desktop's allowlist: development tools only — no cloud, container, SSH or AI CLIs. */
export const ALLOWED_COMMANDS = ["npm", "npx", "node", "git", "python", "python3", "py", "pip", "pip3", "yarn", "pnpm", "java", "javac"] as const;
export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

export const MAX_ARGS = 64;
export const MAX_ARG_CHARS = 2000;

/**
 * Characters and sequences that mean "run something else" to a shell: chaining (&&, ||, ;, &),
 * piping (|), redirection (>, <), command substitution (`...`, $(...)) and raw line breaks.
 * Desktop's list, in Desktop's order. None of the allowed programs needs any of them.
 */
const DANGEROUS_SHELL_SYNTAX: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /&&/, label: "&&" },
  { pattern: /\|\|/, label: "||" },
  { pattern: /\$\(/, label: "$(" },
  { pattern: /`/, label: "`" },
  { pattern: /;/, label: ";" },
  { pattern: /\|/, label: "|" },
  { pattern: /&/, label: "&" },
  { pattern: />/, label: ">" },
  { pattern: /</, label: "<" },
  { pattern: /[\r\n]/, label: "newline" },
  { pattern: /\0/, label: "null byte" },
];

/** The offending operator if the text holds anything that could chain, pipe, redirect or substitute a second command. */
export function findDangerousShellSyntax(text: string): string | null {
  for (const { pattern, label } of DANGEROUS_SHELL_SYNTAX) if (pattern.test(text)) return label;
  return null;
}

/** Package-manager commands are script files on Windows, which Windows starts through its command interpreter. */
const WINDOWS_SCRIPT_COMMANDS = new Set(["npm", "npx", "yarn", "pnpm"]);

export type Validated = { ok: true; command: AllowedCommand; args: string[] } | { ok: false; reason: string };

/**
 * A program and its arguments, held to the rules. The program is a bare name from the allowlist —
 * never a path, so never an arbitrary executable — and no argument may carry shell syntax.
 */
export function validateCommand(command: unknown, args: unknown, platform: string = process.platform): Validated {
  if (typeof command !== "string") return { ok: false, reason: "a command needs a program to run." };
  const name = command.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) return { ok: false, reason: "the program must be named plainly (for example npm or git), not given as a path or a command line." };
  if (!(ALLOWED_COMMANDS as readonly string[]).includes(name)) return { ok: false, reason: `PawOS doesn't run ${name}. It runs: ${ALLOWED_COMMANDS.join(", ")}.` };
  const list = args === undefined ? [] : args;
  if (!Array.isArray(list) || list.some((arg) => typeof arg !== "string")) return { ok: false, reason: "a command's arguments must be a list of separate strings." };
  if (list.length > MAX_ARGS) return { ok: false, reason: `a command takes at most ${MAX_ARGS} arguments.` };
  for (const arg of list as string[]) {
    if (arg.length > MAX_ARG_CHARS) return { ok: false, reason: "an argument is too long." };
    const dangerous = findDangerousShellSyntax(arg);
    if (dangerous) return { ok: false, reason: `an argument contains "${dangerous}", which could chain, pipe, redirect or substitute a second command. Run one plain command at a time.` };
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(arg)) return { ok: false, reason: "an argument contains a control character." };
    // Where Windows' command interpreter is involved, nothing it would expand or re-quote is let through.
    if (platform === "win32" && WINDOWS_SCRIPT_COMMANDS.has(name) && /[%^"]/.test(arg)) return { ok: false, reason: 'an argument contains %, ^ or ", which Windows would interpret. Leave them out.' };
  }
  return { ok: true, command: name as AllowedCommand, args: [...(list as string[])] };
}

export type CommandLevel = "auto" | "ask" | "refuse";
export interface Classified {
  level: CommandLevel;
  /** Why it is always asked about, or why it is refused. Null for a normal development command. */
  reason: string | null;
}

const AUTO: Classified = { level: "auto", reason: null };
const ask = (reason: string): Classified => ({ level: "ask", reason });
const refuse = (reason: string): Classified => ({ level: "refuse", reason });

const INSTALLS = "It can install, remove or change this project's dependencies.";
const UNKNOWN = "PawOS doesn't recognise this as a routine development command.";
/** The answer to any Git command that isn't a plain read. It says where Git changes are made instead. */
export const GIT_MUTATION_REFUSED = "run_command only reads from Git (status, diff, log, show and the like). Changes to the repository are made with PawOS's Git tools: git_add, git_commit, git_branch, git_checkout and git_push. Forcing, resetting, cleaning, merging, rebasing, pulling and rewriting history are not available.";
const CHANGES_GIT = GIT_MUTATION_REFUSED;
const RUNS_CODE = "It runs code given on the command line.";
const FORCED = "It forces something that is normally checked.";

/** The first argument that isn't a flag: the subcommand. */
const subcommand = (args: string[]): { name: string; rest: string[] } => {
  const index = args.findIndex((arg) => !arg.startsWith("-"));
  return index < 0 ? { name: "", rest: [] } : { name: args[index]!.toLowerCase(), rest: args.slice(index + 1) };
};
const onlyVersion = (args: string[]) => args.length === 1 && /^(--version|-v|-V|-version|version)$/.test(args[0]!);
const FORCE_FLAG = /^(--force|-f|--force-with-lease|--hard|--no-verify|--legacy-peer-deps|--ignore-scripts=false|--unsafe-perm|--yes|-y)$/i;

const GIT_READS = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "describe", "blame", "shortlog", "version", "whatchanged"]);
const NPX_TOOLS = new Set(["tsc", "vitest", "jest", "eslint", "mocha", "prettier"]);

function scriptRun(rest: string[]): Classified {
  const script = rest.find((arg) => !arg.startsWith("-"));
  // "env" is not a project script: it prints the whole environment.
  if (script && script.toLowerCase() === "env") return refuse("it prints environment variables.");
  return AUTO;
}

/**
 * How carefully a validated command is treated. Anything not known to be a routine development
 * command is always put to the user — the list of what runs unasked is short on purpose.
 */
export function classifyCommand(command: AllowedCommand, args: string[]): Classified {
  const verdict = classifyByProgram(command, args);
  // A routine command with a force flag is no longer routine.
  if (verdict.level === "auto" && args.some((arg) => FORCE_FLAG.test(arg))) return ask(FORCED);
  return verdict;
}

function classifyByProgram(command: AllowedCommand, args: string[]): Classified {
  if (onlyVersion(args)) return AUTO;
  const { name, rest } = subcommand(args);

  switch (command) {
    case "git": {
      // Options that point Git somewhere else, or let the command line define what Git runs.
      // Git's own options come before the subcommand; after it, -c and the like belong to the subcommand.
      const first = args.findIndex((arg) => !arg.startsWith("-"));
      for (const arg of first < 0 ? args : args.slice(0, first)) {
        if (arg === "-C" || arg === "-c" || /^(--git-dir|--work-tree|--exec-path|--config-env|--namespace|--super-prefix)(=|$)/.test(arg)) return refuse("it points Git outside this project or changes what Git runs.");
      }
      // Options that make a reading command write a file or start another program.
      if (args.some((arg) => /^(--output|--ext-diff|--textconv|--exec|--upload-pack|--receive-pack|--open-files-in-pager|-O)(=|$)/.test(arg))) return refuse("that option makes Git write a file or run another program.");
      if (GIT_READS.has(name)) return AUTO;
      // Listing only: with a name, or a flag that creates, moves or deletes, these change the repository.
      if (name === "branch") return rest.every((arg) => /^(-a|-r|-v|-vv|--all|--remotes|--list|--show-current|--verbose|--no-color)$/.test(arg)) ? AUTO : refuse(CHANGES_GIT);
      if (name === "remote") return rest.length === 0 || (rest.length === 1 && /^(-v|--verbose)$/.test(rest[0]!)) ? AUTO : refuse(CHANGES_GIT);
      if (name === "tag") return rest.length === 0 || rest.every((arg) => /^(-l|--list)$/.test(arg)) ? AUTO : refuse(CHANGES_GIT);
      if (name === "stash") return rest.length === 1 && rest[0] === "list" ? AUTO : refuse(CHANGES_GIT);
      // Everything else — add, commit, push, pull, checkout, switch, reset, clean, restore, merge,
      // rebase, cherry-pick and whatever Git adds next — is not a read, so it is not run here.
      return refuse(CHANGES_GIT);
    }
    case "npm": {
      if (args.some((arg) => /^(-g|--global|--location(=|$)|--prefix(=|$)|-C$)/.test(arg))) return ask("It works outside this project's own folder.");
      if (/^(test|t|tst)$/.test(name)) return AUTO;
      if (/^(run|run-script|rum|urn)$/.test(name)) return scriptRun(rest);
      if (/^(ls|list|ll|la)$/.test(name)) return AUTO;
      if (name === "env") return refuse("it prints environment variables.");
      if (/^(install|i|in|ins|inst|insta|instal|isnt|isnta|isntal|isntall|add|ci|clean-install|install-clean|ic|install-test|it|install-ci-test|cit|uninstall|un|unlink|remove|rm|r|update|up|upgrade|udpate|dedupe|ddp|prune|link|ln|rebuild|rb|audit|exec|x|init|create|innit)$/.test(name)) return ask(INSTALLS);
      return ask(UNKNOWN);
    }
    case "yarn":
    case "pnpm": {
      if (args.some((arg) => /^(-g|--global|--cwd(=|$)|--dir(=|$)|-C$|--prefix(=|$))/.test(arg))) return ask("It works outside this project's own folder.");
      if (/^(test|t)$/.test(name)) return AUTO;
      if (/^(run|run-script)$/.test(name)) return scriptRun(rest);
      if (name === "env") return refuse("it prints environment variables.");
      if (/^(install|i|add|remove|rm|uninstall|un|up|update|upgrade|upgrade-interactive|dedupe|prune|link|unlink|rebuild|import|dlx|exec|create|init|patch|patch-commit|audit|global|set|policies)$/.test(name) || name === "") return ask(INSTALLS);
      return ask(UNKNOWN);
    }
    case "npx": {
      // Without --no-install npx may fetch a package from the network and run it.
      const offline = args.some((arg) => arg === "--no-install" || arg === "--no");
      if (offline && NPX_TOOLS.has(name) && !(name === "prettier" && rest.some((arg) => /^(--write|-w)$/.test(arg))) && !rest.some((arg) => /^--fix/.test(arg))) return AUTO;
      return ask("npx can download a package and run it.");
    }
    case "node":
      if (args[0] === "--test") return AUTO;
      if (args.some((arg) => /^(-e|--eval|-p|--print|-r|--require|--import|-i|--interactive)$/.test(arg))) return ask(RUNS_CODE);
      return ask(args.length === 0 ? "It would start an interactive session." : "It runs a program from this project.");
    case "python":
    case "python3":
    case "py":
      if (args[0] === "-m" && /^(pytest|unittest)$/.test(args[1] ?? "")) return AUTO;
      if (args.includes("-c")) return ask(RUNS_CODE);
      return ask(args.length === 0 ? "It would start an interactive session." : "It runs a program from this project.");
    case "pip":
    case "pip3":
      if (/^(list|show|freeze|check)$/.test(name)) return AUTO;
      if (/^(install|uninstall|download|wheel)$/.test(name)) return ask(INSTALLS);
      return ask(UNKNOWN);
    case "java":
    case "javac":
      return ask("It compiles or runs a program from this project.");
  }
}

/** A command as the user is shown it: the program and its arguments, quoted only where an argument has a space. */
export function displayCommand(command: string, args: string[]): string {
  // eslint-disable-next-line no-control-regex
  const shown = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, "");
  return [command, ...args.map((arg) => (arg === "" || /\s/.test(arg) ? `"${shown(arg)}"` : shown(arg)))].join(" ");
}
