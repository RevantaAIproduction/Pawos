import { describe, expect, it } from 'vitest';
import { buildValidationReport, type ValidationStepResults } from './ValidationReportBuilder';
import type { ValidationStepResult } from './ValidationReportTypes';

function passed(overrides: Partial<ValidationStepResult> = {}): ValidationStepResult {
  return { status: 'passed', ...overrides };
}
function skipped(reason = 'not applicable'): ValidationStepResult {
  return { status: 'skipped', skippedReason: reason };
}
function failed(errorDetail: string, overrides: Partial<ValidationStepResult> = {}): ValidationStepResult {
  return { status: 'failed', errorDetail, ...overrides };
}

function allPassed(overrides: Partial<ValidationStepResults> = {}): ValidationStepResults {
  return {
    syntax: passed(),
    imports: passed(),
    typeCheck: passed({ source: 'packageScript' }),
    lint: passed({ source: 'packageScript' }),
    build: passed({ source: 'packageScript' }),
    tests: passed({ source: 'packageScript' }),
    ...overrides,
  };
}

describe('buildValidationReport', () => {
  it('reports high confidence and no issues when every step passes via real declared scripts', () => {
    const report = buildValidationReport('/fake/project', allPassed());
    expect(report.confidence).toBe('high');
    expect(report.blockingIssues).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
    expect(report.suggestedRecovery).toBeUndefined();
  });

  it('drops confidence to medium when any step used an inferred (not project-declared) command', () => {
    const report = buildValidationReport('/fake/project', allPassed({ lint: passed({ source: 'inferred' }) }));
    expect(report.confidence).toBe('medium');
  });

  it('drops confidence to low when more steps were skipped than actually ran', () => {
    const report = buildValidationReport(
      '/fake/project',
      allPassed({ typeCheck: skipped(), lint: skipped(), build: skipped(), tests: skipped() })
    );
    expect(report.confidence).toBe('low');
  });

  it('records one blocking issue per failed step and one warning per skipped step', () => {
    const report = buildValidationReport(
      '/fake/project',
      allPassed({ lint: skipped('no lint script'), build: failed('build broke') })
    );
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('Lint skipped');
    expect(report.blockingIssues).toHaveLength(1);
    expect(report.blockingIssues[0]).toContain('Build failed');
  });

  it('suggests recovery pointed at the earliest failing step in pipeline order, not a later one', () => {
    const report = buildValidationReport(
      '/fake/project',
      allPassed({ typeCheck: failed('type error'), build: failed('build error') })
    );
    expect(report.suggestedRecovery?.targetStep).toBe('typeCheck');
    expect(report.suggestedRecovery?.errorDetail).toBe('type error');
  });

  it('never fabricates a suggestedRecovery when nothing failed', () => {
    const report = buildValidationReport('/fake/project', allPassed());
    expect(report.suggestedRecovery).toBeUndefined();
  });

  it('carries a real generated id and the project root through unchanged', () => {
    const report = buildValidationReport('/fake/project', allPassed());
    expect(report.projectRoot).toBe('/fake/project');
    expect(typeof report.id).toBe('string');
    expect(report.id.length).toBeGreaterThan(0);
  });
});
