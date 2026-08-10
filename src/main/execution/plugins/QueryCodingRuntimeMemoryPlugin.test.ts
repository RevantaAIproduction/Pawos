import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-query-coding-runtime-memory-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { recordCodingEditHistory, recordArchitecturalDecision, recordCodingPreference } from '../../memory/entities/codingRuntimeMemoryEntities';
import { recordValidationReport } from '../../memory/entities/codingValidationReportEntities';
import { queryCodingRuntimeMemoryPlugin, type CodingRuntimeMemorySummary } from './QueryCodingRuntimeMemoryPlugin';
import type { ValidationReport } from '../validation/ValidationReportTypes';

describe('QueryCodingRuntimeMemoryPlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('flags a missing project root', () => {
    const reqs = queryCodingRuntimeMemoryPlugin.requirements({ type: 'queryCodingRuntimeMemory', rootPath: 'C:/definitely/not/real/xyz' });
    expect(reqs).toHaveLength(1);
  });

  it('returns an honestly empty summary for a project with no recorded memory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-query-memory-empty-'));
    const result = await queryCodingRuntimeMemoryPlugin.execute({ type: 'queryCodingRuntimeMemory', rootPath: root });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as CodingRuntimeMemorySummary;
    expect(data.editHistory).toHaveLength(0);
    expect(data.architecturalDecisions).toHaveLength(0);
    expect(data.latestValidation).toBeNull();
  });

  it('composes real edit history, decisions, preferences, and the latest validation report for a project', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-query-memory-full-'));
    recordCodingEditHistory(root, 'Renamed a function', ['a.ts']);
    recordArchitecturalDecision(root, 'Use Zustand', 'Less boilerplate');
    recordCodingPreference('project', 'exportStyle', 'named', root);
    recordCodingPreference('global', 'testFramework', 'vitest');

    const passed = { status: 'passed' as const };
    const report: ValidationReport = {
      id: 'r1',
      projectRoot: root,
      runAt: Date.now(),
      syntax: passed,
      imports: passed,
      typeCheck: passed,
      lint: passed,
      build: passed,
      tests: passed,
      blockingIssues: [],
      warnings: [],
      confidence: 'high',
    };
    recordValidationReport(report);

    const result = await queryCodingRuntimeMemoryPlugin.execute({ type: 'queryCodingRuntimeMemory', rootPath: root });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as CodingRuntimeMemorySummary;
    expect(data.editHistory).toHaveLength(1);
    expect(data.architecturalDecisions).toHaveLength(1);
    expect(data.preferences.map((p) => p.preferenceKey)).toEqual(expect.arrayContaining(['exportStyle', 'testFramework']));
    expect(data.latestValidation?.confidence).toBe('high');
  });
});
