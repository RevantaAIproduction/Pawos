import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AGENT_CLIENT_LIMITS, toolRisk, type ToolCall, type ToolResult } from "../shared";
import { classifyCommand, displayCommand, validateCommand, type AllowedCommand } from "./commandPolicy";
import { runProcess, secretValues, type ProcessOptions, type ProcessOutcome } from "./process";
import { resolveInside, secretReason, type Workspace } from "./workspace";

/**
 * The local tools that run a program: run_command, run_tests and build.
 *
 * Like a change to a file, a command happens in two steps.
 *   prepareCommand  checks everything and works out exactly what would run and where — without
 *                   running anything. It answers with a plan the user can read, or a refusal.
 *   runPlanned      runs that plan. The loop calls it only once the plan has been allowed
 *                   (local/agent.ts): by the user, or — for a routine development command in auto
 *                   mode only — by the mode the user chose.
 *
 * Everything the service sent is treated as untrusted here: the program, each argument and the
 * folder are all checked again, and how carefully a command is treated is decided in
 * local/commandPolicy.ts from the command itself.
 */

const LIMITS = AGENT_CLIENT_LIMITS;
/** PawOS Desktop's own limits: 45 seconds for a command (shellExec.ts), five minutes for a build (BuildProjectPlugin.ts). */
export const COMMAND_TIMEOUT_MS = 45_000;
export const BUILD_TIMEOUT_MS = 5 * 60 * 1000;
export const TEST_TIMEOUT_MS = 5 * 60 * 1000;
/** Characters of a command's output sent to PawOS: the end of what it printed, and the end of its errors. */
const STDOUT_SENT = 11_000;
const STDERR_SENT = 6_000;

export interface CommandPlan {
  tool: "run_command" | "run_tests" | "build";
  bin: AllowedCommand;
  args: string[];
  /** The command as shown to the user and reported to PawOS: the program and its arguments. */
  display: string;
  /** The folder it runs in: a real location inside the project. Shown to the user; never sent. */
  cwd: string;
  /** The same folder as a path inside the project ("." for its top). */
  cwdRelative: string;
  /** auto: a routine development command. ask: always put to the user, whatever the mode. */
  level: "auto" | "ask";
  /** Why it is always asked about. */
  reason: string | null;
  timeoutMs: number;
}

export type PreparedCommand = { ok: true; plan: CommandPlan } | { ok: false; result: ToolResult };

const failed = (call: ToolCall, reason: string): PreparedCommand => ({ ok: false, result: { id: call.id, ok: false, output: reason } });
const denied = (call: ToolCall, reason: string): PreparedCommand => ({ ok: false, result: { id: call.id, ok: false, denied: true, output: `Not allowed: ${reason}` } });

function inside(root: string, target: string): string | null {
  const relative = path.relative(root, target);
  if (relative === "") return "";
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : relative;
}

/**
 * Whether an argument names somewhere a command must not go: outside the project, or a file that
 * holds secrets. Every argument is looked at as a possible path, along with the value after "="
 * (--out=…) and after ":" (Git's revision:path). It is a refusal, not a rewrite.
 */
