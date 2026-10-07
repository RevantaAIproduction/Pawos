import { describe, expect, it } from "vitest";
import { PawosApiError } from "./api/pawosClient";
import type { Capabilities, CodeChange, RepositoryReadiness } from "./api/types";
import type { AuthManager, AuthStatus } from "./auth/authManager";
import { PawosController, type ControllerDeps } from "./controller";
import type { TaskOptions, TaskOutcome } from "./task/taskRunner";
import { REQUEST_ID_PATTERN } from "./task/requestId";
import { LIMITATION_NOTE, describeChecks, describeRepository, safeHttpsUrl } from "./ui/state";

/** What the sidebar shows and does, with PawOS Web and VS Code as stand-ins. */
const READY: RepositoryReadiness = { state: "ready", repository: { fullName: "acme/site", defaultBranch: "main" }, scope: "full" };
const CAPABILITIES: Capabilities = { plan: { tier: "pro", label: "Paw Pro" }, capabilities: [{ id: "web.codeChanges", label: "Code changes", status: "available", availableOn: null }] };

const pushedChange: CodeChange = {
  requestId: "r",
  repository: "acme/site",
  state: "done",
  steps: [{ id: "push", label: "Commit and push to main", status: "done" }],
  branch: "main",
  commitSha: "abc1234",
  commitUrl: "https://github.com/acme/site/commit/abc1234",
  pullRequestUrl: null,
  files: ["src/Header.tsx"],
  summary: "Renamed the button.",
  previewUrl: null,
  checksState: "success",
  fixAttempts: 0,
  error: null,
};

class FakeAuth {
  status: AuthStatus = "signedIn";
  email: string | null = "dev@example.com";
  notice: string | null = null;
  private listeners: (() => void)[] = [];
  signedOut = 0;
  onDidChange(listener: () => void) {
    this.listeners.push(listener);
    return () => undefined;
  }
  change(status: AuthStatus, notice: string | null = null) {
    this.status = status;
    this.email = status === "signedIn" ? "dev@example.com" : null;
    this.notice = notice;
    for (const listener of this.listeners) listener();
  }
  async signIn() {
    this.change("signedIn");
  }
  async signOut() {
    this.signedOut += 1;
    this.change("signedOut");
  }
}

function setup(options: { readiness?: RepositoryReadiness; workspace?: string | null; outcome?: TaskOutcome; confirm?: boolean; capabilitiesError?: Error; auth?: AuthStatus; configProblem?: string } = {}) {
  const auth = new FakeAuth();
  auth.status = options.auth ?? "signedIn";
  let workspace = options.workspace === undefined ? "acme/site" : options.workspace;
  const confirmations: string[] = [];
  const selected: string[] = [];
  const opened: string[] = [];
  const runs: TaskOptions[] = [];
  const deps: ControllerDeps = {
    auth: auth as unknown as AuthManager,
    client: {
      getCapabilities: async () => {
        if (options.capabilitiesError) throw options.capabilitiesError;
        return CAPABILITIES;
      },
      getRepositoryReadiness: async () => options.readiness ?? READY,
      selectRepository: async (fullName) => {
        selected.push(fullName);
        return { state: "ready", repository: { fullName, defaultBranch: "main" }, scope: "full" };
      },
      sendCodeChange: async () => ({ kind: "processing" }),
      recoverSend: async () => ({ kind: "processing" }),
      getChange: async () => null,
    },
    getConfig: () => (options.configProblem ? { ok: false, problem: options.configProblem } : { ok: true, config: { apiBaseUrl: "https://pawos.test", supabaseUrl: "https://p.supabase.test", supabaseAnonKey: "anon" } }),
    getWorkspaceRepository: () => workspace,
    confirm: async (message) => {
      confirmations.push(message);
      return options.confirm ?? true;
    },
    openExternal: async (url) => {
      opened.push(url);
    },
    run: async (taskOptions) => {
      runs.push(taskOptions);
      return options.outcome ?? { status: "complete", change: pushedChange, reply: "Done.", checksPending: false };
    },
  };
  const controller = new PawosController(deps);
  return { controller, auth, confirmations, selected, opened, runs, setWorkspace: (next: string | null) => (workspace = next) };
}

