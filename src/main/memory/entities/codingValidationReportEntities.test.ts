import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-coding-validation-report-entities-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../MemoryGraphStore';
import { recordValidationReport, findLatestValidationReport, type CodingValidationReportAttributes } from './codingValidationReportEntities';
import type { ValidationReport } from '../../execution/validation/ValidationReportTypes';

function makeReport(projectRoot: string, overrides: Partial<ValidationReport> = {}): ValidationReport {
  const passed = { status: 'passed' as const };
  return {
    id: 'r1',
    projectRoot,
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
    ...overrides,
  };
}

describe('codingValidationReportEntities', () => {
  beforeAll(() => memoryGraphStore.init());

  it('records a real new Memory Graph entity for every run, never upserting in place', () => {
    const root = 'C:/fake/validation-project';
    const first = recordValidationReport(makeReport(root, { id: 'first' }));
    const second = recordValidationReport(makeReport(root, { id: 'second' }));
    expect(first.id).not.toBe(second.id);
  });

  it('finds the most recently recorded report for a project root', () => {
    const root = 'C:/fake/validation-project-2';
    recordValidationReport(makeReport(root, { id: 'old', confidence: 'low' }));
    recordValidationReport(makeReport(root, { id: 'new', confidence: 'high' }));

    const latest = findLatestValidationReport(root);
    expect(latest).toBeDefined();
    const attrs = latest?.attributes as CodingValidationReportAttributes;
    expect(attrs.report.id).toBe('new');
  });

  it('matches project root case- and whitespace-insensitively, like the codingFeature/codeFile convention', () => {
    recordValidationReport(makeReport('C:/Fake/Case-Test '));
    const found = findLatestValidationReport('c:/fake/case-test');
    expect(found).toBeDefined();
  });

  it('returns undefined honestly for a project that has never been validated', () => {
    expect(findLatestValidationReport('C:/fake/never-validated')).toBeUndefined();
  });
});
