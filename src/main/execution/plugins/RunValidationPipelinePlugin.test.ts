import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-run-validation-pipeline-test-'));
  return { app: { getPath: () => tmp } };
});

const checkSyntaxMock = vi.fn();
const checkImportsMock = vi.fn();
const runTypecheckMock = vi.fn();
const runLintMock = vi.fn();
const runBuildCheckMock = vi.fn();
const runTestsCheckMock = vi.fn();
const getIndexMock = vi.fn();
const buildIndexExecuteMock = vi.fn();

vi.mock('../validation/SyntaxCheck', () => ({ checkSyntax: (...a: unknown[]) => checkSyntaxMock(...a) }));
vi.mock('../validation/ImportsCheck', () => ({ checkImports: (...a: unknown[]) => checkImportsMock(...a) }));
vi.mock('../validation/TypecheckRunner', () => ({ runTypecheck: (...a: unknown[]) => runTypecheckMock(...a) }));
vi.mock('../validation/LintRunner', () => ({ runLint: (...a: unknown[]) => runLintMock(...a) }));
vi.mock('../validation/BuildRunner', () => ({ runBuildCheck: (...a: unknown[]) => runBuildCheckMock(...a) }));
vi.mock('../validation/TestRunner', () => ({ runTestsCheck: (...a: unknown[]) => runTestsCheckMock(...a) }));
vi.mock('../semanticIndex/RepositorySemanticIndexService', () => ({
  repositorySemanticIndexService: { getIndex: (...a: unknown[]) => getIndexMock(...a) },
}));
vi.mock('./BuildRepositorySemanticIndexPlugin', () => ({
  buildRepositorySemanticIndexPlugin: { execute: (...a: unknown[]) => buildIndexExecuteMock(...a) },
}));

import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { findLatestValidationReport } from '../../memory/entities/codingValidationReportEntities';
import { runValidationPipelinePlugin } from './RunValidationPipelinePlugin';
import type { ValidationReport } from '../validation/ValidationReportTypes';

const PASS = { status: 'passed' as const };

function resetAllPassing(): void {
  checkSyntaxMock.mockReturnValue(PASS);
  checkImportsMock.mockReturnValue(PASS);
  runTypecheckMock.mockResolvedValue({ ...PASS, source: 'packageScript' });
  runLintMock.mockResolvedValue({ ...PASS, source: 'packageScript' });
  runBuildCheckMock.mockResolvedValue({ ...PASS, source: 'packageScript' });
  runTestsCheckMock.mockResolvedValue({ ...PASS, source: 'packageScript' });
}

describe('RunValidationPipelinePlugin', () => {
  let root: string;

  beforeAll(() => {
    memoryGraphStore.init();
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-validation-pipeline-target-'));
    checkSyntaxMock.mockReset();
    checkImportsMock.mockReset();
    runTypecheckMock.mockReset();
    runLintMock.mockReset();
    runBuildCheckMock.mockReset();
    runTestsCheckMock.mockReset();
    getIndexMock.mockReset();
    buildIndexExecuteMock.mockReset();
    resetAllPassing();
  });

  it('flags a missing project root', () => {
    const reqs = runValidationPipelinePlugin.requirements({ type: 'runValidationPipeline', rootPath: path.join(root, 'nope') });
    expect(reqs).toHaveLength(1);
  });

  it('scopes syntax/imports checks directly to affectedFiles without touching the semantic index', async () => {
    const result = await runValidationPipelinePlugin.execute({
      type: 'runValidationPipeline',
      rootPath: root,
      affectedFiles: ['src/a.ts', 'src/b.ts'],
    });
    expect(result.ok).toBe(true);
    expect(getIndexMock).not.toHaveBeenCalled();
    expect(checkSyntaxMock).toHaveBeenCalledWith([path.join(root, 'src/a.ts'), path.join(root, 'src/b.ts')]);
  });

  it('falls back to the repository semantic index when affectedFiles is omitted, reusing it if fresh', async () => {
    getIndexMock.mockReturnValue({ stale: false, files: { 'a.ts': {}, 'b.ts': {} } });
    const result = await runValidationPipelinePlugin.execute({ type: 'runValidationPipeline', rootPath: root });
    expect(result.ok).toBe(true);
    expect(buildIndexExecuteMock).not.toHaveBeenCalled();
    expect(checkSyntaxMock).toHaveBeenCalledWith([path.join(root, 'a.ts'), path.join(root, 'b.ts')]);
  });

  it('self-sufficiently builds the semantic index when missing, rather than requiring a prior tool call', async () => {
    getIndexMock.mockReturnValueOnce(undefined).mockReturnValueOnce({ stale: false, files: { 'a.ts': {} } });
    buildIndexExecuteMock.mockResolvedValue({ ok: true });
    const result = await runValidationPipelinePlugin.execute({ type: 'runValidationPipeline', rootPath: root });
    expect(result.ok).toBe(true);
    expect(buildIndexExecuteMock).toHaveBeenCalled();
    expect(getIndexMock).toHaveBeenCalledTimes(2);
  });

  it('persists a real ValidationReport to the Memory Graph on every run', async () => {
    await runValidationPipelinePlugin.execute({ type: 'runValidationPipeline', rootPath: root, affectedFiles: ['a.ts'] });
    const entity = findLatestValidationReport(root);
    expect(entity).toBeDefined();
    expect(entity?.type).toBe('codingValidationReport');
  });

  it('returns ok:false with the real blocking issue in the message when a step fails', async () => {
    runBuildCheckMock.mockResolvedValue({ status: 'failed', errorDetail: 'webpack exploded' });
    const result = await runValidationPipelinePlugin.execute({ type: 'runValidationPipeline', rootPath: root, affectedFiles: ['a.ts'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('webpack exploded');
  });

  describe('recover', () => {
    it('leaves a successful result unchanged', async () => {
      const request = { type: 'runValidationPipeline' as const, rootPath: root, affectedFiles: ['a.ts'] };
      const result = await runValidationPipelinePlugin.execute(request);
      const recovered = await runValidationPipelinePlugin.recover(request, result);
      expect(recovered).toBe(result);
    });

    it('enriches a real failure with the suggested-recovery diagnosis, never claiming to have fixed it', async () => {
      runTypecheckMock.mockResolvedValue({ status: 'failed', source: 'packageScript', errorDetail: 'TS2322' });
      const request = { type: 'runValidationPipeline' as const, rootPath: root, affectedFiles: ['a.ts'] };
      const result = await runValidationPipelinePlugin.execute(request);
      expect(result.ok).toBe(false);

      const recovered = await runValidationPipelinePlugin.recover(request, result);
      expect(recovered.ok).toBe(false);
      if (recovered.ok) return;
      expect(recovered.message).toContain('TS2322');
      const data = recovered.data as ValidationReport;
      expect(data.suggestedRecovery?.targetStep).toBe('typeCheck');
    });
  });
});
