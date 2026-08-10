import { describe, expect, it } from 'vitest';
import { diagnoseFailure } from './ValidationFailureDiagnosis';
import { buildValidationReport } from './ValidationReportBuilder';
import type { ValidationStepResult } from './ValidationReportTypes';

function passed(): ValidationStepResult {
  return { status: 'passed' };
}
function failed(errorDetail: string, affectedFiles?: string[]): ValidationStepResult {
  return { status: 'failed', errorDetail, affectedFiles };
}

describe('diagnoseFailure', () => {
  it('returns null when nothing failed', () => {
    const report = buildValidationReport('/fake', {
      syntax: passed(),
      imports: passed(),
      typeCheck: passed(),
      lint: passed(),
      build: passed(),
      tests: passed(),
    });
    expect(diagnoseFailure(report)).toBeNull();
  });

  it('picks the earliest failing step even when a later step also failed', () => {
    const report = buildValidationReport('/fake', {
      syntax: passed(),
      imports: failed('broken import', ['a.ts']),
      typeCheck: passed(),
      lint: passed(),
      build: failed('build broke'),
      tests: passed(),
    });
    const diagnosis = diagnoseFailure(report);
    expect(diagnosis?.targetStep).toBe('imports');
    expect(diagnosis?.errorDetail).toBe('broken import');
    expect(diagnosis?.affectedFiles).toEqual(['a.ts']);
  });

  it('falls back to a generic note when a failed step has no captured error detail', () => {
    const report = buildValidationReport('/fake', {
      syntax: { status: 'failed' },
      imports: passed(),
      typeCheck: passed(),
      lint: passed(),
      build: passed(),
      tests: passed(),
    });
    const diagnosis = diagnoseFailure(report);
    expect(diagnosis?.targetStep).toBe('syntax');
    expect(diagnosis?.errorDetail).toBe('No further detail was captured for this failure.');
  });
});
