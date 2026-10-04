import type { AccountContext } from "../account/accountContext";
import { createServiceClient } from "../supabase/serviceClient";
import { WebChatError } from "../webChat/errors";
import { WebCapabilityError, codeChangeScopeFor, requireWebCapability, resolveWebCapabilities, type CodeChangeScope } from "../webPolicy/webCapabilities";
import { GitHubError, githubClientFor, githubConnectionState, isRepositoryName, type GitHubClient, type GitHubRepository } from "./github";

/**
 * What PawOS Web needs before it can make a code change for an account, in the order it is checked
 * on the server: the plan includes `web.codeChanges` → GitHub is connected → a repository is
 * selected (and the account can push to it). What the change may touch depends on the plan
 * (codeChangeScopeFor: Paw Go small frontend changes, paid plans frontend and backend). Usage is
 * checked when the change runs: reserve_usage per model call (paid plans), the message cap (Paw Go).
 */

export interface SelectedRepository {
  fullName: string;
  defaultBranch: string;
}

export type CodeChangeReadiness =
  | { state: "locked"; availableOn: string | null }
  | { state: "githubNotConnected" }
  | { state: "githubNeedsReauth" }
  | { state: "noRepository" }
  | { state: "ready"; repository: SelectedRepository; scope: CodeChangeScope };

export async function getSelectedRepository(account: AccountContext): Promise<SelectedRepository | null> {
  const { data, error } = await account.supabase
    .from("web_repository_selection")
    .select("full_name, default_branch")
    .eq("user_id", account.user.id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { full_name: string; default_branch: string };
  return isRepositoryName(row.full_name) ? { fullName: row.full_name, defaultBranch: row.default_branch } : null;
}

/** For display: where the account stands. No GitHub call and no token read. */
export async function getCodeChangeReadiness(account: AccountContext): Promise<CodeChangeReadiness> {
  const capability = resolveWebCapabilities(account).find((c) => c.id === "web.codeChanges");
  if (capability?.status !== "available") return { state: "locked", availableOn: capability?.availableOn ?? null };
  const connection = await githubConnectionState(account);
  if (connection === "notConnected") return { state: "githubNotConnected" };
  if (connection === "needsReauth") return { state: "githubNeedsReauth" };
  const repository = await getSelectedRepository(account);
  return repository ? { state: "ready", repository, scope: codeChangeScopeFor(account) } : { state: "noRepository" };
}

export function requireCodeChanges(account: AccountContext): void {
  try {
    requireWebCapability(account, "web.codeChanges");
  } catch (error) {
    throw new WebChatError("capability_locked", error instanceof WebCapabilityError ? error.message : "Code changes aren't included in your plan.", 403);
  }
}

/** Maps a GitHub failure to the API error the browser sees. */
export function fromGitHubError(error: unknown): WebChatError {
  if (error instanceof WebChatError) return error;
  if (!(error instanceof GitHubError)) return new WebChatError("failed", "Something went wrong. Please try again.", 500);
  switch (error.code) {
    case "not_connected":
      return new WebChatError("github_not_connected", error.message, 409);
    case "needs_reauth":
      return new WebChatError("github_needs_reauth", error.message, 409);
    case "no_access":
    case "not_found":
      return new WebChatError("repository_no_access", "PawOS can't reach that repository with your GitHub connection. Choose another repository or reconnect GitHub.", 403);
    case "conflict":
      return new WebChatError("change_refused", "GitHub refused the change. Nothing was changed on your default branch.", 409);
    default:
      return new WebChatError("github_unavailable", error.message, 502);
  }
}

/** Everything a change needs, or the reason it can't run. Server-side, on every change. */
export async function requireCodeChangeAccess(account: AccountContext): Promise<{ github: GitHubClient; repository: SelectedRepository; scope: CodeChangeScope }> {
  requireCodeChanges(account);
  let github: GitHubClient;
  try {
    github = await githubClientFor(account);
  } catch (error) {
    throw fromGitHubError(error);
  }
  const repository = await getSelectedRepository(account);
  if (!repository) throw new WebChatError("repository_not_selected", "Choose a repository for PawOS Web to make changes in.", 409);
  return { github, repository, scope: codeChangeScopeFor(account) };
}

/** Repositories the account can push to, for the picker. */
export async function listSelectableRepositories(account: AccountContext): Promise<GitHubRepository[]> {
  requireCodeChanges(account);
  try {
    return await (await githubClientFor(account)).listRepositories();
  } catch (error) {
    throw fromGitHubError(error);
  }
}

/** Selects a repository after GitHub confirms the account can push to it. */
export async function selectRepository(account: AccountContext, fullName: unknown): Promise<SelectedRepository> {
  requireCodeChanges(account);
  if (!isRepositoryName(fullName)) throw new WebChatError("invalid_message", "Choose a repository as owner/name.", 400);
  let repository: GitHubRepository;
  try {
    repository = await (await githubClientFor(account)).getRepository(fullName);
  } catch (error) {
    throw fromGitHubError(error);
  }
  if (!repository.canPush) throw new WebChatError("repository_no_access", "Your GitHub account can't push to that repository, so PawOS can't make changes there.", 403);
  const { error } = await createServiceClient()
    .from("web_repository_selection")
    .upsert({ user_id: account.user.id, provider: "github", full_name: repository.fullName, default_branch: repository.defaultBranch, selected_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new WebChatError("failed", "Couldn't save that repository. Please try again.", 500);
  return { fullName: repository.fullName, defaultBranch: repository.defaultBranch };
}

export async function clearRepository(account: AccountContext): Promise<void> {
  const { error } = await createServiceClient().from("web_repository_selection").delete().eq("user_id", account.user.id);
  if (error) throw new WebChatError("failed", "Couldn't clear the repository. Please try again.", 500);
}
