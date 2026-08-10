import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-dependency-graph-cache-test-'));
  return { app: { getPath: () => tmp } };
});

import { dependencyGraphCache } from './DependencyGraphCache';
import type { DependencyGraphBuildResult } from './DependencyGraphBuilder';

function makeResult(overrides: Partial<DependencyGraphBuildResult> = {}): DependencyGraphBuildResult {
  return {
    edges: { 'src/a.ts': ['src/b.ts'], 'src/b.ts': [] },
    exports: { 'src/a.ts': ['default'], 'src/b.ts': ['helper'] },
    fileHashes: { 'src/a.ts': 1000, 'src/b.ts': 2000 },
    filesAnalyzed: 2,
    filesSkipped: 0,
    filesReused: 0,
    ...overrides,
  };
}

describe('DependencyGraphCache', () => {
  beforeAll(() => {
    dependencyGraphCache.init();
  });

  it('returns undefined for a project that was never built', () => {
    expect(dependencyGraphCache.get('/tmp/never-built')).toBeUndefined();
    expect(dependencyGraphCache.getPrevious('/tmp/never-built')).toBeUndefined();
  });

  it('stores a build result and can read it back by root path', () => {
    const record = dependencyGraphCache.store('/tmp/project-one', makeResult());
    expect(record.root).toBe('/tmp/project-one');
    expect(record.edges['src/a.ts']).toEqual(['src/b.ts']);

    const fetched = dependencyGraphCache.get('/tmp/project-one');
    expect(fetched?.edges).toEqual(record.edges);
  });

  it('getPrevious() returns the shape DependencyGraphBuilder expects for incremental rebuilds', () => {
    dependencyGraphCache.store('/tmp/project-two', makeResult());
    const previous = dependencyGraphCache.getPrevious('/tmp/project-two');
    expect(previous).toEqual({
      fileHashes: { 'src/a.ts': 1000, 'src/b.ts': 2000 },
      edges: { 'src/a.ts': ['src/b.ts'], 'src/b.ts': [] },
      exports: { 'src/a.ts': ['default'], 'src/b.ts': ['helper'] },
    });
  });

  it('getImporters() finds every file whose edges include the target', () => {
    dependencyGraphCache.store(
      '/tmp/project-three',
      makeResult({
        edges: {
          'src/a.ts': ['src/shared.ts'],
          'src/b.ts': ['src/shared.ts'],
          'src/c.ts': ['src/other.ts'],
          'src/shared.ts': [],
        },
      })
    );
    const importers = dependencyGraphCache.getImporters('/tmp/project-three', 'src/shared.ts');
    expect(importers.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('root path lookups are case-insensitive/normalized, matching WorkspaceMemoryStore convention', () => {
    dependencyGraphCache.store('C:/tmp/Project-Four', makeResult());
    expect(dependencyGraphCache.get('c:/tmp/project-four')).toBeDefined();
  });
});
