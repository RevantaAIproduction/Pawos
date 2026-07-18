import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { RELATION } from '../../memory/relationVocabulary';
import { findWorkspaceByName, findWorkspaceByRoot, type WorkspaceAttributes } from '../../memory/entities/workspaceEntities';
import type { FileAttributes } from '../../memory/entities/fileEntities';

/**
 * Advisory only — same pattern as analyzeFolder. Returns everything known
 * about a workspace (root paths, recent files, linked people/clients);
 * Paw (the model) sequences the actual openApp/openFolder/openFile/
 * browseWeb calls itself using this bundle. No new "composite open"
 * plugin — this is what makes "open my CareerForge workspace" launch
 * VS Code + terminal + browser + recent docs using capabilities that
 * already exist.
 */
export class GetWorkspaceBundlePlugin extends BasePlugin {
  id = 'getWorkspaceBundle';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getWorkspaceBundle';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getWorkspaceBundle') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const workspace = findWorkspaceByName(request.workspaceRef) ?? findWorkspaceByRoot(request.workspaceRef);
    if (!workspace) {
      return { ok: false, reason: 'failed', message: `I don't have a workspace called "${request.workspaceRef}" in memory yet — try indexing it first.` };
    }

    const attrs = workspace.attributes as WorkspaceAttributes;
    // BELONGS_TO edges point FROM the file TO the workspace, so look at
    // the workspace's incoming edges rather than getRelated (which only
    // walks outgoing edges).
    const relatedFiles = memoryGraphStore
      .getEntityHistory(workspace.id)
      .filter((e) => e.active && e.toId === workspace.id && e.relation === RELATION.BELONGS_TO)
      .map((e) => memoryGraphStore.getEntity(e.fromId))
      .filter((e): e is NonNullable<typeof e> => Boolean(e && e.type === 'file'));

    const uniqueFiles = [...new Map(relatedFiles.map((f) => [f.id, f])).values()]
      .sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt))
      .slice(0, 15)
      .map((f) => {
        const fa = f.attributes as FileAttributes;
        return { path: fa.path, docType: fa.docType, summary: fa.summary };
      });

    return {
      ok: true,
      data: {
        name: attrs.name,
        kind: attrs.kind,
        rootPaths: attrs.rootPaths,
        description: attrs.description,
        recentFiles: uniqueFiles,
      },
    };
  }

  describeInProgress(): string {
    return 'Gathering what I know about this workspace…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getWorkspaceBundle') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { name?: string } | undefined;
    return `I've pulled together everything I know about ${data?.name ?? 'that workspace'}.`;
  }
}

export const getWorkspaceBundlePlugin = new GetWorkspaceBundlePlugin();
