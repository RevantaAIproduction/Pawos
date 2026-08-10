import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-repo-semantic-index-store-test-'));
  return { app: { getPath: () => tmp } };
});

import { repositorySemanticIndexStore } from './RepositorySemanticIndexStore';
import type { RepositorySemanticIndex } from './RepositorySemanticIndexTypes';

function makeIndex(overrides: Partial<RepositorySemanticIndex> = {}): RepositorySemanticIndex {
  return {
    root: '',
    files: {
      'src/a.ts': { path: 'src/a.ts', assetKind: 'sourceCode', language: 'typescript', imports: [], exports: [], featureRefs: [], domainConceptRefs: [], indexedAt: Date.now() },
    },
    features: [],
    domainConcepts: [],
    builtAt: Date.now(),
    stale: false,
    ...overrides,
  };
}

describe('RepositorySemanticIndexStore', () => {
  beforeAll(() => {
    repositorySemanticIndexStore.init();
  });

  it('returns undefined for a project never indexed', () => {
    expect(repositorySemanticIndexStore.get('/tmp/never-indexed')).toBeUndefined();
  });

  it('stores an index and reads it back by root path', () => {
    const stored = repositorySemanticIndexStore.store('/tmp/project-one', makeIndex({ root: '/tmp/project-one' }));
    expect(stored.root).toBe('/tmp/project-one');
    const fetched = repositorySemanticIndexStore.get('/tmp/project-one');
    expect(fetched?.files['src/a.ts']?.language).toBe('typescript');
  });

  it('root path lookups are case-insensitive/normalized, matching DependencyGraphCache convention', () => {
    repositorySemanticIndexStore.store('C:/tmp/Project-Two', makeIndex({ root: 'C:/tmp/Project-Two' }));
    expect(repositorySemanticIndexStore.get('c:/tmp/project-two')).toBeDefined();
  });

  it('re-storing for the same root replaces the prior index rather than duplicating it', () => {
    repositorySemanticIndexStore.store('/tmp/project-three', makeIndex({ root: '/tmp/project-three', builtAt: 1 }));
    repositorySemanticIndexStore.store('/tmp/project-three', makeIndex({ root: '/tmp/project-three', builtAt: 2 }));
    expect(repositorySemanticIndexStore.get('/tmp/project-three')?.builtAt).toBe(2);
  });
});
