import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { analyzeProject } from '../ProjectAnalyzer';
import { buildProjectMap } from '../ProjectMapBuilder';
import { buildFeatureMap, discoverProjectRoutes } from '../FeatureMapBuilder';
import { classifyProjectAssets } from '../AssetClassifier';
import { buildDependencyGraph } from '../dependencyGraph/DependencyGraphBuilder';
import { dependencyGraphCache } from '../dependencyGraph/DependencyGraphCache';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';
import { domainConceptRegistry } from '../domainIntelligence/DomainConceptRegistry';
import type { DomainConceptDetectionInput, DomainConceptMatch } from '../domainIntelligence/DomainConceptRegistry';
import { upsertCodingFeature } from '../../memory/entities/codingFeatureEntities';
import { buildIndex } from '../semanticIndex/RepositorySemanticIndexBuilder';
import { repositorySemanticIndexStore } from '../semanticIndex/RepositorySemanticIndexStore';

/**
 * Repository Semantic Index (Coding Runtime V2, §7) — orchestrates §5 (dependency graph), §6
 * (feature discovery), §9 (domain concepts), §11 (asset classification), in that dependency order,
 * then composes their outputs into one queryable Index via `RepositorySemanticIndexBuilder`. Every
 * sub-analysis is re-run fresh rather than trusting stale prior state (the same incremental-refresh
 * discipline established for the dependency graph during the Phase 2 audit), so the Index this
 * produces is always consistent with what's actually on disk right now. Read-only from the target
 * project's perspective; available in both Paw Go and Paw Pro.
 */
export class BuildRepositorySemanticIndexPlugin extends BasePlugin {
  id = 'buildRepositorySemanticIndex';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'buildRepositorySemanticIndex';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'buildRepositorySemanticIndex') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'buildRepositorySemanticIndex') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    const root = request.rootPath;

    try {
      // §5 — Context Understanding Engine: always (re)build incrementally.
      const context = await analyzeProject(root);
      const previous = dependencyGraphCache.getPrevious(root);
      const graphResult = await buildDependencyGraph(root, previous);
      const dependencyGraph = dependencyGraphCache.store(root, graphResult);
      workspaceMemoryStore.recordDependencyGraphBuilt(root, dependencyGraph.builtAt);

      // §6 — Feature Discovery Engine: cluster, then persist each feature the same way
      // DiscoverProjectFeaturesPlugin does, so ExplainRelationshipPlugin stays able to answer "why is
      // this file part of this feature" for Index-derived answers too.
      const { features } = buildFeatureMap(root, dependencyGraph, context.framework);
      for (const feature of features) {
        upsertCodingFeature(feature, root, {
          confidence: feature.confidence,
          evidence: [{ source: 'taskExecution', detail: `Discovered via ${feature.method}.` }],
          reasoningSummary: `Clustered as one feature via ${feature.method}.`,
        });
      }

      // §9 — Domain Intelligence Engine.
      const { dependencies, devDependencies } = buildProjectMap(root);
      const routeCandidates = discoverProjectRoutes(root, dependencyGraph, context.framework);
      const domainInput: DomainConceptDetectionInput = {
        dependencies: { ...dependencies, ...devDependencies },
        filePaths: Object.keys(dependencyGraph.fileHashes).map((p) => p.replace(/\\/g, '/')),
        routeCandidates,
      };
      const domainConceptMatches = domainConceptRegistry
        .list()
        .map((pack) => pack.detect(domainInput))
        .filter((match): match is DomainConceptMatch => match !== null);

      // §11 — Asset Understanding Engine.
      const { assets } = classifyProjectAssets(root);

      // §7 — compose and persist.
      const index = buildIndex(root, dependencyGraph, features, domainConceptMatches, assets);
      repositorySemanticIndexStore.store(root, index);

      return {
        ok: true,
        data: {
          root,
          fileCount: Object.keys(index.files).length,
          features: index.features,
          domainConcepts: index.domainConcepts,
          builtAt: index.builtAt,
        },
      };
    } catch (err) {
      return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to build the repository semantic index.' };
    }
  }

  describeInProgress(): string {
    return 'Building a full semantic map of this repository (structure, features, domain concepts, assets)…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'buildRepositorySemanticIndex') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { fileCount: number; features: string[]; domainConcepts: string[] } | undefined;
    if (!data) return 'Done.';
    const parts = [`${data.fileCount} file${data.fileCount === 1 ? '' : 's'}`];
    if (data.features.length > 0) parts.push(`${data.features.length} feature${data.features.length === 1 ? '' : 's'}`);
    if (data.domainConcepts.length > 0) parts.push(`${data.domainConcepts.length} domain concept${data.domainConcepts.length === 1 ? '' : 's'}`);
    return `Indexed this repository: ${parts.join(', ')}.`;
  }
}

export const buildRepositorySemanticIndexPlugin = new BuildRepositorySemanticIndexPlugin();
