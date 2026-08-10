import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { rankAffectedFiles } from '../FileDiscoveryRanker';
import { repositorySemanticIndexService } from '../semanticIndex/RepositorySemanticIndexService';
import { buildRepositorySemanticIndexPlugin } from './BuildRepositorySemanticIndexPlugin';

/**
 * Intelligent File Discovery (Coding Runtime V2, §8) — given a natural-language feature request,
 * locates every plausibly-affected file via three combined, honestly-confidence-tiered signals
 * (`FileDiscoveryRanker`). A real improvement over `AnalyzeFileImpactPlugin`'s basename-substring
 * heuristic, which is kept as-is and unreplaced for its own narrower "what references this *specific*
 * file" job — this plugin answers a broader "what files does this *request* touch" question instead.
 * Self-sufficient: reuses a fresh Repository Semantic Index if one already exists and isn't stale,
 * otherwise builds one via `BuildRepositorySemanticIndexPlugin` directly (no duplicated orchestration
 * logic) rather than requiring a separate prior tool call. Read-only; available in both Paw Go and
 * Paw Pro.
 */
export class DiscoverAffectedFilesPlugin extends BasePlugin {
  id = 'discoverAffectedFiles';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'discoverAffectedFiles';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'discoverAffectedFiles') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'discoverAffectedFiles') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    const root = request.rootPath;

    try {
      let index = repositorySemanticIndexService.getIndex(root);
      if (!index || index.stale) {
        const buildResult = await buildRepositorySemanticIndexPlugin.execute({ type: 'buildRepositorySemanticIndex', rootPath: root });
        if (!buildResult.ok) return buildResult;
        index = repositorySemanticIndexService.getIndex(root);
      }
      if (!index) return { ok: false, reason: 'failed', message: 'Failed to build a semantic index for this project.' };

      const { matches, note } = rankAffectedFiles(index, request.query);

      return {
        ok: true,
        data: { root, query: request.query, matches, note },
      };
    } catch (err) {
      return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to discover affected files.' };
    }
  }

  describeInProgress(): string {
    return 'Figuring out which files this request would actually touch…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'discoverAffectedFiles') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { matches: { path: string }[]; note: string } | undefined;
    if (!data) return 'Done.';
    if (data.matches.length === 0) return data.note;
    const names = data.matches.slice(0, 5).map((m) => m.path);
    const more = data.matches.length > 5 ? ` and ${data.matches.length - 5} more` : '';
    return `Found ${data.matches.length} related file${data.matches.length === 1 ? '' : 's'}: ${names.join(', ')}${more}. (${data.note})`;
  }
}

export const discoverAffectedFilesPlugin = new DiscoverAffectedFilesPlugin();