describe("after sign-in", () => {
  it("shows the plan and the repository PawOS works on, from the existing API", async () => {
    const { controller } = setup();
    await controller.refresh();
    expect(controller.state).toMatchObject({ auth: "signedIn", plan: "Paw Pro", email: "dev@example.com", error: null, loading: false });
    expect(controller.state.repo).toMatchObject({ kind: "ready", selected: "acme/site", defaultBranch: "main", workspace: "acme/site", mismatch: false, canRun: true, canUseWorkspace: false });
  });

  it("loads the account as soon as the user signs in, and clears it when they sign out", async () => {
    const { controller, auth } = setup({ auth: "signedOut" });
    await controller.refresh();
    expect(controller.state.plan).toBeNull();
    auth.change("signedIn");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(controller.state.plan).toBe("Paw Pro");
    await controller.signOut();
    expect(controller.state).toMatchObject({ auth: "signedOut", plan: null, repo: { kind: "unknown" } });
  });

  it("an expired session shows why, once, and asks nothing more of PawOS", async () => {
    const { controller, auth } = setup({ capabilitiesError: new PawosApiError("unauthenticated", "Your PawOS session has expired. Sign in again.", 401) });
    await controller.refresh();
    expect(controller.state.error).toBeNull(); // not repeated as an error…
    auth.change("signedOut", "Your PawOS session has expired. Sign in again.");
    expect(controller.state).toMatchObject({ auth: "signedOut", notice: "Your PawOS session has expired. Sign in again." }); // …the sign-in notice says it
  });

  it.each([
    [new PawosApiError("forbidden", "Your PawOS plan or permissions don't allow that.", 403), "Your PawOS plan or permissions don't allow that."],
    [new PawosApiError("rateLimited", "PawOS is receiving too many requests. Wait a moment and try again.", 429), "PawOS is receiving too many requests. Wait a moment and try again."],
    [new PawosApiError("server", "PawOS is having trouble right now. Please try again in a moment.", 503), "PawOS is having trouble right now. Please try again in a moment."],
    [new PawosApiError("network", "PawOS couldn't be reached. Check your connection and try again."), "PawOS couldn't be reached. Check your connection and try again."],
  ])("a failed load is shown as it is", async (error, message) => {
    const { controller } = setup({ capabilitiesError: error });
    await controller.refresh();
    expect(controller.state).toMatchObject({ error: message, loading: false, plan: null });
  });

  it("says what to set when sign-in isn't configured", async () => {
    const { controller } = setup({ configProblem: "Sign-in isn't set up yet.", auth: "signedOut" });
    await controller.refresh();
    expect(controller.state.configProblem).toBe("Sign-in isn't set up yet.");
  });
});

