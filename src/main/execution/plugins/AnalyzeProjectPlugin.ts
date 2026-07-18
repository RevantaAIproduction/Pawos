import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { analyzeProject } from '../ProjectAnalyzer';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';
import { fileWatcherManager } from '../FileWatcher';

/**
 * The mandatory first step before any real debugging — Paw should never
 * guess a project's framework/language/scripts/etc. when it can inspect
 * them directly. Non-destructive, pure filesystem read.
 */
export class AnalyzeProjectPlugin extends BasePlugin {
  id = 'analyzeProject';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeProject';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeProject') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeProject') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    const context = await analyzeProject(request.rootPath);
    workspaceMemoryStore.upsertFromAnalysis(context);
    fileWatcherManager.watch(context.root);
    return { ok: true, data: context };
  }

  describeInProgress(): string {
    return 'Looking at the project…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'analyzeProject') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const ctx = result.data as { workspaceName: string; framework: string | null; language: string } | undefined;
    if (!ctx) return 'Done.';
    const framework = ctx.framework ? `a ${ctx.framework} project` : 'a project';
    return `"${ctx.workspaceName}" looks like ${framework} (${ctx.language}).`;
  }
}

export const analyzeProjectPlugin = new AnalyzeProjectPlugin();
