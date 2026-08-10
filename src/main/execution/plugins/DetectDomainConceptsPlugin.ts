import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { analyzeProject } from '../ProjectAnalyzer';
import { buildProjectMap } from '../ProjectMapBuilder';
import { discoverProjectRoutes } from '../FeatureMapBuilder';
import { buildDependencyGraph } from '../dependencyGraph/DependencyGraphBuilder';
import { dependencyGraphCache } from '../dependencyGraph/DependencyGraphCache';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';
import { domainConceptRegistry } from '../domainIntelligence/DomainConceptRegistry';
import type { DomainConceptDetectionInput, DomainConceptMatch } from '../domainIntelligence/DomainConceptRegistry';

/**
 * Domain Intelligence Engine (Coding Runtime V2, §9) — a generic, pluggable domain-vocabulary
 * registry that helps PawOS reason about an arbitrary *third-party* project a user points it at
 * (never PawOS's own business domain). Every built-in pack (auth/billing/crudResource) requires real
 * structural evidence (a dependency, a path convention, a traced route quad) — never a vocabulary
 * word alone. Read-only; available in both Paw Go and Paw Pro, same as discover_project_features.
 */
export class DetectDomainConceptsPlugin extends BasePlugin {
  id = 'detectDomainConcepts';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'detectDomainConcepts';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'detectDomainConcepts') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'detectDomainConcepts') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    try {
      const context = await analyzeProject(request.rootPath);
      const { dependencies, devDependencies } = buildProjectMap(request.rootPath);

      // Always (re)build the dependency graph rather than trusting a raw cache read — same
      // incremental-refresh discipline DiscoverProjectFeaturesPlugin uses (fixed during the Phase 2
      // audit), so this plugin never serves an arbitrarily stale route/method picture.
      const previous = dependencyGraphCache.getPrevious(request.rootPath);
      const result = await buildDependencyGraph(request.rootPath, previous);
      const dependencyGraph = dependencyGraphCache.store(request.rootPath, result);
      workspaceMemoryStore.recordDependencyGraphBuilt(request.rootPath, dependencyGraph.builtAt);

      const routeCandidates = discoverProjectRoutes(request.rootPath, dependencyGraph, context.framework);
      const filePaths = Object.keys(dependencyGraph.fileHashes).map((p) => p.replace(/\\/g, '/'));

      const input: DomainConceptDetectionInput = {
        dependencies: { ...dependencies, ...devDependencies },
        filePaths,
        routeCandidates,
      };

      const concepts = domainConceptRegistry
        .list()
        .map((pack) => pack.detect(input))
        .filter((match): match is DomainConceptMatch => match !== null);

      return {
        ok: true,
        data: {
          root: request.rootPath,
          concepts,
        },
      };
    } catch (err) {
      return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to detect domain concepts.' };
    }
  }

  describeInProgress(): string {
    return 'Looking for recognizable domain concepts in this project (auth, billing, CRUD resources)…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'detectDomainConcepts') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { concepts: { label: string }[] } | undefined;
    if (!data) return 'Done.';
    if (data.concepts.length === 0) return "I didn't find any of the domain concepts I recognize (auth, billing, CRUD resources) with real evidence in this project.";
    const labels = data.concepts.map((c) => c.label);
    return `I found ${labels.length} recognizable domain concept${labels.length === 1 ? '' : 's'}: ${labels.join(', ')}.`;
  }
}

export const detectDomainConceptsPlugin = new DetectDomainConceptsPlugin();
