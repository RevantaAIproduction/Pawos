import type { AssetKind } from '../AssetClassifier';

/**
 * One file's composed knowledge (Coding Runtime V2, §7) — every field here is a *reference* to a
 * fact whose real source of truth lives elsewhere (the dependency graph for imports/exports, the
 * `codingFeature` Memory Graph entities for feature evidence), never a second copy of that source's
 * own evidence/provenance. A file no `LanguageProvider` recognizes gets `language: 'unknown'` and
 * empty `imports`/`exports` — an honest "no analysis was possible," never a guess.
 */
export type SemanticFileRecord = {
  path: string;
  assetKind: AssetKind;
  language: string;
  imports: string[];
  exports: string[];
  /** Feature name(s) this file belongs to (Phase 2's union-find clustering means a file belongs to at most one in practice). */
  featureRefs: string[];
  /** Domain concept id(s) (Phase 4) this file evidences. */
  domainConceptRefs: string[];
  indexedAt: number;
};

/**
 * A disposable, rebuildable composition over a project's already-gathered structural facts — the
 * central knowledge layer future runtimes (Intelligent File Discovery, Phase 6; a future
 * documentation generator; etc.) query instead of each independently re-combining the dependency
 * graph, feature map, domain concepts, and asset classifications on their own.
 */
export type RepositorySemanticIndex = {
  root: string;
  files: Record<string, SemanticFileRecord>;
  features: string[];
  domainConcepts: string[];
  builtAt: number;
  /** True when a newer dependency-graph build is known to exist than the one this Index was composed from — computed honestly at read time by `RepositorySemanticIndexService`, never silently served as current. */
  stale: boolean;
};