describe("the repository", () => {
  it.each([
    [{ state: "githubNotConnected" } as RepositoryReadiness, "GitHub isn't connected"],
    [{ state: "githubNeedsReauth" } as RepositoryReadiness, "needs to be renewed"],
    [{ state: "locked", availableOn: "Paw Pro" } as RepositoryReadiness, "aren't included in your plan (available on Paw Pro)"],
  ])("explains why PawOS can't make changes yet", (readiness, text) => {
    const view = describeRepository(readiness, "acme/site");
    expect(view.message).toContain(text);
    expect(view).toMatchObject({ canRun: false, canUseWorkspace: false, selected: null });
  });

  it("with nothing selected, offers this folder's repository — and selects nothing by itself", async () => {
    const { controller, selected } = setup({ readiness: { state: "noRepository" } });
    await controller.refresh();
    expect(controller.state.repo).toMatchObject({ kind: "noRepository", canUseWorkspace: true, canRun: false, workspace: "acme/site" });
    expect(selected).toEqual([]);
  });

  it("a mismatch is shown, never fixed silently", async () => {
    const { controller, selected } = setup({ workspace: "acme/app" });
    await controller.refresh();
    expect(controller.state.repo).toMatchObject({ mismatch: true, selected: "acme/site", workspace: "acme/app", canUseWorkspace: true, message: "This folder is acme/app, but PawOS is set to change acme/site." });
    expect(selected).toEqual([]);
  });

  it("switches PawOS to this folder's repository only when asked and confirmed, through the existing API", async () => {
    const declined = setup({ workspace: "acme/app", confirm: false });
    await declined.controller.refresh();
    await declined.controller.useWorkspaceRepository();
    expect(declined.selected).toEqual([]);
    expect(declined.confirmations[0]).toContain("from acme/site to acme/app");

    const accepted = setup({ workspace: "acme/app" });
    await accepted.controller.refresh();
    await accepted.controller.useWorkspaceRepository();
    expect(accepted.selected).toEqual(["acme/app"]);
    expect(accepted.controller.state.repo).toMatchObject({ selected: "acme/app", mismatch: false, canRun: true });
  });

  it("follows the folder when a different one is opened", async () => {
    const { controller, setWorkspace } = setup();
    await controller.refresh();
    setWorkspace(null);
    controller.workspaceChanged();
    expect(controller.state.repo).toMatchObject({ workspace: null, mismatch: false, canRun: true });
  });
});

