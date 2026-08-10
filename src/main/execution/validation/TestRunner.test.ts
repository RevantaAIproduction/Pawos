import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execShellCommandMock = vi.fn();
vi.mock('../shellExec', () => ({ execShellCommand: (...args: unknown[]) => execShellCommandMock(...args) }));

import { runTestsCheck } from './TestRunner';

function writePackageJson(root: string, scripts: Record<string, string> = {}): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }), 'utf-8');
}

describe('runTestsCheck', () => {
  beforeEach(() => {
    execShellCommandMock.mockReset();
  });

  it('skips honestly when there is no test script — never guesses one', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-test-runner-test-'));
    writePackageJson(root, {});
    const result = await runTestsCheck(root);
    expect(result.status).toBe('skipped');
    expect(execShellCommandMock).not.toHaveBeenCalled();
  });

  it('reports real pass/fail counts parsed from real test-runner output', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-test-runner-test-'));
    writePackageJson(root, { test: 'vitest run' });
    execShellCommandMock.mockResolvedValue({ code: 0, stdout: 'Tests:       8 passed, 8 total\n', stderr: '', timedOut: false });

    const result = await runTestsCheck(root);
    expect(result.status).toBe('passed');
    expect(result.passed).toBe(8);
    expect(result.total).toBe(8);
    expect(execShellCommandMock).toHaveBeenCalledWith('npm test', root, undefined, expect.any(Number));
  });

  it('reports failed status with real counts when the runner reports failures', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-test-runner-test-'));
    writePackageJson(root, { test: 'vitest run' });
    execShellCommandMock.mockResolvedValue({ code: 1, stdout: 'Tests:       2 failed, 6 passed, 8 total\n', stderr: '', timedOut: false });

    const result = await runTestsCheck(root);
    expect(result.status).toBe('failed');
    expect(result.failed).toBe(2);
    expect(result.passed).toBe(6);
  });

  it('reports a timeout honestly', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-test-runner-test-'));
    writePackageJson(root, { test: 'vitest run' });
    execShellCommandMock.mockResolvedValue({ code: null, stdout: '', stderr: '', timedOut: true });

    const result = await runTestsCheck(root);
    expect(result.status).toBe('failed');
    expect(result.errorDetail).toContain('timed out');
  });
});
