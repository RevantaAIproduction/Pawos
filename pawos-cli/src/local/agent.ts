import { AGENT_CLIENT_LIMITS, parseToolCall, toolRisk, type AgentTurnRequest, type AgentTurnResponse, type ToolCall, type ToolResult } from "../shared";
import { applyChange, prepareChange, type Proposal } from "./changes";
import { TaskCheckpoint } from "./checkpoint";
import { prepareGit, type GitEnvironment, type GitPlan, type PreparedGit } from "./gitChanges";
import { prepareCommand, runPlanned, type CommandEnvironment, type CommandPlan } from "./commands";
import { executeTool, type ToolEnvironment } from "./tools";
import { listFiles, type Workspace } from "./workspace";

/**
 * One task done on this computer.
 *
 * PawOS's service thinks; this loop does. Each turn the service names ONE tool, the loop runs it in
 * the project and sends back what it produced, until the service says it has finished. The CLI
 * never talks to a model and holds no model key; the service never touches this computer.
 *
 * A step that changes the project is never just run. The loop works out what it would do, hands
 * that to `approve` — the user — and makes the change only on a yes. With no one to ask, the
 * answer is no. What the user decided goes back to the service as the step's result.
 *
 * The loop does not take the service's word for anything that matters here. A step is checked
 * against the fixed tool list again, its risk is decided locally, and the limits below are the
 * CLI's own: how many steps, how much of the project may leave this computer for one task, and how
 * long the task may take. The task stops the moment the user presses Ctrl+C.
 */
export interface LocalStep {
  call: ToolCall;
  note: string | null;
  result: ToolResult | null;
  /** Set when this step changed the project: what was done, and to which path. */
  change?: { operation: Proposal["operation"]; relative: string; /** A recovery copy was kept, so /undo can take this back. */ recoverable: boolean };
  /** Set when this step changed the Git repository: which operation, and a few words on it. */
  git?: { tool: GitPlan["tool"]; summary: string };
  /** Set when this step ran a program: the command as shown, and how it ended. */
  command?: { tool: CommandPlan["tool"]; display: string; exitCode: number | null; timedOut: boolean; cancelled: boolean };
}

export type LocalOutcome =
  | { status: "finished"; summary: string; steps: LocalStep[] }
  | { status: "cancelled"; steps: LocalStep[] }
  /** The CLI's own limit ended the task (too many steps, too long). */
  | { status: "stopped"; reason: string; steps: LocalStep[] }
  /** PawOS refused or could not answer: `error` is what it said (a PawosApiError when it answered). */
  | { status: "failed"; error: unknown; steps: LocalStep[] };

export interface LocalTaskOptions {
  client: { agentTurn(body: AgentTurnRequest): Promise<AgentTurnResponse> };
  workspace: Workspace;
  branch: string | null;
  taskId: string;
  goal: string;
  signal?: AbortSignal;
  /** Called as each step starts and again when it has its result. */
  onStep?: (steps: LocalStep[]) => void;
  now?: () => number;
  /**
   * Asked before every change to the project, with exactly what would happen. Only "allow" lets it
   * happen. Without this there is nobody to ask, and every change is refused.
   */
  approve?: (proposal: Proposal) => Promise<"allow" | "deny">;
  /**
   * Asked before a program is run, with exactly what would run and where. Only "allow" lets it.
   * The plan says whether it must always be put to the user (`level: "ask"`); whoever answers
   * decides the rest. Without this there is nobody to ask, and no program is run.
   */
  approveCommand?: (plan: CommandPlan) => Promise<"allow" | "deny">;
  /** Runs an allowed plan (tests replace it to watch the loop; the real one is `runPlanned`). */
  runCommand?: (call: ToolCall, plan: CommandPlan, workspace: Workspace, environment: CommandEnvironment) => Promise<ToolResult>;
  /**
   * Asked before the Git repository is changed, with exactly what the operation covers. Only
   * "allow" lets it happen; with nobody to ask, Git is not changed. A push's plan says it must
   * always be put to the user (`level: "ask"`).
   */
  approveGit?: (plan: GitPlan) => Promise<"allow" | "deny">;
  /** Works out a Git operation (tests replace it to watch the loop; the real one is `prepareGit`). */
  prepareGit?: (call: ToolCall, workspace: Workspace, environment: GitEnvironment) => Promise<PreparedGit>;
  /** Folders PawOS must never change (its own state directory). */
  forbidden?: string[];
  /**
   * Where PawOS keeps its own files. Before this task's first change to a file, a recovery copy of
   * what it is about to change is kept there (local/checkpoint.ts). Without it, changes are still
   * made, and are reported as having no recovery copy.
   */
  stateDirectory?: string;
  /** Runs a tool (tests replace it to watch the loop; the real one is `executeTool`). */
  execute?: (call: ToolCall, workspace: Workspace, environment: ToolEnvironment) => Promise<ToolResult>;
  limits?: Partial<typeof AGENT_CLIENT_LIMITS>;
}

