import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-coding-runtime-memory-entities-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../MemoryGraphStore';
import { upsertCodingProject } from './codingProjectEntities';
import {
  recordCodingEditHistory,
  queryCodingEditHistory,
  recordArchitecturalDecision,
  queryArchitecturalDecisions,
  recordCodingPreference,
  queryCodingPreferences,
  type CodingEditHistoryAttributes,
  type CodingUserPreferenceAttributes,
} from './codingRuntimeMemoryEntities';
import { RELATION } from '../relationVocabulary';

function minimalProject(root: string) {
  return {
    root,
    workspaceName: 'test',
    framework: null,
    language: 'typescript',
    packageManager: 'npm',
    buildTool: null,
    git: { isRepo: false },
    dependencies: {},
    devDependencies: {},
    entryPoint: null,
    fileTree: [],
    fileTreeTruncated: false,
  };
}

describe('codingRuntimeMemoryEntities', () => {
  beforeAll(() => memoryGraphStore.init());

  describe('codingEditHistory', () => {
    it('always creates a new entity per call, never upserting in place', () => {
      const root = 'C:/fake/edit-history-project';
      const first = recordCodingEditHistory(root, 'Renamed getUser to fetchUser', ['a.ts']);
      const second = recordCodingEditHistory(root, 'Fixed a typo', ['b.ts']);
      expect(first.id).not.toBe(second.id);
    });

    it('links to an existing codingProject via BELONGS_TO when one has been analyzed', () => {
      const root = 'C:/fake/edit-history-linked-project';
      const project = upsertCodingProject(minimalProject(root));
      const entry = recordCodingEditHistory(root, 'Added a feature', ['x.ts']);
      const edges = memoryGraphStore.getAllEdgesFor(entry.id);
      expect(edges.some((e) => e.relation === RELATION.BELONGS_TO && e.toId === project.id)).toBe(true);
    });

    it('never fabricates a project link for a root that has never been analyzed', () => {
      const root = 'C:/fake/edit-history-unlinked-project';
      const entry = recordCodingEditHistory(root, 'Added a feature', ['x.ts']);
      const edges = memoryGraphStore.getAllEdgesFor(entry.id);
      expect(edges.some((e) => e.relation === RELATION.BELONGS_TO)).toBe(false);
    });

    it('links every changed file via RELATION.MODIFIED', () => {
      const root = 'C:/fake/edit-history-modified-files';
      const entry = recordCodingEditHistory(root, 'Touched two files', ['a.ts', 'b.ts']);
      const edges = memoryGraphStore.getAllEdgesFor(entry.id).filter((e) => e.relation === RELATION.MODIFIED);
      expect(edges).toHaveLength(2);
    });

    it('queries the most recent edits first, scoped to the project root', () => {
      const root = 'C:/fake/edit-history-query-project';
      recordCodingEditHistory(root, 'First edit', ['a.ts']);
      recordCodingEditHistory(root, 'Second edit', ['b.ts']);
      const results = queryCodingEditHistory(root).map((e) => (e.attributes as CodingEditHistoryAttributes).description);
      expect(results[0]).toBe('Second edit');
      expect(results[1]).toBe('First edit');
    });
  });

  describe('codingArchitecturalDecision', () => {
    it('always creates a new entity per call — a later decision is new evidence, not a correction', () => {
      const root = 'C:/fake/decision-project';
      const first = recordArchitecturalDecision(root, 'Use REST', 'Simpler for this team');
      const second = recordArchitecturalDecision(root, 'Switch to GraphQL', 'Need field-level fetching');
      expect(first.id).not.toBe(second.id);
      const decisions = queryArchitecturalDecisions(root);
      expect(decisions).toHaveLength(2);
    });
  });

  describe('codingUserPreference', () => {
    it('upserts a project-scoped preference in place when the same key is re-recorded', () => {
      const root = 'C:/fake/preference-project';
      const first = recordCodingPreference('project', 'exportStyle', 'default', root);
      const second = recordCodingPreference('project', 'exportStyle', 'named', root);
      expect(first.id).toBe(second.id);
      expect((second.attributes as CodingUserPreferenceAttributes).preferenceValue).toBe('named');
    });

    it('keeps project-scoped preferences for different projects independent', () => {
      const first = recordCodingPreference('project', 'exportStyle', 'named', 'C:/fake/proj-a');
      const second = recordCodingPreference('project', 'exportStyle', 'default', 'C:/fake/proj-b');
      expect(first.id).not.toBe(second.id);
    });

    it('records a global preference with no project root and returns it for every project query', () => {
      recordCodingPreference('global', 'testFramework', 'vitest');
      const results = queryCodingPreferences('C:/fake/any-project-at-all').map((e) => (e.attributes as CodingUserPreferenceAttributes).preferenceKey);
      expect(results).toContain('testFramework');
    });

    it('does not leak one project scoped preference into a query for a different project', () => {
      recordCodingPreference('project', 'onlyForA', 'yes', 'C:/fake/scope-proj-a');
      const results = queryCodingPreferences('C:/fake/scope-proj-b').map((e) => (e.attributes as CodingUserPreferenceAttributes).preferenceKey);
      expect(results).not.toContain('onlyForA');
    });
  });
});
