import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-coding-feature-entities-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../MemoryGraphStore';
import { findCodingFeature, findCodeFile, findCodeFileByPath, findCodingFeatureByName, upsertCodingFeature } from './codingFeatureEntities';
import { RELATION } from '../relationVocabulary';
import type { CodingFeature } from '../../execution/FeatureMapBuilder';

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

describe('codingFeatureEntities', () => {
  beforeAll(() => {
    memoryGraphStore.init();
  });

  it('creates a new codingFeature entity and links every constituent file via IMPLEMENTED_BY', () => {
    const entity = upsertCodingFeature(makeFeature(), '/tmp/project-one', {
      confidence: 0.6,
      evidence: [{ source: 'taskExecution', detail: 'Discovered via route-convention + import-graph.' }],
      reasoningSummary: 'Clustered as one feature.',
    });

    expect(entity.type).toBe('codingFeature');
    expect(entity.attributes).toMatchObject({ projectRoot: '/tmp/project-one', name: '/dashboard' });

    const pageFile = findCodeFile('/tmp/project-one', 'app/dashboard/page.tsx');
    const widgetFile = findCodeFile('/tmp/project-one', 'app/dashboard/Widget.tsx');
    expect(pageFile).toBeDefined();
    expect(widgetFile).toBeDefined();

    const related = memoryGraphStore.getRelated(entity.id, RELATION.IMPLEMENTED_BY);
    const relatedPaths = related.map((e) => (e.attributes as { path: string }).path).sort();
    expect(relatedPaths).toEqual(['app/dashboard/Widget.tsx', 'app/dashboard/page.tsx']);
  });

  it('re-running on the same project versions the same entity instead of duplicating it', () => {
    upsertCodingFeature(makeFeature(), '/tmp/project-two', {
      confidence: 0.4,
      evidence: [],
      reasoningSummary: 'first pass',
    });
    const first = findCodingFeature('/tmp/project-two', '/dashboard');
    expect(first?.version).toBe(1);

    upsertCodingFeature(makeFeature({ confidence: 0.6 }), '/tmp/project-two', {
      confidence: 0.6,
      evidence: [],
      reasoningSummary: 'second pass',
    });
    const second = findCodingFeature('/tmp/project-two', '/dashboard');
    expect(second?.id).toBe(first?.id);
    expect(second?.version).toBe(2);
  });

  it('supersedes stale IMPLEMENTED_BY edges rather than accumulating duplicates across re-analysis', () => {
    const entity = upsertCodingFeature(makeFeature(), '/tmp/project-three', {
      confidence: 0.6,
      evidence: [],
      reasoningSummary: 'first pass',
    });
    upsertCodingFeature(makeFeature(), '/tmp/project-three', {
      confidence: 0.6,
      evidence: [],
      reasoningSummary: 'second pass, identical file set',
    });

    const activeEdges = memoryGraphStore.getRelated(entity.id, RELATION.IMPLEMENTED_BY);
    // Same two files both times — must still be exactly two *active* edges, not four.
    expect(activeEdges).toHaveLength(2);

    const allEdgesEver = memoryGraphStore.getEntityHistory(entity.id).filter((e) => e.relation === RELATION.IMPLEMENTED_BY);
    // But the full history (active + superseded) does show both linking passes happened.
    expect(allEdgesEver.length).toBeGreaterThanOrEqual(4);
  });

  it('drops a file from IMPLEMENTED_BY when a re-analysis no longer includes it', () => {
    const entity = upsertCodingFeature(makeFeature({ componentFiles: ['app/dashboard/Widget.tsx', 'app/dashboard/Chart.tsx'] }), '/tmp/project-four', {
      confidence: 0.6,
      evidence: [],
      reasoningSummary: 'first pass',
    });
    let related = memoryGraphStore.getRelated(entity.id, RELATION.IMPLEMENTED_BY);
    expect(related.map((e) => (e.attributes as { path: string }).path).sort()).toEqual([
      'app/dashboard/Chart.tsx',
      'app/dashboard/Widget.tsx',
      'app/dashboard/page.tsx',
    ]);

    // Chart.tsx no longer part of the feature on re-analysis.
    upsertCodingFeature(makeFeature({ componentFiles: ['app/dashboard/Widget.tsx'] }), '/tmp/project-four', {
      confidence: 0.6,
      evidence: [],
      reasoningSummary: 'second pass, Chart.tsx dropped',
    });
    related = memoryGraphStore.getRelated(entity.id, RELATION.IMPLEMENTED_BY);
    expect(related.map((e) => (e.attributes as { path: string }).path).sort()).toEqual(['app/dashboard/Widget.tsx', 'app/dashboard/page.tsx']);
  });

  it('keeps features from different projects with the same name separate', () => {
    upsertCodingFeature(makeFeature(), '/tmp/project-five-a', { confidence: 0.4, evidence: [], reasoningSummary: 'a' });
    upsertCodingFeature(makeFeature(), '/tmp/project-five-b', { confidence: 0.4, evidence: [], reasoningSummary: 'b' });
    const a = findCodingFeature('/tmp/project-five-a', '/dashboard');
    const b = findCodingFeature('/tmp/project-five-b', '/dashboard');
    expect(a?.id).not.toBe(b?.id);
  });

  // Global (no-projectRoot) lookups added for resolveEntityRef (System Integration Audit, 2026-08-01)
  // so codingFeature/codeFile entities are resolvable by natural key the way file/workspace/
  // coding-project entities already are — same convention as fileEntities.ts's findFileEntityByPath.
  it('findCodingFeatureByName resolves a feature by bare name without needing its projectRoot', () => {
    const entity = upsertCodingFeature(makeFeature({ name: '/checkout' }), '/tmp/project-six', {
      confidence: 0.6,
      evidence: [],
      reasoningSummary: 'named lookup test',
    });
    expect(findCodingFeatureByName('/checkout')?.id).toBe(entity.id);
    expect(findCodingFeatureByName('/CHECKOUT')?.id).toBe(entity.id);
    expect(findCodingFeatureByName('/nonexistent-feature')).toBeUndefined();
  });

  it('findCodeFileByPath resolves a codeFile entity by bare relative path without needing its projectRoot', () => {
    const entity = upsertCodingFeature(makeFeature({ name: '/reports', routeFiles: ['app/reports/page.tsx'], componentFiles: [] }), '/tmp/project-seven', {
      confidence: 0.6,
      evidence: [],
      reasoningSummary: 'path lookup test',
    });
    const byRoot = findCodeFile('/tmp/project-seven', 'app/reports/page.tsx');
    expect(byRoot).toBeDefined();
    expect(findCodeFileByPath('app/reports/page.tsx')?.id).toBe(byRoot?.id);
    expect(entity).toBeDefined();
  });
});
