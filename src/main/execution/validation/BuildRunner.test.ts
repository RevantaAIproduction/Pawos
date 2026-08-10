import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execShellCommandMock = vi.fn();
vi.mock('../shellExec', () => ({ execShellCommand: (...args: unknown[]) => execShellCommandMock(...args) }));

import { runBuildCheck } from './BuildRunner';

function writePackageJson(root: string, scripts: Record<string, string> = {}): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }), 'utf-8');
}

describe('runBuildCheck', () => {
  beforeEach(() => {
    execShellCommandMock.mockReset();
  });

  it('skips honestly when there is no build script — never guesses one', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-build-runner-test-'));
    writePackageJson(root, {});
    const result = await runBuildCheck(root);
    expect(result.status).toBe('skipped');
    expect(execShellCommandMock).not.toHaveBeenCalled();
  });

  it('passes only when the command exits 0 AND a real output directory actually appears', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-build-runner-test-'));
    writePackageJson(root, { build: 'next build' });
    fs.mkdirSync(path.join(root, 'dist'));
    execShellCommandMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    const result = await runBuildCheck(root);
    expect(result.status).toBe('passed');
    expect(execShellCommandMock).toHaveBeenCalledWith('npm run build', root, undefined, expect.any(Number));
  });

  it('fails when the command exits 0 but no real output directory appears (never trusts exit code alone)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-build-runner-test-'));
    writePackageJson(root, { build: 'next build' });
    execShellCommandMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    const result = await runBuildCheck(root);
    expect(result.status).toBe('failed');
    expect(result.errorDetail).toContain('no build output folder');
  });

  it('fails honestly on a real non-zero exit code', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-build-runner-test-'));
    writePackageJson(root, { build: 'next build' });
    execShellCommandMock.mockResolvedValue({ code: 1, stdout: '', stderr: 'Module not found\n', timedOut: false });

    const result = await runBuildCheck(root);
    expect(result.status).toBe('failed');
    expect(result.errorDetail).toContain('Module not found');
  });
});
