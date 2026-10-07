import { PawosApiError, type PawosClient } from "./api/pawosClient";
import type { RepositoryReadiness } from "./api/types";
import type { ApiConfig } from "../../pawos-shared/src/config";
import type { AuthStatus } from "../../pawos-shared/src/auth/session";
import { newRequestId } from "./task/requestId";
import { runTask, type TaskOptions, type TaskOutcome } from "./task/taskRunner";
import { IDLE_TASK, changeToTask, describeRepository, safeHttpsUrl, type SidebarState } from "./ui/state";

/** PawOS Web's own limit on a message (WEB_POLICY.maxMessageChars); the server enforces it too. */
export const MAX_TASK_CHARS = 4000;

/** The sign-in state the sidebar follows. */
export interface ControllerAuth {
  readonly status: AuthStatus;
  readonly email: string | null;
  readonly notice: string | null;
  onDidChange(listener: () => void): unknown;
  signOut(): Promise<void>;
}

export interface ControllerDeps {
  auth: ControllerAuth;
  /** Runs the browser sign-in (open the browser, ask for the pasted code). */
  startSignIn?: () => Promise<void>;
  client: Pick<PawosClient, "getCapabilities" | "getRepositoryReadiness" | "selectRepository" | "sendCodeChange" | "recoverSend" | "getChange">;
  getConfig: () => ApiConfig;
  /** The GitHub repository (`owner/name`) of the folder open in VS Code, or null. */
  getWorkspaceRepository: () => string | null;
  /** Asks the user to confirm; resolves true when they do. */
  confirm: (message: string, action: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<unknown>;
  run?: (options: TaskOptions) => Promise<TaskOutcome>;
}

/**
 * The sidebar's behaviour: it holds what is shown and turns each button into a call to the existing
 * PawOS Web API. It decides nothing about plans, repositories or changes — it shows what PawOS says.
 */
export class PawosController {
  private readiness: RepositoryReadiness | null = null;
  private lastTask: { requestId: string; content: string } | null = null;
  private readonly listeners = new Set<(state: SidebarState) => void>();
  state: SidebarState;

  constructor(private readonly deps: ControllerDeps) {
    this.state = this.blank();
    deps.auth.onDidChange(() => void this.onAuthChanged());
  }

  private blank(): SidebarState {
    const config = this.deps.getConfig();
    return {
      auth: this.deps.auth.status,
      configProblem: config.ok ? null : config.problem,
      notice: this.deps.auth.notice,
      error: null,
      loading: false,
      email: this.deps.auth.email,
      plan: null,
      repo: describeRepository(null, this.deps.getWorkspaceRepository()),
      task: IDLE_TASK,
    };
  }

