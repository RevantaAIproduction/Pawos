import type { RepositoryReadiness } from "../api/types";
import { sameRepository } from "../git/remote";

/**
 * Where a task will run, as every PawOS client shows it: the repository selected in PawOS, the
 * repository of the folder the user is in, and whether they are the same. Nothing here selects a
 * repository — a client only ever does that when the user says so.
 */
export interface RepoView {
  /** "unknown" until the account's repository state has loaded. */
  kind: "unknown" | RepositoryReadiness["state"];
  /** The repository PawOS will change, when one is selected. */
  selected: string | null;
  defaultBranch: string | null;
  /** The GitHub repository of the local folder, when it has one. */
  workspace: string | null;
  /** The local folder is a different repository from the one PawOS will change. */
  mismatch: boolean;
  message: string | null;
  /** Offer "use the local repository": only ever done when the user asks. */
  canUseWorkspace: boolean;
  canRun: boolean;
}

export function describeRepository(readiness: RepositoryReadiness | null, workspace: string | null): RepoView {
  const base = { selected: null, defaultBranch: null, workspace, mismatch: false, canUseWorkspace: false, canRun: false };
  if (!readiness) return { kind: "unknown", ...base, message: null };
  switch (readiness.state) {
    case "locked":
      return { kind: "locked", ...base, message: `Code changes aren't included in your plan${readiness.availableOn ? ` (available on ${readiness.availableOn})` : ""}.` };
    case "githubNotConnected":
      return { kind: "githubNotConnected", ...base, message: "GitHub isn't connected to your PawOS account. Connect GitHub in the PawOS desktop app, then refresh." };
    case "githubNeedsReauth":
      return { kind: "githubNeedsReauth", ...base, message: "Your PawOS GitHub connection needs to be renewed. Reconnect GitHub in the PawOS desktop app, then refresh." };
    case "noRepository":
      return {
        kind: "noRepository",
        ...base,
        canUseWorkspace: workspace !== null,
        message: workspace ? "No repository is selected in PawOS yet." : "No repository is selected in PawOS, and this folder isn't a GitHub repository. Choose one in PawOS Web.",
      };
    case "ready": {
      const selected = readiness.repository.fullName;
      const mismatch = workspace !== null && !sameRepository(workspace, selected);
      return {
        kind: "ready",
        ...base,
        selected,
        defaultBranch: readiness.repository.defaultBranch,
        mismatch,
        canUseWorkspace: mismatch,
        canRun: true,
        message: mismatch ? `This folder is ${workspace}, but PawOS is set to change ${selected}.` : null,
      };
    }
  }
}
