import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { analyzeProject } from '../ProjectAnalyzer';
import { buildProjectMap } from '../ProjectMapBuilder';
import { upsertCodingProject } from '../../memory/entities/codingProjectEntities';

/**
 * "Project Understanding" end to end — real filesystem detection
 * (ProjectAnalyzer's framework/language/buildTool/git) plus a shallow file
 * tree and real package.json dependencies (ProjectMapBuilder), upserted as
 * a codingProject Memory Graph entity so later questions ("what does this
 * project depend on," "why do you think X belongs here") can be answered
 * from stored evidence rather than re-scanning. Read-only — available in
 * both Paw Go and Paw Pro.
 */
export class AnalyzeProjectStructurePlugin extends BasePlugin {
  id = 'analyzeProjectStructure';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeProjectStructure';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeProjectStructure') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeProjectStructure') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    const context = await analyzeProject(request.rootPath);
    const map = buildProjectMap(request.rootPath);
    const entity = upsertCodingProject({
      root: context.root,
      workspaceName: context.workspaceName,
      framework: context.framework,
      language: context.language,
      packageManager: context.packageManager,
      buildTool: context.buildTool,
      git: context.git,
      dependencies: map.dependencies,
      devDependencies: map.devDependencies,
      entryPoint: map.entryPoint,
      fileTree: map.fileTree,
      fileTreeTruncated: map.truncated,
    });

    return {
      ok: true,
      data: {
        codingProjectEntityId: entity.id,
        workspaceName: context.workspaceName,
        framework: context.framework,
        language: context.language,
        entryPoint: map.entryPoint,
        dependencyCount: Object.keys(map.dependencies).length,
        devDependencyCount: Object.keys(map.devDependencies).length,
        fileTree: map.fileTree,
        fileTreeTruncated: map.truncated,
      },
    };
  }

  describeInProgress(): string {
    return 'Mapping out the project structure…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'analyzeProjectStructure') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { workspaceName: string; dependencyCount: number; entryPoint: string | null } | undefined;
    if (!data) return 'Done.';
    const entry = data.entryPoint ? `, entry point "${data.entryPoint}"` : '';
    return `I've mapped "${data.workspaceName}" — ${data.dependencyCount} dependenc${data.dependencyCount === 1 ? 'y' : 'ies'}${entry}.`;
  }
}

export const analyzeProjectStructurePlugin = new AnalyzeProjectStructurePlugin();
