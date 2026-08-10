import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-analyze-repo-plugin-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { findLatestIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import { analyzeRepositoryPlugin } from './AnalyzeRepositoryPlugin';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';

describe('AnalyzeRepositoryPlugin — full evidence -> correlate -> report -> persist pipeline', () => {
  beforeAll(() => memoryGraphStore.init());

  it('produces a real report and persists it to the Memory Graph for a real local folder', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-analyze-repo-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'my-app', scripts: { test: 'vitest' } }));

    const result = await analyzeRepositoryPlugin.execute({ type: 'analyzeRepository', repoPath: dir });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as IntelligenceReport<RepositoryReportFields>;
    expect(report.engineId).toBe('repository');
    expect(report.subject).toBe(dir);
    expect(report.domain.workspaceName).toBe('my-app');
    expect(report.domain.hasTests).toBe(true);
    expect(report.approvalRequired).toBe(false);
    expect(typeof report.overallScore).toBe('number');

    const persisted = findLatestIntelligenceReport('repository', dir);
    expect(persisted).toBeDefined();
    expect((persisted?.attributes as { report: IntelligenceReport }).report.subject).toBe(dir);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports a clear, honest failure when the path does not exist', async () => {
    const result = await analyzeRepositoryPlugin.execute({ type: 'analyzeRepository', repoPath: path.join(os.tmpdir(), 'pawos-definitely-not-real-xyz') });
    expect(result.ok).toBe(false);
  });

  it('surfaces a missing-path requirement instead of executing blind', () => {
    const missing = path.join(os.tmpdir(), 'pawos-definitely-not-real-xyz');
    const requirements = analyzeRepositoryPlugin.requirements({ type: 'analyzeRepository', repoPath: missing });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.message).toMatch(/can't find/i);
  });
});