describe("running a task", () => {
  it("sends the task once with a fresh request id and shows the result", async () => {
    const { controller, runs } = setup();
    await controller.refresh();
    await controller.runTask("  Rename the Sign in button to Log in  ");
    expect(runs).toHaveLength(1);
    expect(runs[0]!.content).toBe("Rename the Sign in button to Log in");
    expect(runs[0]!.requestId).toMatch(REQUEST_ID_PATTERN);
    expect(runs[0]!.resume).toBe(false);
    expect(controller.state.task).toMatchObject({
      phase: "complete",
      summary: "Renamed the button.",
      files: ["src/Header.tsx"],
      checks: "Passed",
      commitUrl: "https://github.com/acme/site/commit/abc1234",
      pullRequestUrl: null,
    });

    await controller.runTask("Another change");
    expect(runs[1]!.requestId).not.toBe(runs[0]!.requestId);
  });

  it("shows progress while PawOS works", async () => {
    const { controller, runs } = setup();
    await controller.refresh();
    const seen: string[] = [];
    controller.onDidChange((state) => seen.push(`${state.task.phase}:${state.task.steps.map((s) => s.status).join(",")}`));
    const deps = runs;
    await controller.runTask("x");
    expect(seen[0]).toBe("running:");
    // The runner's updates are drawn as they arrive.
    deps[0]!.onUpdate?.({ phase: "working", change: { ...pushedChange, state: "running", commitSha: null, commitUrl: null, steps: [{ id: "read", label: "Read the repository", status: "active" }] } });
    expect(controller.state.task).toMatchObject({ phase: "running", steps: [{ id: "read", status: "active" }] });
  });

  it("does nothing without a task, a ready repository, or a session", async () => {
    const empty = setup();
    await empty.controller.refresh();
    await empty.controller.runTask("   ");
    expect(empty.runs).toHaveLength(0);
    expect(empty.controller.state.error).toBe("Describe the change you want PawOS to make.");

    const notReady = setup({ readiness: { state: "githubNotConnected" } });
    await notReady.controller.refresh();
    await notReady.controller.runTask("x");
    expect(notReady.runs).toHaveLength(0);
    expect(notReady.controller.state.error).toContain("GitHub isn't connected");

    const signedOut = setup({ auth: "signedOut" });
    await signedOut.controller.runTask("x");
    expect(signedOut.runs).toHaveLength(0);
  });

  it("on a repository mismatch, runs only after the user confirms which repository will change", async () => {
    const declined = setup({ workspace: "acme/app", confirm: false });
    await declined.controller.refresh();
    await declined.controller.runTask("x");
    expect(declined.confirmations[0]).toBe("PawOS will change acme/site on GitHub — not this folder's repository (acme/app). Continue?");
    expect(declined.runs).toHaveLength(0);

    const accepted = setup({ workspace: "acme/app", confirm: true });
    await accepted.controller.refresh();
    await accepted.controller.runTask("x");
    expect(accepted.runs).toHaveLength(1);
  });

  it("a failed task shows PawOS's reason", async () => {
    const { controller } = setup({ outcome: { status: "failed", message: "Choose a repository for PawOS Web to make changes in.", change: null } });
    await controller.refresh();
    await controller.runTask("x");
    expect(controller.state.task).toMatchObject({ phase: "failed", message: "Choose a repository for PawOS Web to make changes in.", commitUrl: null });
  });

  it("a 401 mid-task says the user was signed out", async () => {
    const { controller } = setup({ outcome: { status: "failed", message: "x", change: null, error: new PawosApiError("unauthenticated", "x", 401) } });
    await controller.refresh();
    await controller.runTask("x");
    expect(controller.state.task.message).toContain("signed out before the task finished");
  });

  it("after a timeout, Check Again asks about the same task instead of starting a new one", async () => {
    const { controller, runs } = setup({ outcome: { status: "timeout", change: null } });
    await controller.refresh();
    await controller.runTask("x");
    expect(controller.state.task.phase).toBe("timeout");
    await controller.checkAgain();
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ resume: true, requestId: runs[0]!.requestId });
  });

  it("opens only the commit or pull request of the task on screen, and only https links", async () => {
    const { controller, opened } = setup({ outcome: { status: "complete", change: { ...pushedChange, pullRequestUrl: "javascript:alert(1)" }, reply: "", checksPending: false } });
    await controller.refresh();
    await controller.runTask("x");
    await controller.open("commit");
    await controller.open("pullRequest");
    expect(opened).toEqual(["https://github.com/acme/site/commit/abc1234"]);
    expect(safeHttpsUrl("http://github.com/x")).toBeNull();
    expect(safeHttpsUrl("not a url")).toBeNull();
  });
});

describe("what the user is told", () => {
  it("states the limitation in the product's own words", () => {
    expect(LIMITATION_NOTE).toBe("PawOS works on the connected GitHub repository. Review the resulting commit or pull request.");
  });

  it("describes the repository's checks", () => {
    expect(describeChecks({ checksState: "pending", state: "pushed", fixAttempts: 0 }, true)).toBe("Waiting for your repository's checks…");
    expect(describeChecks({ checksState: "pending", state: "pushed", fixAttempts: 0 }, false)).toBe("Still running — see GitHub for the result");
    expect(describeChecks({ checksState: "success", state: "done", fixAttempts: 1 }, false)).toBe("Passed (PawOS made 1 automatic fix)");
    expect(describeChecks({ checksState: "failure", state: "done", fixAttempts: 2 }, false)).toBe("Failed (PawOS made 2 automatic fixes)");
    expect(describeChecks({ checksState: "failure", state: "fixing", fixAttempts: 0 }, true)).toBe("A check failed — PawOS is fixing it…");
    expect(describeChecks({ checksState: "none", state: "done", fixAttempts: 0 }, false)).toBe("No checks or preview deployments reported");
  });

  it("never puts a session or token in what the sidebar is sent", async () => {
    const { controller } = setup();
    await controller.refresh();
    await controller.runTask("x");
    expect(JSON.stringify(controller.state)).not.toMatch(/token|secret|bearer|apikey/i);
  });
});
