import type { DependencyGraphRecord } from '../dependencyGraph/DependencyGraphCache';
import type { CodingFeature } from '../FeatureMapBuilder';
import type { ClassifiedAsset } from '../AssetClassifier';
import type { DomainConceptMatch } from '../domainIntelligence/DomainConceptRegistry';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import type { RepositorySemanticIndex, SemanticFileRecord } from './RepositorySemanticIndexTypes';

function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, '/');
}

/**
 * Pure composition over already-gathered facts (Coding Runtime V2, §7) — never re-derives anything
 * itself, only combines outputs `BuildRepositorySemanticIndexPlugin` has already produced by
 * orchestrating §5 (dependency graph), §6 (feature map), §9 (domain concepts), §11 (asset
 * classification), in that dependency order. Mirrors `FeatureMapBuilder.buildFeatureMap()`'s own
 * "pure function over explicit inputs" shape so this composition step stays fully unit-testable
 * against fake inputs, with no real filesystem access of its own.
 */
export function buildIndex(
  root: string,
  dependencyGraph: DependencyGraphRecord | undefined,
  features: CodingFeature[],
  domainConceptMatches: DomainConceptMatch[],
  classifiedAssets: ClassifiedAsset[]
): RepositorySemanticIndex {
  const files: Record<string, SemanticFileRecord> = {};

  function ensureRecord(relPath: string): SemanticFileRecord {
    const normalized = normalizeRel(relPath);
    const existing = files[normalized];
    if (existing) return existing;
    const provider = languageProviderRegistry.getProviderForFile(normalized);
    const record: SemanticFileRecord = {
      path: normalized,
      assetKind: 'other',
      language: provider?.id ?? 'unknown',
      imports: dependencyGraph?.edges[normalized] ?? [],
      exports: dependencyGraph?.exports[normalized] ?? [],
      featureRefs: [],
      domainConceptRefs: [],
      indexedAt: Date.now(),
    };
    files[normalized] = record;
    return record;
  }

  // The dependency graph's own file set is a real, independent source of "this file exists" —
  // ensure every file it knows about gets a record even if, in some caller, classifiedAssets
  // doesn't happen to include it (in production BuildRepositorySemanticIndexPlugin always passes a
  // full-project classifiedAssets, a superset of the dependency graph's files, but this function
  // must not silently drop dependency-graph data just because another input is narrower).
  if (dependencyGraph) {
    for (const relPath of Object.keys(dependencyGraph.fileHashes)) ensureRecord(relPath);
  }

  // Asset classification is the authoritative source for every file's assetKind, and (via
  // AssetClassifier's own full-project walk) the only one of the four inputs that sees every real
  // file — walk it so a file none of the other three analyses touch still gets an entry.
  for (const asset of classifiedAssets) {
    ensureRecord(asset.path).assetKind = asset.kind;
  }

  for (const feature of features) {
    const featureFiles = [...feature.routeFiles, ...feature.componentFiles, ...feature.dataModelFiles, ...feature.configFiles, ...feature.testFiles];
    for (const relPath of featureFiles) {
      const record = ensureRecord(relPath);
      if (!record.featureRefs.includes(feature.name)) record.featureRefs.push(feature.name);
    }
  }

  for (const match of domainConceptMatches) {
    for (const relPath of match.files) {
      const record = ensureRecord(relPath);
      if (!record.domainConceptRefs.includes(match.conceptId)) record.domainConceptRefs.push(match.conceptId);
    }
  }

  return {
    root,
    files,
    features: features.map((f) => f.name).sort(),
    domainConcepts: [...new Set(domainConceptMatches.map((m) => m.conceptId))].sort(),
    builtAt: Date.now(),
    stale: false,
  };
}
