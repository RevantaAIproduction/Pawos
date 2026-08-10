import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { buildDependencyGraph } from '../dependencyGraph/DependencyGraphBuilder';
import { dependencyGraphCache } from '../dependencyGraph/DependencyGraphCache';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

/**
 * Real import-graph construction (Coding Runtime V2, Context Understanding Engine, §5) — the
 * honest replacement for treating "what references this file" as a basename substring search.
 * Read-only from the target project's perspective (only ever reads files, never writes); available
 * in both Paw Go and Paw Pro, same as analyze_project_structure, since it produces no mutating
 * side effect on the user's project.
 */
export class BuildDependencyGraphPlugin extends BasePlugin {
  id = 'buildDependencyGraph';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'buildDependencyGraph';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'buildDependencyGraph') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'buildDependencyGraph') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    try {
      const previous = dependencyGraphCache.getPrevious(request.rootPath);
      const result = await buildDependencyGraph(request.rootPath, previous);
      const record = dependencyGraphCache.store(request.rootPath, result);
      workspaceMemoryStore.recordDependencyGraphBuilt(request.rootPath, record.builtAt);
      return {
        ok: true,
        data: {
          root: request.rootPath,
          builtAt: record.builtAt,
          filesAnalyzed: result.filesAnalyzed,
          filesReused: result.filesReused,
          filesSkipped: result.filesSkipped,
          edgeCount: Object.values(result.edges).reduce((sum, imports) => sum + imports.length, 0),
        },
      };
    } catch (err) {
      return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to build the dependency graph.' };
    }
  }

  describeInProgress(): string {
    return 'Mapping out how the files in this project import each other…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'buildDependencyGraph') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { filesAnalyzed: number; filesReused: number; edgeCount: number } | undefined;
    if (!data) return 'Done.';
    const parts = [`analyzed ${data.filesAnalyzed} file${data.filesAnalyzed === 1 ? '' : 's'}`];
    if (data.filesReused > 0) parts.push(`reused ${data.filesReused} unchanged`);
    return `I mapped the project's imports (${parts.join(', ')}) — found ${data.edgeCount} import edge${data.edgeCount === 1 ? '' : 's'}.`;
  }
}

export const buildDependencyGraphPlugin = new BuildDependencyGraphPlugin();
