import type { ConversationSnapshot, ConversationTaskRecord } from './ConversationTypes';
import { isInsideFolder } from './projectClone';

/**
 * Rules for the project bar above the message box (folder · branch · +/− lines · Create PR):
 *  - the bar itself shows only while a project is open;
 *  - the line counts and Create PR show only once the agent has actually changed code in THIS
 *    project in this conversation (a successful file write / edit / create / move / delete inside
 *    the project folder) and git reports changes;
 *  - Create PR stays disabled (silver) while the agent is working — thinking, running an action,
 *    or waiting for "allow" — and becomes clickable only when it has finished.
 */

const CODE_CHANGE_ACTIONS = new Set([
  'writeFile', 'applyCodeEdit', 'createFolder', 'deletePath', 'movePath', 'copyPath', 'createDocx',
  'duplicatePath', 'extractArchive', 'mergeFolders', 'splitFile', 'restorePath', 'writeEnvVar',
]);

function touchedPaths(request: Record<string, unknown>): string[] {
  return ['path', 'outputPath', 'from', 'to', 'cwd']
    .map((key) => request[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/** True once the agent has successfully changed a file inside `projectFolder`. */
export function agentChangedProject(tasks: readonly ConversationTaskRecord[] | undefined, projectFolder: string | null | undefined): boolean {
  if (!projectFolder) return false;
  return (tasks ?? []).some((task) =>
    task.actions.some(
      (action) =>
        CODE_CHANGE_ACTIONS.has(action.type) &&
        action.result?.ok === true &&
        touchedPaths(action.request as unknown as Record<string, unknown>).some((p) => isInsideFolder(p, projectFolder)),
    ),
  );
}

const BUSY_STATES = new Set(['thinking', 'performingAction', 'transcribing', 'speaking']);

/** The agent is still working: mid-turn, running an action, or waiting for the user's "allow". */
export function agentIsBusy(snapshot: Pick<ConversationSnapshot, 'state' | 'pendingConfirmation' | 'taskHistory'>): boolean {
  if (BUSY_STATES.has(snapshot.state) || snapshot.pendingConfirmation) return true;
  return (snapshot.taskHistory ?? []).some((task) => task.status === 'running');
}

export type DiffSummary = { files: number; added: number; deleted: number };

export function summarizeDiff(data: unknown): DiffSummary | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { filesChanged?: unknown[]; totalAdded?: number; totalDeleted?: number };
  if (!Array.isArray(d.filesChanged)) return null;
  return { files: d.filesChanged.length, added: Number(d.totalAdded) || 0, deleted: Number(d.totalDeleted) || 0 };
}

/** What Create PR asks the agent to do — every step (commit, push, gh) still asks "allow" first. */
export function createPrRequest(projectFolder: string, branch: string | null): string {
  const onDefault = !branch || /^(main|master|trunk|develop)$/i.test(branch);
  return [
    `Create a pull request for the changes in ${projectFolder}${branch ? ` (current branch: ${branch})` : ''}.`,
    onDefault ? 'First create a new branch with a short descriptive name, since this is the default branch.' : '',
    'Commit the changes with a clear message, push the branch to origin, then open the PR with `gh pr create` (title and summary from the changes).',
    'Tell me the PR link when it is done.',
  ]
    .filter(Boolean)
    .join(' ');
}
