import { beforeAll, describe, expect, it } from 'vitest';
import { buildIndex } from './RepositorySemanticIndexBuilder';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import { typeScriptLanguageProvider } from '../languageProviders/TypeScriptLanguageProvider';
import type { DependencyGraphRecord } from '../dependencyGraph/DependencyGraphCache';
import type { CodingFeature } from '../FeatureMapBuilder';
import type { ClassifiedAsset } from '../AssetClassifier';
import type { DomainConceptMatch } from '../domainIntelligence/DomainConceptRegistry';

beforeAll(() => {
  languageProviderRegistry.registerProvider(typeScriptLanguageProvider);
});

function makeGraph(overrides: Partial<DependencyGraphRecord> = {}): DependencyGraphRecord {
  return {
    root: '',
    builtAt: Date.now(),
    fileHashes: { 'app/dashboard/page.tsx': 1, 'app/dashboard/Widget.tsx': 1 },
    edges: { 'app/dashboard/page.tsx': ['app/dashboard/Widget.tsx'], 'app/dashboard/Widget.tsx': [] },
    exports: { 'app/dashboard/page.tsx': ['default'], 'app/dashboard/Widget.tsx': ['Widget'] },
    ...overrides,
  };
}

function makeFeature(overrides: Partial<CodingFeature> = {}): CodingFeature {
  return {
    name: '/dashboard',
    routeFiles: ['app/dashboard/page.tsx'],
    componentFiles: ['app/dashboard/Widget.tsx'],
    dataModelFiles: [],
    configFiles: [],
    testFiles: [],
    confidence: 0.6,
    method: 'route-convention + import-graph',
    ...overrides,
  };
}

describe('RepositorySemanticIndexBuilder.buildIndex', () => {
  it('records real imports/exports/language for a file the dependency graph knows about', () => {
    const index = buildIndex('/tmp/project', makeGraph(), [], [], []);
    const record = index.files['app/dashboard/page.tsx'];
    expect(record?.language).toBe('typescript');
    expect(record?.imports).toEqual(['app/dashboard/Widget.tsx']);
    expect(record?.exports).toEqual(['default']);
  });

  it('honestly records language: unknown and empty imports/exports for a file no LanguageProvider recognizes', () => {
    const asset: ClassifiedAsset = { path: 'assets/logo.png', kind: 'image' };
    const index = buildIndex('/tmp/project', makeGraph(), [], [], [asset]);
    const record = index.files['assets/logo.png'];
    expect(record?.language).toBe('unknown');
    expect(record?.imports).toEqual([]);
    expect(record?.exports).toEqual([]);
  });

  it('attaches assetKind from the classified assets input', () => {
    const assets: ClassifiedAsset[] = [
      { path: 'app/dashboard/page.tsx', kind: 'sourceCode' },
      { path: 'app/dashboard/Widget.tsx', kind: 'sourceCode' },
    ];
    const index = buildIndex('/tmp/project', makeGraph(), [], [], assets);
    expect(index.files['app/dashboard/page.tsx']?.assetKind).toBe('sourceCode');
  });

  it('populates featureRefs for every file in a feature, and the top-level features list', () => {
    const index = buildIndex('/tmp/project', makeGraph(), [makeFeature()], [], []);
    expect(index.files['app/dashboard/page.tsx']?.featureRefs).toEqual(['/dashboard']);
    expect(index.files['app/dashboard/Widget.tsx']?.featureRefs).toEqual(['/dashboard']);
    expect(index.features).toEqual(['/dashboard']);
  });

  it('populates domainConceptRefs for every file a domain concept match cites, and the top-level domainConcepts list', () => {
    const match: DomainConceptMatch = {
      conceptId: 'auth',
      label: 'Authentication',
      files: ['app/dashboard/Widget.tsx'],
      evidence: 'test evidence',
      confidence: 0.6,
    };
    const index = buildIndex('/tmp/project', makeGraph(), [], [match], []);
    expect(index.files['app/dashboard/Widget.tsx']?.domainConceptRefs).toEqual(['auth']);
    expect(index.domainConcepts).toEqual(['auth']);
  });

  it('creates one record per file even when a file is referenced by multiple inputs, never duplicating it', () => {
    const assets: ClassifiedAsset[] = [{ path: 'app/dashboard/Widget.tsx', kind: 'sourceCode' }];
    const match: DomainConceptMatch = { conceptId: 'auth', label: 'Authentication', files: ['app/dashboard/Widget.tsx'], evidence: 'e', confidence: 0.5 };
    const index = buildIndex('/tmp/project', makeGraph(), [makeFeature()], [match], assets);
    expect(Object.keys(index.files).filter((p) => p === 'app/dashboard/Widget.tsx')).toHaveLength(1);
    const record = index.files['app/dashboard/Widget.tsx'];
    expect(record?.assetKind).toBe('sourceCode');
    expect(record?.featureRefs).toEqual(['/dashboard']);
    expect(record?.domainConceptRefs).toEqual(['auth']);
  });

  it('is never marked stale at construction time — staleness is a read-time concern for the service', () => {
    const index = buildIndex('/tmp/project', makeGraph(), [], [], []);
    expect(index.stale).toBe(false);
  });
});
