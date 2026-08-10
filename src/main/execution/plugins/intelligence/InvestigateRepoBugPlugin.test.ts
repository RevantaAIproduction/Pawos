import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-investigate-repo-bug-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { investigateRepoBugPlugin } from './InvestigateRepoBugPlugin';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';

describe('InvestigateRepoBugPlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('reuses the repository evidence/correlate/report pipeline, framed around the described symptom', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-investigate-repo-bug-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'buggy-app' }));

    const result = await investigateRepoBugPlugin.execute({
      type: 'investigateRepoBug',
      repoPath: dir,
      symptom: 'Users report the login page hangs forever',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as IntelligenceReport<RepositoryReportFields>;
    expect(report.subject).toContain('Users report the login page hangs forever');
    expect(report.domain.workspaceName).toBe('buggy-app');
    // The honest, always-fires gap explaining static facts alone can't confirm a root cause.
    expect(report.findings.some((f) => f.statement.includes('Matching the described symptom'))).toBe(true);
    expect(report.findings.some((f) => f.provenance === 'requiresInternalDocumentation')).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('still applies the shared repository rubric alongside the symptom-specific gap', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-investigate-repo-bug-notests-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'no-tests-app' }));

    const result = await investigateRepoBugPlugin.execute({
      type: 'investigateRepoBug',
      repoPath: dir,
      symptom: 'Something is broken',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as IntelligenceReport<RepositoryReportFields>;
    expect(report.findings.some((f) => f.statement.includes('No test script'))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports a clear failure when the repo path does not exist', async () => {
    const result = await investigateRepoBugPlugin.execute({
      type: 'investigateRepoBug',
      repoPath: path.join(os.tmpdir(), 'pawos-definitely-not-real-xyz'),
      symptom: 'anything',
    });
    expect(result.ok).toBe(false);
  });
});