export const GIT_DECLINED = "Not allowed: the user declined this Git operation. Do not ask for it again; finish and say what is left for them to do.";

export const COMMAND_DECLINED = "Not allowed: the user declined to run this command. Do not ask for it again; carry on without it, or finish and say what is left for them to run.";

export const DECLINED = "Not allowed: the user declined this change. Do not ask for the same change again; carry on without it, or finish and explain.";

const BUDGET_SPENT = "This task has reached PawOS's limit on how much of the project can be sent. Finish now with what you have.";

export async function runLocalTask(options: LocalTaskOptions): Promise<LocalOutcome> {
  const { client, workspace, signal } = options;
  const limits = { ...AGENT_CLIENT_LIMITS, ...options.limits };
  const now = options.now ?? Date.now;
  const execute = options.execute ?? executeTool;
  const deadline = now() + limits.taskMs;
  const steps: LocalStep[] = [];
  let sent = 0;
  // Made at the first change to a file, not before: a task that only reads keeps nothing.
  let checkpoint: TaskCheckpoint | null | undefined;

  // Ctrl+C ends the wait for PawOS as well as the tool that is running.
  const cancelled = new Promise<"cancelled">((resolve) => {
    if (signal?.aborted) resolve("cancelled");
    else signal?.addEventListener("abort", () => resolve("cancelled"), { once: true });
  });
  const turn = async (body: AgentTurnRequest): Promise<AgentTurnResponse | "cancelled" | { error: unknown }> => {
    const request = client.agentTurn(body).then(
      (answer) => answer,
      (error: unknown) => ({ error })
    );
    return Promise.race([request, cancelled]);
  };

  if (signal?.aborted) return { status: "cancelled", steps };
  // Up front PawOS is told the project's name, its branch and the names of its files — no contents.
  const listing = await listFiles(workspace, workspace.root, limits.workspaceFiles, signal);
  if (signal?.aborted) return { status: "cancelled", steps };
  let answer = await turn({ taskId: options.taskId, goal: options.goal, workspace: { name: workspace.name, branch: options.branch, files: listing.files, filesTruncated: listing.truncated } });

  for (;;) {
    if (answer === "cancelled") return { status: "cancelled", steps };
    if ("error" in answer) return { status: "failed", error: answer.error, steps };
    if (answer.turn.kind === "finish") return { status: "finished", summary: answer.turn.summary, steps };

    if (steps.length >= limits.turns) return { status: "stopped", reason: `PawOS stopped after ${limits.turns} steps.`, steps };
    if (now() >= deadline) return { status: "stopped", reason: "PawOS stopped: the task took too long.", steps };

    // Checked again here, whatever the client library already did: only a tool on the list, with arguments of the right shape.
    const call = parseToolCall(answer.turn.call);
    const step: LocalStep = { call: call ?? answer.turn.call, note: answer.turn.note, result: null };
    steps.push(step);
    options.onStep?.(steps);

    let result: ToolResult;
    if (!call) result = { id: answer.turn.call.id, ok: false, denied: true, output: "Not allowed: that isn't something this version of PawOS can run." };
    else if (toolRisk(call.name) === "write" || toolRisk(call.name) === "delete") {
      // Risk comes from the tool's name, here. Nothing in the step can mark it as already approved.
      const prepared = await prepareChange(call, workspace, { forbidden: options.forbidden });
      if (signal?.aborted) return { status: "cancelled", steps };
      if (!prepared.ok) result = prepared.result;
      else {
        const answer = options.approve ? await Promise.race([options.approve(prepared.proposal), cancelled.then(() => "deny" as const)]) : "deny";
        // Stopped while the question was open: that is not a yes.
        if (signal?.aborted) return { status: "cancelled", steps };
        if (answer !== "allow") result = { id: call.id, ok: false, denied: true, output: DECLINED };
        else {
          // First, a copy of what is about to change — so this task's changes can be taken back.
          if (checkpoint === undefined) checkpoint = TaskCheckpoint.begin(options.stateDirectory, options.taskId, workspace, options.goal);
          const kept = checkpoint ? checkpoint.capture(prepared.proposal.touches) : null;
          if (kept && !kept.ok) result = { id: call.id, ok: false, output: `PawOS did not make this change, because it could not keep a recovery copy first: ${kept.reason}` };
          else {
            result = await applyChange(call, prepared.proposal);
            checkpoint?.settle(prepared.proposal.touches);
            if (result.ok) step.change = { operation: prepared.proposal.operation, relative: prepared.proposal.relative, recoverable: checkpoint !== null && checkpoint !== undefined };
          }
        }
      }
    } else if (toolRisk(call.name) === "git") {
      // A fixed Git operation with typed inputs. What it covers is worked out here, from the
      // repository itself, and put to the user as that.
      const prepared = await (options.prepareGit ?? prepareGit)(call, workspace, { signal });
      if (signal?.aborted) return { status: "cancelled", steps };
      if (!prepared.ok) result = prepared.result;
      else {
        const answer = options.approveGit ? await Promise.race([options.approveGit(prepared.plan), cancelled.then(() => "deny" as const)]) : "deny";
        if (signal?.aborted) return { status: "cancelled", steps };
        if (answer !== "allow") result = { id: call.id, ok: false, denied: true, output: GIT_DECLINED };
        else {
          result = await prepared.plan.run(signal);
          if (result.ok) step.git = { tool: prepared.plan.tool, summary: prepared.plan.summary };
          sent += result.output.length;
          if (signal?.aborted) {
            step.result = result;
            return { status: "cancelled", steps };
          }
        }
      }
    } else if (toolRisk(call.name) === "execute") {
      // Everything about the command is checked here, from the step itself: the program, each
      // argument, the folder, and how carefully it must be treated. None of it is the service's call.
      const prepared = prepareCommand(call, workspace);
      if (!prepared.ok) result = prepared.result;
      else {
        const answer = options.approveCommand ? await Promise.race([options.approveCommand(prepared.plan), cancelled.then(() => "deny" as const)]) : "deny";
        if (signal?.aborted) return { status: "cancelled", steps };
        if (answer !== "allow") result = { id: call.id, ok: false, denied: true, output: COMMAND_DECLINED };
        else {
          // Ctrl+C reaches the program through the signal: it and everything it started are stopped
          // before this returns, so nothing is left running.
          result = await (options.runCommand ?? runPlanned)(call, prepared.plan, workspace, { signal });
          step.command = { tool: prepared.plan.tool, display: prepared.plan.display, exitCode: result.exitCode ?? null, timedOut: result.timedOut === true, cancelled: result.cancelled === true };
          if (result.output.length > limits.resultChars) result = { ...result, output: `${result.output.slice(0, limits.resultChars)}\n… (cut short)`, truncated: true };
          sent += result.output.length;
          if (signal?.aborted) {
            step.result = result;
            return { status: "cancelled", steps };
          }
        }
      }
    } else if (toolRisk(call.name) !== "read") result = { id: call.id, ok: false, denied: true, output: "Not allowed: that isn't something this version of PawOS can run." };
    else if (sent >= limits.taskChars) result = { id: call.id, ok: false, output: BUDGET_SPENT };
    else {
      result = await Promise.race([execute(call, workspace, { signal }), cancelled.then((): ToolResult => ({ id: call.id, ok: false, output: "Stopped." }))]);
      // One result is capped, and so is everything sent for the task together.
      const room = Math.min(limits.resultChars, limits.taskChars - sent);
      if (result.output.length > room) result = { ...result, output: `${result.output.slice(0, room)}\n… (cut short)`, truncated: true };
      sent += result.output.length;
    }
    if (signal?.aborted) return { status: "cancelled", steps };
    step.result = result;
    options.onStep?.(steps);

    answer = await turn({ taskId: options.taskId, result });
  }
}