function argumentProblem(arg: string, cwd: string, workspace: Workspace): string | null {
  const pieces = new Set<string>([arg]);
  const equals = arg.indexOf("=");
  if (arg.startsWith("-") && equals > 0) pieces.add(arg.slice(equals + 1));
  // A file: address is a path by another name.
  if (/file:/i.test(arg)) return "an argument is a file address. Name files in this project by their path.";
  const colon = arg.lastIndexOf(":");
  // Not for an address (https://…): what follows its colon is a host, not a path.
  if (colon > 1 && !arg.includes("://")) pieces.add(arg.slice(colon + 1));
  for (const piece of pieces) {
    if (piece === "" || /^[a-z][a-z0-9+.-]*:\/\//i.test(piece)) continue; // nothing, or an address (https://…)
    if (piece.startsWith("~")) return "an argument points at your home folder, outside this project.";
    const absolute = path.isAbsolute(piece) || path.win32.isAbsolute(piece) || /^[A-Za-z]:/.test(piece);
    const climbs = piece.split(/[\\/]/).includes("..");
    const resolved = path.resolve(cwd, piece);
    const relative = inside(workspace.root, resolved);
    if (relative === null) {
      // Only something written as a path can point outside; a plain word can't.
      if (absolute || climbs) return "an argument points outside this project.";
      continue;
    }
    if (relative !== "" && secretReason(relative)) return "an argument names a protected file. Secrets are never given to a command.";
    // Where it exists, it is checked where it really is: a link can't lead a command out of the project.
    let real: string;
    try {
      real = fs.realpathSync.native(resolved);
    } catch {
      continue;
    }
    const realRelative = inside(workspace.root, real);
    if (realRelative === null) return "an argument is a link that leads outside this project.";
    if (realRelative !== "" && secretReason(realRelative)) return "an argument names a protected file. Secrets are never given to a command.";
  }
  return null;
}

/** The folder a command runs in: inside the project, real, and a folder. Never taken on the service's word. */
function resolveCwd(workspace: Workspace, requested: string): { ok: true; cwd: string; relative: string } | { ok: false; reason: string } {
  const where = resolveInside(workspace, requested);
  if (!where.ok) return { ok: false, reason: `the folder to run in can't be used. ${where.reason}` };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(where.absolute);
  } catch {
    return { ok: false, reason: "the folder to run in doesn't exist." };
  }
  if (!stat.isDirectory()) return { ok: false, reason: "the place to run in is a file, not a folder." };
  return { ok: true, cwd: where.absolute, relative: where.relative === "" ? "." : where.relative };
}

