import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { analyzeProject } from '../ProjectAnalyzer';
import { buildFeatureMap } from '../FeatureMapBuilder';
import { buildDependencyGraph } from '../dependencyGraph/DependencyGraphBuilder';
import { dependencyGraphCache } from '../dependencyGraph/DependencyGraphCache';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';
import { upsertCodingFeature } from '../../memory/entities/codingFeatureEntities';

/**
 * Feature Discovery Engine (Coding Runtime V2, §6) — auto-discovers a project's coherent
 * "features" (route + component + data-model + config + test files clustered around one
 * user-facing capability), deterministically, via union-find over real evidence (traced routes,
 * matched API calls, import edges) — never invented ML clustering. Read-only from the target
 * project's perspective; available in both Paw Go and Paw Pro, same as analyze_project_structure.
 */
export class DiscoverProjectFeaturesPlugin extends BasePlugin {
  id = 'discoverProjectFeatures';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'discoverProjectFeatures';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'discoverProjectFeatures') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'discoverProjectFeatures') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    try {
      const context = await analyzeProject(request.rootPath);

      // Always (re)build the dependency graph rather than trusting a raw cache.get() blindly — a
      // project analyzed once and then edited would otherwise serve an arbitrarily stale feature
      // map forever, since DependencyGraphCache has no staleness check of its own. Passing
      // getPrevious() still makes this cheap: the worker's own mtime-based incremental logic skips
      // re-parsing any file that hasn't changed, so this costs a full walk but not a full re-parse
      // when nothing changed — same self-sufficient, no-prerequisite-tool-call-required style
      // AnalyzeProjectStructurePlugin already uses, but freshness-correct like
      // BuildDependencyGraphPlugin's own execute() rather than a plain cache read.
      const previous = dependencyGraphCache.getPrevious(request.rootPath);
      const result = await buildDependencyGraph(request.rootPath, previous);
      const record = dependencyGraphCache.store(request.rootPath, result);
      workspaceMemoryStore.recordDependencyGraphBuilt(request.rootPath, record.builtAt);

      const { features } = buildFeatureMap(request.rootPath, record, context.framework);
      const entityIds = features.map((feature) =>
        upsertCodingFeature(feature, request.rootPath, {
          confidence: feature.confidence,
          evidence: [{ source: 'taskExecution', detail: `Discovered via ${feature.method}.` }],
          reasoningSummary: `Clustered as one feature via ${feature.method}.`,
        }).id
      );

      return {
        ok: true,
        data: {
          root: request.rootPath,
          features: features.map((f, i) => ({
            entityId: entityIds[i],
            name: f.name,
            confidence: f.confidence,
            method: f.method,
            fileCount: f.routeFiles.length + f.componentFiles.length + f.dataModelFiles.length + f.configFiles.length + f.testFiles.length,
          })),
        },
      };
    } catch (err) {
      return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to discover project features.' };
    }
  }

  describeInProgress(): string {
    return 'Looking for coherent features in this project…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'discoverProjectFeatures') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { features: { name: string }[] } | undefined;
    if (!data) return 'Done.';
    if (data.features.length === 0) return "I didn't find any clearly-traceable features (no route conventions I recognize in this project).";
    const names = data.features.slice(0, 5).map((f) => f.name);
    const more = data.features.length > 5 ? ` and ${data.features.length - 5} more` : '';
    return `I found ${data.features.length} feature${data.features.length === 1 ? '' : 's'}: ${names.join(', ')}${more}.`;
  }
}

export const discoverProjectFeaturesPlugin = new DiscoverProjectFeaturesPlugin();
