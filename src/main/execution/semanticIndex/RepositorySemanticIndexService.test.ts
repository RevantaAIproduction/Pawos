import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-repo-semantic-index-service-test-'));
  return { app: { getPath: () => tmp } };
});

import { repositorySemanticIndexStore } from './RepositorySemanticIndexStore';
import { repositorySemanticIndexService } from './RepositorySemanticIndexService';
import { dependencyGraphCache } from '../dependencyGraph/DependencyGraphCache';
import type { RepositorySemanticIndex, SemanticFileRecord } from './RepositorySemanticIndexTypes';
import type { DependencyGraphBuildResult } from '../dependencyGraph/DependencyGraphBuilder';

function makeFileRecord(overrides: Partial<SemanticFileRecord> = {}): SemanticFileRecord {
  return {
    path: 'src/a.ts',
    assetKind: 'sourceCode',
    language: 'typescript',
    imports: [],
    exports: [],
    featureRefs: [],
    domainConceptRefs: [],
    indexedAt: Date.now(),
    ...overrides,
  };
}

function makeIndex(root: string, files: Record<string, SemanticFileRecord>, overrides: Partial<RepositorySemanticIndex> = {}): RepositorySemanticIndex {
  return {
    root,
    files,
    features: [],
    domainConcepts: [],
    builtAt: Date.now(),
    stale: false,
    ...overrides,
  };
}

function makeGraphResult(overrides: Partial<DependencyGraphBuildResult> = {}): DependencyGraphBuildResult {
  return { edges: {}, exports: {}, fileHashes: {}, filesAnalyzed: 0, filesSkipped: 0, filesReused: 0, ...overrides };
}

describe('RepositorySemanticIndexService', () => {
  beforeAll(() => {
    repositorySemanticIndexStore.init();
    dependencyGraphCache.init();
  });

  it('getFileRecord returns the record for a real indexed path, and undefined for an unindexed project', () => {
    repositorySemanticIndexStore.store('/tmp/svc-one', makeIndex('/tmp/svc-one', { 'src/a.ts': makeFileRecord() }));
    expect(repositorySemanticIndexService.getFileRecord('/tmp/svc-one', 'src/a.ts')?.language).toBe('typescript');
    expect(repositorySemanticIndexService.getFileRecord('/tmp/svc-never-indexed', 'src/a.ts')).toBeUndefined();
  });

  it('getFilesForFeature returns every file referencing that feature, sorted', () => {
    repositorySemanticIndexStore.store(
      '/tmp/svc-two',
      makeIndex('/tmp/svc-two', {
        'src/b.ts': makeFileRecord({ path: 'src/b.ts', featureRefs: ['/dashboard'] }),
        'src/a.ts': makeFileRecord({ path: 'src/a.ts', featureRefs: ['/dashboard'] }),
        'src/c.ts': makeFileRecord({ path: 'src/c.ts', featureRefs: ['/settings'] }),
      })
    );
    expect(repositorySemanticIndexService.getFilesForFeature('/tmp/svc-two', '/dashboard')).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('getFilesWithDomainConcept returns every file evidencing that concept', () => {
    repositorySemanticIndexStore.store(
      '/tmp/svc-three',
      makeIndex('/tmp/svc-three', {
        'src/auth.ts': makeFileRecord({ path: 'src/auth.ts', domainConceptRefs: ['auth'] }),
        'src/other.ts': makeFileRecord({ path: 'src/other.ts', domainConceptRefs: [] }),
      })
    );
    expect(repositorySemanticIndexService.getFilesWithDomainConcept('/tmp/svc-three', 'auth')).toEqual(['src/auth.ts']);
  });

  it('getImporters delegates to DependencyGraphCache rather than duplicating the reverse-edge lookup', () => {
    dependencyGraphCache.store('/tmp/svc-four', makeGraphResult({ edges: { 'src/a.ts': ['src/shared.ts'], 'src/shared.ts': [] } }));
    expect(repositorySemanticIndexService.getImporters('/tmp/svc-four', 'src/shared.ts')).toEqual(['src/a.ts']);
  });

  it('search fuzzy-matches file paths in the index', () => {
    repositorySemanticIndexStore.store(
      '/tmp/svc-five',
      makeIndex('/tmp/svc-five', {
        'src/dashboard/Widget.tsx': makeFileRecord({ path: 'src/dashboard/Widget.tsx' }),
        'src/settings/Panel.tsx': makeFileRecord({ path: 'src/settings/Panel.tsx' }),
      })
    );
    const results = repositorySemanticIndexService.search('/tmp/svc-five', 'Widget');
    expect(results).toContain('src/dashboard/Widget.tsx');
  });

  it('getIndex reports stale: true when a newer dependency graph build is known than the one the index was built from, without mutating the persisted record', () => {
    const oldBuiltAt = 1000;
    repositorySemanticIndexStore.store('/tmp/svc-six', makeIndex('/tmp/svc-six', {}, { builtAt: oldBuiltAt, stale: false }));
    const record = dependencyGraphCache.store('/tmp/svc-six', makeGraphResult());
    expect(record.builtAt).toBeGreaterThan(oldBuiltAt);

    const read = repositorySemanticIndexService.getIndex('/tmp/svc-six');
    expect(read?.stale).toBe(true);

    // The persisted record itself must remain untouched — staleness is computed at read time only.
    expect(repositorySemanticIndexStore.get('/tmp/svc-six')?.stale).toBe(false);
  });

  it('getIndex reports stale: false when no newer dependency graph build exists', () => {
    const future = Date.now() + 1_000_000;
    repositorySemanticIndexStore.store('/tmp/svc-seven', makeIndex('/tmp/svc-seven', {}, { builtAt: future, stale: false }));
    expect(repositorySemanticIndexService.getIndex('/tmp/svc-seven')?.stale).toBe(false);
  });
});
