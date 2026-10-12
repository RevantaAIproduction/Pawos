/**
 * The contract between PawOS's service and a client that works on a project on the user's own
 * computer (the PawOS CLI's local mode). This is the service's copy; the clients' copy is
 * pawos-shared/src/agent/protocol.ts, and a test in the CLI fails if the two tool lists differ.
 *
 * The service does the thinking and names ONE tool per turn; the client runs it locally and sends
 * the result back. The service never runs anything on the user's machine.
 */

/** Reading, changing files, running development commands, and a fixed set of Git operations. */
export const AGENT_TOOL_NAMES = ["list_files", "read_file", "search_files", "git_status", "git_diff", "git_log", "write_file", "edit_file", "delete_path", "run_command", "run_tests", "build", "git_add", "git_commit", "git_branch", "git_checkout", "git_push", "start_process", "stop_process", "process_status", "open_browser", "finish"] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export function isAgentToolName(name: unknown): name is AgentToolName {
  return typeof name === "string" && (AGENT_TOOL_NAMES as readonly string[]).includes(name);
}

export type ToolArgValue = string | number | boolean | string[];

export interface ToolCall {
  id: string;
  name: AgentToolName;
  args: Record<string, ToolArgValue>;
}

export interface ToolResult {
  id: string;
  ok: boolean;
  output: string;
  truncated?: boolean;
  denied?: boolean;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
  cancelled?: boolean;
}

/** What the client says about the project up front: names only, never file contents. */
export interface WorkspaceInfo {
  name: string;
  branch: string | null;
  files: string[];
  filesTruncated: boolean;
}

export type LocalTaskTurn = { kind: "tool"; call: ToolCall; note: string | null } | { kind: "finish"; summary: string };

const ARGS: Record<AgentToolName, Record<string, { type: "string" | "number" | "boolean" | "strings"; required?: boolean; max?: number; empty?: boolean; maxItems?: number }>> = {
  list_files: { path: { type: "string", max: 400 } },
  read_file: { path: { type: "string", required: true, max: 400 }, startLine: { type: "number" } },
  search_files: { query: { type: "string", required: true, max: 200 }, path: { type: "string", max: 400 } },
  git_status: {},
  git_diff: { path: { type: "string", max: 400 }, staged: { type: "boolean" } },
  git_log: { limit: { type: "number" } },
  // A whole file's new contents. Text only; an empty file is allowed.
  write_file: { path: { type: "string", required: true, max: 400 }, content: { type: "string", required: true, max: 200_000, empty: true } },
  // A structured edit: this exact text, replaced by that text. Never an instruction to run.
  edit_file: { path: { type: "string", required: true, max: 400 }, oldText: { type: "string", required: true, max: 60_000 }, newText: { type: "string", required: true, max: 60_000, empty: true }, replaceAll: { type: "boolean" } },
  delete_path: { path: { type: "string", required: true, max: 400 } },
  // One program and its arguments, as a list. Never a line for a shell to interpret.
  run_command: { command: { type: "string", required: true, max: 64 }, args: { type: "strings", max: 2000, maxItems: 64 }, cwd: { type: "string", max: 400 } },
  // The project's own test and build scripts: the client works out the command, not the model.
  run_tests: { cwd: { type: "string", max: 400 } },
  build: { cwd: { type: "string", max: 400 } },
  // Git operations with typed inputs. There is nowhere to put a flag: the client builds the command.
  git_add: { paths: { type: "strings", required: true, max: 400, maxItems: 100 } },
  git_commit: { message: { type: "string", required: true, max: 2000 } },
  git_branch: { name: { type: "string", required: true, max: 200 } },
  git_checkout: { branch: { type: "string", required: true, max: 200 }, create: { type: "boolean" } },
  git_push: { remote: { type: "string", max: 100 } },
  // A program that keeps running (a development server): started like a command, then left running.
  start_process: { command: { type: "string", required: true, max: 64 }, args: { type: "strings", max: 2000, maxItems: 64 }, cwd: { type: "string", max: 400 } },
  stop_process: { id: { type: "string", required: true, max: 16 } },
  process_status: { id: { type: "string", required: true, max: 16 } },
  // A page served from the user's own computer, opened in their browser. The client refuses anything else.
  open_browser: { url: { type: "string", required: true, max: 300 } },
  finish: { summary: { type: "string", required: true, max: 8000 } },
};

