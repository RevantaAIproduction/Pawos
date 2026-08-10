import Fuse from 'fuse.js';
import { repositorySemanticIndexStore } from './RepositorySemanticIndexStore';
import { dependencyGraphCache } from '../dependencyGraph/DependencyGraphCache';
import type { RepositorySemanticIndex, SemanticFileRecord } from './RepositorySemanticIndexTypes';

/**
 * The query facade other plugins and future runtimes actually import (Coding Runtime V2, §7) —
 * `RepositorySemanticIndexStore`/`DependencyGraphCache` remain the sources of truth this reads from,
 * this is the stable public surface over them. Every read is computed fresh from the store on each
 * call (no separate in-memory cache of its own), so there is only ever one place the underlying data
 * can go stale.
 */
class RepositorySemanticIndexService {
  /**
   * The persisted Index, honestly re-flagged `stale: true` when a newer dependency-graph build is
   * known to exist than the one this Index was composed from — computed here at read time rather
   * than requiring every call site to remember to check, mirroring `WorkspaceMemoryStore.markStale()`'s
   * intent (never silently serve outdated data as current) without needing a write on every
   * dependency-graph rebuild.
   */
  getIndex(root: string): RepositorySemanticIndex | undefined {
    const index = repositorySemanticIndexStore.get(root);
    if (!index) return undefined;
    const graph = dependencyGraphCache.get(root);
    if (graph && graph.builtAt > index.builtAt && !index.stale) {
      return { ...index, stale: true };
    }
    return index;
  }

  getFileRecord(root: string, relPath: string): SemanticFileRecord | undefined {
    return this.getIndex(root)?.files[relPath.replace(/\\/g, '/')];
  }

  getFilesForFeature(root: string, featureName: string): string[] {
    const index = this.getIndex(root);
    if (!index) return [];
    return Object.values(index.files)
      .filter((f) => f.featureRefs.includes(featureName))
      .map((f) => f.path)
      .sort();
  }

  getFilesWithDomainConcept(root: string, conceptId: string): string[] {
    const index = this.getIndex(root);
    if (!index) return [];
    return Object.values(index.files)
      .filter((f) => f.domainConceptRefs.includes(conceptId))
      .map((f) => f.path)
      .sort();
  }

  /** Reverse-edge lookup — delegates directly to `DependencyGraphCache.getImporters()` rather than duplicating it, since the forward edges it needs already live there. */
  getImporters(root: string, relPath: string): string[] {
    return dependencyGraphCache.getImporters(root, relPath.replace(/\\/g, '/'));
  }

  /** Fuzzy path search over the Index's file records — the direct, honest upgrade of a plain substring match, mirroring `fuzzyRank()`'s established Fuse.js usage. */
  search(root: string, query: string): string[] {
    const index = this.getIndex(root);
    if (!index) return [];
    const paths = Object.keys(index.files);
    const fuse = new Fuse(paths, { threshold: 0.4 });
    return fuse.search(query).map((r) => r.item);
  }
}

export const repositorySemanticIndexService = new RepositorySemanticIndexService();