  onDidChange(listener: (state: SidebarState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private patch(patch: Partial<SidebarState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private async onAuthChanged(): Promise<void> {
    const { status, email, notice } = this.deps.auth;
    const was = this.state.auth;
    this.patch({ auth: status, email, notice });
    if (status === "signedIn" && was !== "signedIn") await this.refresh();
    if (status === "signedOut") {
      this.readiness = null;
      this.patch({ plan: null, error: null, repo: describeRepository(null, this.deps.getWorkspaceRepository()), task: this.state.task.phase === "running" ? this.state.task : IDLE_TASK });
    }
  }

  /** What went wrong, for the user. A session that ended is said once, by the sign-in notice. */
  private say(error: unknown): string | null {
    if (error instanceof PawosApiError) return error.kind === "unauthenticated" ? null : error.message;
    return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
  }

  /** The folder's repository changed (a folder was opened, a remote was edited). */
  workspaceChanged(): void {
    this.patch({ repo: describeRepository(this.readiness, this.deps.getWorkspaceRepository()) });
  }

  /** Loads the account's plan and its PawOS repository from the existing Web API. */
  async refresh(): Promise<void> {
    const config = this.deps.getConfig();
    this.patch({ configProblem: config.ok ? null : config.problem, repo: describeRepository(this.readiness, this.deps.getWorkspaceRepository()) });
    if (!config.ok || this.deps.auth.status !== "signedIn") return;
    this.patch({ loading: true, error: null });
    try {
      const [capabilities, readiness] = await Promise.all([this.deps.client.getCapabilities(), this.deps.client.getRepositoryReadiness()]);
      this.readiness = readiness;
      this.patch({ loading: false, plan: capabilities.plan.label, repo: describeRepository(readiness, this.deps.getWorkspaceRepository()) });
    } catch (error) {
      this.patch({ loading: false, error: this.say(error) });
    }
  }

  /** Signs in through the PawOS browser hand-off. */
  async signIn(): Promise<void> {
    const config = this.deps.getConfig();
    if (!config.ok) return this.patch({ configProblem: config.problem });
    this.patch({ error: null });
    try {
      await this.deps.startSignIn?.();
    } catch (error) {
      this.patch({ error: this.say(error) });
    }
  }

  signOut(): Promise<void> {
    return this.deps.auth.signOut();
  }

  /** Points PawOS at this folder's repository — the existing PUT, and only because the user asked. */
  async useWorkspaceRepository(): Promise<void> {
    const workspace = this.deps.getWorkspaceRepository();
    if (!workspace || this.state.task.phase === "running") return;
    const selected = this.state.repo.selected;
    const ask = selected
      ? `Change the repository PawOS works on from ${selected} to ${workspace}? This also changes it on PawOS Web.`
      : `Set the repository PawOS works on to ${workspace}? This also sets it on PawOS Web.`;
    if (!(await this.deps.confirm(ask, `Use ${workspace}`))) return;
    this.patch({ loading: true, error: null });
    try {
      this.readiness = await this.deps.client.selectRepository(workspace);
      this.patch({ loading: false, repo: describeRepository(this.readiness, workspace) });
    } catch (error) {
      this.patch({ loading: false, error: this.say(error) });
    }
  }

  /** Sends one task to PawOS Web's Code mode and follows it to the end. */
  async runTask(input: string): Promise<void> {
    const content = input.trim();
    if (this.state.task.phase === "running" || this.deps.auth.status !== "signedIn") return;
    if (!content) return this.patch({ error: "Describe the change you want PawOS to make." });
    if (content.length > MAX_TASK_CHARS) return this.patch({ error: `Keep the task under ${MAX_TASK_CHARS.toLocaleString("en-US")} characters.` });
    const repo = this.state.repo;
    if (!repo.canRun || !repo.selected) return this.patch({ error: repo.message ?? "PawOS isn't ready to make changes yet. Refresh and try again." });
    if (repo.mismatch) {
      const proceed = await this.deps.confirm(`PawOS will change ${repo.selected} on GitHub — not this folder's repository (${repo.workspace}). Continue?`, `Run on ${repo.selected}`);
      if (!proceed) return;
    }
    this.lastTask = { requestId: newRequestId(), content };
    await this.follow(false);
  }

  /** After a timeout: ask PawOS what became of the same task. Never starts it again. */
  async checkAgain(): Promise<void> {
    if (this.state.task.phase !== "timeout" || !this.lastTask) return;
    await this.follow(true);
  }

  private async follow(resume: boolean): Promise<void> {
    const task = this.lastTask;
    if (!task) return;
    const { requestId, content } = task;
    this.patch({ error: null, task: { ...IDLE_TASK, phase: "running", requestId, repository: this.state.repo.selected, steps: resume ? this.state.task.steps : [] } });
    const outcome = await (this.deps.run ?? runTask)({
      client: this.deps.client,
      requestId,
      content,
      resume,
      onUpdate: ({ phase, change }) => {
        if (this.lastTask?.requestId !== requestId) return;
        // Pushed: the work is done and on GitHub; only the repository's checks are still running.
        this.patch({ task: changeToTask(phase === "pushed" ? "complete" : "running", requestId, change, null, true) });
      },
    });
    if (this.lastTask?.requestId !== requestId) return;
    switch (outcome.status) {
      case "complete":
        this.patch({ task: changeToTask("complete", requestId, outcome.change, null, false) });
        break;
      case "noChange":
        this.patch({ task: { ...IDLE_TASK, phase: "noChange", requestId, message: outcome.message } });
        break;
      case "failed":
        this.patch({ task: changeToTask("failed", requestId, outcome.change, outcome.error?.kind === "unauthenticated" ? "You were signed out before the task finished. Sign in and check PawOS Web for its result." : outcome.message, false) });
        break;
      case "timeout":
        this.patch({ task: changeToTask("timeout", requestId, outcome.change, "PawOS is taking longer than expected. The task may still finish — check again in a moment.", false) });
        break;
    }
  }

  /** Opens the commit or pull request of the task on screen — never an address the webview supplies. */
  async open(which: "commit" | "pullRequest"): Promise<void> {
    const url = safeHttpsUrl(which === "commit" ? this.state.task.commitUrl : this.state.task.pullRequestUrl);
    if (url) await this.deps.openExternal(url);
  }

  newTask(): void {
    if (this.state.task.phase !== "running") this.patch({ task: IDLE_TASK, error: null });
  }
}