/** The model's choice of tool, checked against the contract. Unknown tools and malformed arguments are refused, not repaired. */
export function toolArgs(name: AgentToolName, raw: unknown): Record<string, ToolArgValue> | null {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const args: Record<string, ToolArgValue> = {};
  for (const [key, rule] of Object.entries(ARGS[name])) {
    const arg = given[key];
    if (arg === undefined || arg === null) {
      if (rule.required) return null;
      continue;
    }
    if (rule.type === "strings") {
      if (!Array.isArray(arg) || arg.length > (rule.maxItems ?? 64) || (rule.required && arg.length === 0)) return null;
      if (arg.some((item) => typeof item !== "string" || (rule.max !== undefined && item.length > rule.max) || item.includes("\0"))) return null;
      args[key] = [...(arg as string[])];
      continue;
    }
    if (typeof arg !== rule.type) return null;
    if (typeof arg === "number" && !Number.isFinite(arg)) return null;
    if (typeof arg === "string") {
      if ((rule.required && !rule.empty && !arg.trim()) || (rule.max !== undefined && arg.length > rule.max) || arg.includes("\0")) return null;
    }
    args[key] = arg as ToolArgValue;
  }
  return args;
}

/** The service's ceilings on what a client may send it for one task. */
export const AGENT_SERVER_LIMITS = {
  goalChars: 4000,
  workspaceFiles: 500,
  pathChars: 400,
  /** Characters of one tool result the service keeps. */
  resultChars: 24_000,
  /** Characters of results kept for one task in total; older results are shortened past this. */
  transcriptChars: 220_000,
  /** Steps the model may take for one task. */
  turns: 60,
  /** A task that goes quiet is forgotten after this. */
  idleMs: 30 * 60 * 1000,
  /** Tasks one account may have in progress. */
  tasksPerAccount: 4,
} as const;

const TASK_ID = /^[A-Za-z0-9-]{8,64}$/;
const RESULT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** What a client says about a command it ran: only these fields, only in these shapes. */
function commandFacts(result: Record<string, unknown>): Pick<ToolResult, "exitCode" | "signal" | "timedOut" | "cancelled"> {
  const exitCode = result.exitCode;
  return {
    ...(exitCode === null || (typeof exitCode === "number" && Number.isInteger(exitCode)) ? { exitCode } : {}),
    ...(typeof result.signal === "string" && /^[A-Z0-9]{1,16}$/.test(result.signal) ? { signal: result.signal } : {}),
    ...(result.timedOut === true ? { timedOut: true } : {}),
    ...(result.cancelled === true ? { cancelled: true } : {}),
  };
}

export type ParsedTurnRequest =
  | { ok: true; kind: "start"; taskId: string; goal: string; workspace: WorkspaceInfo }
  | { ok: true; kind: "result"; taskId: string; result: ToolResult }
  | { ok: false; message: string };

/** A turn request exactly as the contract allows it. Anything else is refused with a plain reason. */
export function parseTurnRequest(raw: unknown): ParsedTurnRequest {
  const limits = AGENT_SERVER_LIMITS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "The request wasn't understood." };
  const body = raw as Record<string, unknown>;
  if (typeof body.taskId !== "string" || !TASK_ID.test(body.taskId)) return { ok: false, message: "The request needs a task id." };

  if (body.result !== undefined) {
    if (body.goal !== undefined || body.workspace !== undefined) return { ok: false, message: "Send either a new task or a tool result, not both." };
    const result = body.result as Record<string, unknown> | null;
    if (!result || typeof result !== "object" || typeof result.id !== "string" || !RESULT_ID.test(result.id) || typeof result.ok !== "boolean" || typeof result.output !== "string") {
      return { ok: false, message: "The tool result wasn't understood." };
    }
    const cut = result.output.length > limits.resultChars;
    return {
      ok: true,
      kind: "result",
      taskId: body.taskId,
      result: { id: result.id, ok: result.ok, output: cut ? result.output.slice(0, limits.resultChars) : result.output, ...(cut || result.truncated === true ? { truncated: true } : {}), ...(result.denied === true ? { denied: true } : {}), ...commandFacts(result) },
    };
  }

  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal || goal.length > limits.goalChars) return { ok: false, message: `Describe the task in up to ${limits.goalChars.toLocaleString("en-US")} characters.` };
  const workspace = body.workspace as Record<string, unknown> | null;
  if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) return { ok: false, message: "The request needs the project it is about." };
  const name = typeof workspace.name === "string" ? workspace.name.trim().slice(0, 120) : "";
  if (!name || /[\\/]/.test(name)) return { ok: false, message: "The project's name wasn't understood." };
  const branch = typeof workspace.branch === "string" && workspace.branch.trim() ? workspace.branch.trim().slice(0, 200) : null;
  if (!Array.isArray(workspace.files) || workspace.files.length > limits.workspaceFiles) return { ok: false, message: "The project's file list is too long." };
  const files: string[] = [];
  for (const file of workspace.files) {
    // Relative paths inside the project only: never an absolute path, a drive, or a way out of it.
    if (typeof file !== "string" || !file || file.length > limits.pathChars || file.includes("\0") || /^([A-Za-z]:|[\\/])/.test(file) || file.split(/[\\/]/).includes("..")) {
      return { ok: false, message: "The project's file list wasn't understood." };
    }
    files.push(file);
  }
  return { ok: true, kind: "start", taskId: body.taskId, goal, workspace: { name, branch, files, filesTruncated: workspace.filesTruncated === true } };
}