/** The project's package manager, from the lockfile it keeps. npm when there is none. */
function packageManager(cwd: string, root: string): "npm" | "yarn" | "pnpm" {
  for (const folder of cwd === root ? [root] : [cwd, root]) {
    if (fs.existsSync(path.join(folder, "pnpm-lock.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(folder, "yarn.lock"))) return "yarn";
  }
  return "npm";
}

/** A script the project defines in its package.json, or why there isn't one. Never invented. */
function projectScript(cwd: string, name: "test" | "build"): { ok: true } | { ok: false; reason: string } {
  const file = path.join(cwd, "package.json");
  let scripts: unknown;
  try {
    if (fs.statSync(file).size > LIMITS.fileBytes) return { ok: false, reason: "This folder's package.json is too large to read." };
    scripts = (JSON.parse(fs.readFileSync(file, "utf8")) as { scripts?: unknown }).scripts;
  } catch {
    return { ok: false, reason: `There is no readable package.json in this folder, so PawOS doesn't know this project's ${name} command. Use run_command for another tool.` };
  }
  const script = scripts && typeof scripts === "object" ? (scripts as Record<string, unknown>)[name] : undefined;
  if (typeof script !== "string" || !script.trim()) return { ok: false, reason: `This project's package.json defines no "${name}" script.` };
  // What `npm init` puts there: a stub that only fails.
  if (name === "test" && /no test specified/i.test(script)) return { ok: false, reason: 'This project\'s "test" script is the stub npm creates; it has no tests to run.' };
  return { ok: true };
}

/**
 * Works out exactly what a command step would run, without running it. Refused here: a program
 * that isn't on the list, shell syntax, a folder or an argument outside the project, a protected
 * file, and anything the policy never runs.
 */
export function prepareCommand(call: ToolCall, workspace: Workspace): PreparedCommand {
  if (toolRisk(call.name) !== "execute") return denied(call, "that isn't a tool that runs a program.");
  const where = resolveCwd(workspace, typeof call.args.cwd === "string" ? call.args.cwd : "");
  if (!where.ok) return denied(call, where.reason);

  let command: unknown = call.args.command;
  let args: unknown = call.args.args;
  let timeoutMs = COMMAND_TIMEOUT_MS;
  if (call.name === "run_tests" || call.name === "build") {
    const script = projectScript(where.cwd, call.name === "build" ? "build" : "test");
    if (!script.ok) return failed(call, script.reason);
    command = packageManager(where.cwd, workspace.root);
    args = call.name === "build" ? ["run", "build"] : ["test"];
    timeoutMs = call.name === "build" ? BUILD_TIMEOUT_MS : TEST_TIMEOUT_MS;
  }

  const valid = validateCommand(command, args);
  if (!valid.ok) return denied(call, valid.reason);
  for (const arg of valid.args) {
    const problem = argumentProblem(arg, where.cwd, workspace);
    if (problem) return denied(call, problem);
  }
  const verdict = classifyCommand(valid.command, valid.args);
  if (verdict.level === "refuse") return denied(call, verdict.reason ?? "PawOS doesn't run that.");
  // A test or build run through the package manager can take as long as one.
  if (call.name === "run_command" && /^(npm|yarn|pnpm|npx)$/.test(valid.command) && verdict.level === "auto") timeoutMs = TEST_TIMEOUT_MS;
  return {
    ok: true,
    plan: { tool: call.name as CommandPlan["tool"], bin: valid.command, args: valid.args, display: displayCommand(valid.command, valid.args), cwd: where.cwd, cwdRelative: where.relative, level: verdict.level, reason: verdict.reason, timeoutMs },
  };
}

/** Git commands that print the contents of files: they are told to leave protected files out. */
const GIT_PRINTS_FILES = new Set(["diff", "show", "log", "whatchanged"]);
const GIT_SECRET_EXCLUDES = ["**/.env", "**/.env.*", "**/*.env", "**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx", "**/*.jks", "**/*.keystore", "**/id_rsa*", "**/id_dsa*", "**/id_ecdsa*", "**/id_ed25519*", "**/.npmrc", "**/.netrc", "**/.pypirc", "**/.git-credentials", "**/credentials", "**/credentials.json", "**/secrets.*", "**/*.tfstate", "**/*.tfvars"].flatMap((glob) => [`:(top,exclude,glob)${glob.replace(/^\*\*\//, "")}`, `:(top,exclude,glob)${glob}`]);

/** The arguments a plan is really started with. For Git commands that print file contents, protected files are excluded. */
export function startArguments(plan: CommandPlan): string[] {
  if (plan.bin !== "git") return plan.args;
  const sub = plan.args.find((arg) => !arg.startsWith("-"));
  if (!sub || !GIT_PRINTS_FILES.has(sub.toLowerCase())) return plan.args;
  // After "--" come the paths: everything, minus what PawOS never reads.
  return plan.args.includes("--") ? [...plan.args, ...GIT_SECRET_EXCLUDES] : [...plan.args, "--", ":(top)", ...GIT_SECRET_EXCLUDES];
}

/**
 * What a program printed, made fit to leave this computer: secrets from the environment blanked
 * out, and the project's location and the home folder replaced by "." and "~".
 */
export function scrubOutput(text: string, workspace: Workspace, secrets: string[] = secretValues(), home: string = os.homedir()): string {
  let cleaned = text;
  for (const secret of secrets) cleaned = cleaned.split(secret).join("[hidden]");
  const places: [string, string][] = [[workspace.root, "."], [home, "~"]];
  for (const [place, shown] of places) {
    if (!place || place.length < 4) continue;
    for (const form of new Set([place, place.replace(/\\/g, "/"), place.replace(/\\/g, "\\\\")])) {
      // Windows paths are matched whatever their case.
      const pattern = new RegExp(form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), process.platform === "win32" ? "gi" : "g");
      cleaned = cleaned.replace(pattern, shown);
    }
  }
  return cleaned;
}

export interface TestSummary {
  status: "passed" | "failed";
  passed?: number;
  failed?: number;
  total?: number;
}

/**
 * The summary line of a test run, when one is recognised (PawOS Desktop's TestResultParser, carried
 * over). Counts are never made up: with no recognised line, only the exit code speaks.
 */
export function parseTestOutput(output: string, exitCode: number | null): TestSummary {
  // Jest: "Tests:       2 failed, 8 passed, 10 total"
  const jest = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/i);
  if (jest) {
    const failed = jest[1] ? Number(jest[1]) : 0;
    return { status: failed > 0 || exitCode !== 0 ? "failed" : "passed", passed: jest[2] ? Number(jest[2]) : 0, failed, total: Number(jest[3]) };
  }
  // Vitest: "Tests  2 failed | 8 passed (10)"
  const vitest = output.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|[^(\n]*)?\s*\((\d+)\)/i);
  if (vitest) {
    const failed = vitest[1] ? Number(vitest[1]) : 0;
    return { status: failed > 0 || exitCode !== 0 ? "failed" : "passed", passed: Number(vitest[2]), failed, total: Number(vitest[3]) };
  }
  // Mocha: "10 passing" / "2 failing"
  const passing = output.match(/(\d+)\s+passing/i);
  const failing = output.match(/(\d+)\s+failing/i);
  if (passing || failing) {
    const passed = passing ? Number(passing[1]) : 0;
    const failed = failing ? Number(failing[1]) : 0;
    return { status: failed > 0 || exitCode !== 0 ? "failed" : "passed", passed, failed, total: passed + failed };
  }
  // pytest: "5 passed, 1 failed in 2.34s" / "5 passed in 1.2s"
  const pytest = output.match(/(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?in\s+[\d.]+s/i);
  if (pytest && (pytest[1] || pytest[2])) {
    const failed = pytest[1] ? Number(pytest[1]) : 0;
    const passed = pytest[2] ? Number(pytest[2]) : 0;
    return { status: failed > 0 || exitCode !== 0 ? "failed" : "passed", passed, failed, total: passed + failed };
  }
  return { status: exitCode === 0 ? "passed" : "failed" };
}

const tail = (text: string, keep: number): { text: string; cut: boolean } => (text.length > keep ? { text: text.slice(-keep), cut: true } : { text, cut: false });

export interface CommandEnvironment {
  signal?: AbortSignal;
  /** Starts the program (tests replace it to see exactly what would be started). */
  run?: (bin: string, args: string[], options: ProcessOptions) => Promise<ProcessOutcome>;
}

/**
 * Runs an allowed plan and reports what happened: the exit code, whether it was stopped, and the
 * end of what it printed — bounded, scrubbed, and never including this computer's environment.
 */
export async function runPlanned(call: ToolCall, plan: CommandPlan, workspace: Workspace, environment: CommandEnvironment = {}): Promise<ToolResult> {
  const outcome = await (environment.run ?? runProcess)(plan.bin, startArguments(plan), { cwd: plan.cwd, timeoutMs: plan.timeoutMs, signal: environment.signal });
  const header = `$ ${plan.display}   (in ${plan.cwdRelative})`;
  if (outcome.failedToStart) return { id: call.id, ok: false, output: `${header}\n${plan.bin} could not be run. ${outcome.failedToStart}`, exitCode: null };

  const out = tail(scrubOutput(outcome.stdout, workspace).trimEnd(), STDOUT_SENT);
  const err = tail(scrubOutput(outcome.stderr, workspace).trimEnd(), STDERR_SENT);
  const seconds = Math.round(plan.timeoutMs / 1000);
  const ended = outcome.cancelled
    ? "Stopped by the user (Ctrl+C) before it finished."
    : outcome.timedOut
      ? `Stopped: it was still running after ${seconds} seconds.`
      : outcome.exitCode === null
        ? `Ended by signal ${outcome.signal ?? "unknown"}.`
        : `Exit code ${outcome.exitCode}.`;
  const lines = [header, ended];
  if (plan.tool === "run_tests" && !outcome.cancelled && !outcome.timedOut) {
    const tests = parseTestOutput(`${outcome.stdout}\n${outcome.stderr}`, outcome.exitCode);
    lines.push(tests.total !== undefined ? `Tests ${tests.status}: ${tests.passed} passed, ${tests.failed} failed, ${tests.total} in all.` : `Tests ${tests.status} (by exit code; no summary line was recognised).`);
  }
  if (out.text) lines.push(`--- output${out.cut ? " (the end of it)" : ""} ---`, out.text);
  if (err.text) lines.push(`--- errors${err.cut ? " (the end of them)" : ""} ---`, err.text);
  if (!out.text && !err.text) lines.push("(it printed nothing)");
  const truncated = outcome.truncated || out.cut || err.cut;
  return {
    id: call.id,
    ok: outcome.exitCode === 0 && !outcome.timedOut && !outcome.cancelled,
    output: lines.join("\n"),
    exitCode: outcome.exitCode,
    ...(outcome.signal ? { signal: outcome.signal } : {}),
    ...(truncated ? { truncated: true } : {}),
    ...(outcome.timedOut ? { timedOut: true } : {}),
    ...(outcome.cancelled ? { cancelled: true } : {}),
  };
}
