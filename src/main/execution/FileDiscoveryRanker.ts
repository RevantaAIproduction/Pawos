import Fuse from 'fuse.js';
import type { RepositorySemanticIndex } from './semanticIndex/RepositorySemanticIndexTypes';

// "Too few" signals 1-2 found before the fuzzy fallback (§8, step 3) is worth running.
const MIN_STRONG_RESULTS_BEFORE_FALLBACK = 5;
// Bounded BFS depth for dependency-graph expansion (§8, step 2) — matches the plan's own "1-2 hops"
// bound, and the same maxDepth precedent MemoryGraphStore.getProvenanceChain()/FeatureMapBuilder's
// computeReachable() already established for this codebase.
const MAX_HOPS = 2;
// Caps the total result set returned — mirrors FeatureMapBuilder's MAX_FILES_PER_FEATURE discipline
// rather than dumping an unbounded list for a very large or very generic query.
const MAX_MATCHES = 100;

export type FileDiscoveryConfidence = 'high' | 'medium' | 'low';

export type FileDiscoveryMatch = {
  path: string;
  confidence: FileDiscoveryConfidence;
  reason: string;
  method: 'feature-map-hit' | 'dependency-graph-expansion' | 'fuzzy-path-search';
};

export type FileDiscoveryResult = { matches: FileDiscoveryMatch[]; note: string };

const CONFIDENCE_RANK: Record<FileDiscoveryConfidence, number> = { high: 3, medium: 2, low: 1 };

function upsert(results: Map<string, FileDiscoveryMatch>, match: FileDiscoveryMatch): void {
  const existing = results.get(match.path);
  // A file already found with higher (or equal) confidence by an earlier signal is never downgraded
  // by a later, weaker signal — e.g. a file already a direct feature-map hit stays 'high' even if
  // dependency-graph expansion would also reach it as a 'medium' neighbor.
  if (!existing || CONFIDENCE_RANK[match.confidence] > CONFIDENCE_RANK[existing.confidence]) {
    results.set(match.path, match);
  }
}

/** Inverts every file's forward `imports` into a reverse (importers) map, once, from data the Index
 * already carries — avoids repeatedly asking `DependencyGraphCache.getImporters()` for a fresh O(n)
 * scan per BFS-frontier node when the Index (already fetched, and confirmed non-stale by the caller)
 * carries the same forward-edge data needed to derive it directly. */
function buildReverseEdges(index: RepositorySemanticIndex): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const record of Object.values(index.files)) {
    for (const imported of record.imports) {
      const importers = reverse.get(imported);
      if (importers) importers.push(record.path);
      else reverse.set(imported, [record.path]);
    }
  }
  return reverse;
}

/**
 * Three-signal, evidence-ranked file discovery (Coding Runtime V2, §8) — combines a Repository
 * Semantic Index's already-composed knowledge (features, imports) with a scoped fuzzy path search,
 * each signal carrying an honest confidence tier, never a single flat guess. A pure function over one
 * explicit input (the Index) — the same "pure composition over already-gathered facts" shape
 * `FeatureMapBuilder.buildFeatureMap()` and `RepositorySemanticIndexBuilder.buildIndex()` already
 * established for this codebase. Reverse (importer) edges are derived from the Index's own forward
 * `imports` data rather than re-querying `DependencyGraphCache` per node.
 */
export function rankAffectedFiles(index: RepositorySemanticIndex, query: string): FileDiscoveryResult {
  const results = new Map<string, FileDiscoveryMatch>();
  const reverseEdges = buildReverseEdges(index);

  // Step 1 — feature-map hit: fuzzy-match the request against known feature names, then every file
  // that feature claims is a high-confidence candidate (a traced structural reason exists).
  const matchedFeatures = index.features.length > 0 ? new Fuse(index.features, { threshold: 0.4 }).search(query).map((r) => r.item) : [];
  for (const featureName of matchedFeatures) {
    for (const record of Object.values(index.files)) {
      if (record.featureRefs.includes(featureName)) {
        upsert(results, {
          path: record.path,
          confidence: 'high',
          reason: `Part of the "${featureName}" feature, matched from your request.`,
          method: 'feature-map-hit',
        });
      }
    }
  }

  // Step 2 — dependency-graph expansion from step 1's seeds, both import directions, decaying
  // confidence per hop (medium at 1 hop, low at 2 hops) and capped at MAX_HOPS. A file with no
  // feature-map hit at all never seeds this step — there is nothing to expand from.
  const seeds = [...results.keys()];
  if (seeds.length > 0) {
    let frontier = new Set(seeds);
    const visited = new Set(seeds);
    for (let hop = 1; hop <= MAX_HOPS && frontier.size > 0; hop += 1) {
      const confidence: FileDiscoveryConfidence = hop === 1 ? 'medium' : 'low';
      const next = new Set<string>();
      for (const path of frontier) {
        const forward = index.files[path]?.imports ?? [];
        const reverse = reverseEdges.get(path) ?? [];
        for (const neighbor of [...forward, ...reverse]) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          next.add(neighbor);
          upsert(results, {
            path: neighbor,
            confidence,
            reason: `Connected via imports to a matched feature file (${hop} hop${hop === 1 ? '' : 's'} away).`,
            method: 'dependency-graph-expansion',
          });
        }
      }
      frontier = next;
    }
  }

  // Step 3 — scoped fuzzy path search: the direct, honest upgrade of a plain substring match to
  // typo-tolerant fuzzy matching, explicitly the lowest-confidence signal, run only when signals 1-2
  // together found too few results to be useful on their own.
  const strongCount = [...results.values()].filter((m) => m.confidence !== 'low').length;
  if (strongCount < MIN_STRONG_RESULTS_BEFORE_FALLBACK) {
    const paths = Object.keys(index.files);
    const fuse = new Fuse(paths, { threshold: 0.4 });
    for (const hit of fuse.search(query)) {
      if (!results.has(hit.item)) {
        upsert(results, {
          path: hit.item,
          confidence: 'low',
          reason: 'File path fuzzily matches your request keywords.',
          method: 'fuzzy-path-search',
        });
      }
    }
  }

  const matches = [...results.values()]
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || a.path.localeCompare(b.path))
    .slice(0, MAX_MATCHES);

  const high = matches.filter((m) => m.confidence === 'high').length;
  const medium = matches.filter((m) => m.confidence === 'medium').length;
  const low = matches.filter((m) => m.confidence === 'low').length;
  const note =
    matches.length === 0
      ? "I didn't find any files clearly related to that request — try mentioning a specific feature, route, or file name."
      : `${high} high-confidence, ${medium} medium-confidence, ${low} low-confidence match${matches.length === 1 ? '' : 'es'}.`;

  return { matches, note };
}
