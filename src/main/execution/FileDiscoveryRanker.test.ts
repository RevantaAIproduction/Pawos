import { describe, expect, it } from 'vitest';
import { rankAffectedFiles } from './FileDiscoveryRanker';
import type { RepositorySemanticIndex, SemanticFileRecord } from './semanticIndex/RepositorySemanticIndexTypes';

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

function makeIndex(files: Record<string, SemanticFileRecord>, features: string[] = []): RepositorySemanticIndex {
  return { root: '/tmp/project', files, features, domainConcepts: [], builtAt: Date.now(), stale: false };
}

describe('rankAffectedFiles', () => {
  it('finds every file belonging to a fuzzy-matched feature at high confidence', () => {
    const index = makeIndex(
      {
        'app/dashboard/page.tsx': makeFileRecord({ path: 'app/dashboard/page.tsx', featureRefs: ['/dashboard'] }),
        'app/dashboard/Widget.tsx': makeFileRecord({ path: 'app/dashboard/Widget.tsx', featureRefs: ['/dashboard'] }),
        'app/settings/page.tsx': makeFileRecord({ path: 'app/settings/page.tsx', featureRefs: ['/settings'] }),
      },
      ['/dashboard', '/settings']
    );
    const { matches } = rankAffectedFiles(index, 'dashboard');
    const highPaths = matches.filter((m) => m.confidence === 'high').map((m) => m.path).sort();
    expect(highPaths).toEqual(['app/dashboard/Widget.tsx', 'app/dashboard/page.tsx']);
    expect(matches.every((m) => m.path !== 'app/settings/page.tsx')).toBe(true);
  });

  it('expands to a forward-import neighbor at medium confidence (1 hop)', () => {
    const index = makeIndex(
      {
        'app/dashboard/page.tsx': makeFileRecord({ path: 'app/dashboard/page.tsx', featureRefs: ['/dashboard'], imports: ['lib/formatDate.ts'] }),
        'lib/formatDate.ts': makeFileRecord({ path: 'lib/formatDate.ts' }),
      },
      ['/dashboard']
    );
    const { matches } = rankAffectedFiles(index, 'dashboard');
    const neighbor = matches.find((m) => m.path === 'lib/formatDate.ts');
    expect(neighbor?.confidence).toBe('medium');
    expect(neighbor?.method).toBe('dependency-graph-expansion');
  });

  it('expands to a reverse-import neighbor (a file that imports the seed), derived from the Index\'s own forward edges', () => {
    const index = makeIndex(
      {
        'app/dashboard/page.tsx': makeFileRecord({ path: 'app/dashboard/page.tsx', featureRefs: ['/dashboard'] }),
        'app/layout.tsx': makeFileRecord({ path: 'app/layout.tsx', imports: ['app/dashboard/page.tsx'] }),
      },
      ['/dashboard']
    );
    const { matches } = rankAffectedFiles(index, 'dashboard');
    expect(matches.find((m) => m.path === 'app/layout.tsx')?.confidence).toBe('medium');
  });

  it('decays to low confidence at 2 hops and never expands past that', () => {
    const index = makeIndex(
      {
        seed: makeFileRecord({ path: 'seed', featureRefs: ['/dashboard'], imports: ['hop1'] }),
        hop1: makeFileRecord({ path: 'hop1', imports: ['hop2'] }),
        hop2: makeFileRecord({ path: 'hop2', imports: ['hop3'] }),
        hop3: makeFileRecord({ path: 'hop3' }),
      },
      ['/dashboard']
    );
    const { matches } = rankAffectedFiles(index, 'dashboard');
    expect(matches.find((m) => m.path === 'hop1')?.confidence).toBe('medium');
    expect(matches.find((m) => m.path === 'hop2')?.confidence).toBe('low');
    expect(matches.find((m) => m.path === 'hop3')).toBeUndefined();
  });

  it('never downgrades a file already found at higher confidence by an earlier signal', () => {
    // 'shared' is both a direct feature-map hit (high) AND reachable via import expansion (would be medium).
    const index = makeIndex(
      {
        seed: makeFileRecord({ path: 'seed', featureRefs: ['/dashboard'], imports: ['shared'] }),
        shared: makeFileRecord({ path: 'shared', featureRefs: ['/dashboard'] }),
      },
      ['/dashboard']
    );
    const { matches } = rankAffectedFiles(index, 'dashboard');
    expect(matches.find((m) => m.path === 'shared')?.confidence).toBe('high');
  });

  it('falls back to fuzzy path search only when signals 1-2 found too few results', () => {
    const index = makeIndex({
      'src/authLogin.ts': makeFileRecord({ path: 'src/authLogin.ts' }),
      'src/unrelated.ts': makeFileRecord({ path: 'src/unrelated.ts' }),
    });
    const { matches } = rankAffectedFiles(index, 'authLogin');
    const fallback = matches.find((m) => m.path === 'src/authLogin.ts');
    expect(fallback?.confidence).toBe('low');
    expect(fallback?.method).toBe('fuzzy-path-search');
    expect(matches.some((m) => m.path === 'src/unrelated.ts')).toBe(false);
  });

  it('does not run the fuzzy fallback once signals 1-2 already found enough strong results', () => {
    const files: Record<string, SemanticFileRecord> = {};
    for (let i = 0; i < 6; i += 1) {
      files[`app/dashboard/File${i}.tsx`] = makeFileRecord({ path: `app/dashboard/File${i}.tsx`, featureRefs: ['/dashboard'] });
    }
    files['completely/unrelated/dashboardLookalike.ts'] = makeFileRecord({ path: 'completely/unrelated/dashboardLookalike.ts' });
    const index = makeIndex(files, ['/dashboard']);
    const { matches } = rankAffectedFiles(index, 'dashboard');
    expect(matches.some((m) => m.path === 'completely/unrelated/dashboardLookalike.ts')).toBe(false);
  });

  it('returns an empty result set with an honest note when nothing matches anywhere', () => {
    const index = makeIndex({ 'src/unrelated.ts': makeFileRecord({ path: 'src/unrelated.ts' }) });
    const { matches, note } = rankAffectedFiles(index, 'xyzzy-nonexistent-feature');
    expect(matches).toEqual([]);
    expect(note).toContain("didn't find");
  });

  it('sorts results by confidence tier (high, then medium, then low), alphabetically within a tier', () => {
    const index = makeIndex(
      {
        'app/dashboard/zebra.tsx': makeFileRecord({ path: 'app/dashboard/zebra.tsx', featureRefs: ['/dashboard'] }),
        'app/dashboard/apple.tsx': makeFileRecord({ path: 'app/dashboard/apple.tsx', featureRefs: ['/dashboard'] }),
      },
      ['/dashboard']
    );
    const { matches } = rankAffectedFiles(index, 'dashboard');
    expect(matches.map((m) => m.path)).toEqual(['app/dashboard/apple.tsx', 'app/dashboard/zebra.tsx']);
  });
});
