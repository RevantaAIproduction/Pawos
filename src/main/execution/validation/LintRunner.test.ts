import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execShellCommandMock = vi.fn();
vi.mock('../shellExec', () => ({ execShellCommand: (...args: unknown[]) => execShellCommandMock(...args) }));

import { runLint } from './LintRunner';

function writePackageJson(root: string, scripts: Record<string, string> = {}): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }), 'utf-8');
}

describe('runLint', () => {
  beforeEach(() => {
    execShellCommandMock.mockReset();
  });

  it('skips honestly when there is no lint script and no ESLint config file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-lint-runner-test-'));
    writePackageJson(root, {});
    const result = await runLint(root);
    expect(result.status).toBe('skipped');
    expect(execShellCommandMock).not.toHaveBeenCalled();
  });

  it('prefers the project-declared npm script over any inferred fallback', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-lint-runner-test-'));
    writePackageJson(root, { lint: 'eslint .' });
    fs.writeFileSync(path.join(root, '.eslintrc.json'), '{}', 'utf-8');
    execShellCommandMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    const result = await runLint(root);
    expect(result.status).toBe('passed');
    expect(result.source).toBe('packageScript');
    expect(execShellCommandMock).toHaveBeenCalledWith('npm run lint', root, undefined, expect.any(Number));
  });

  it('falls back to a real ESLint config-based command only when a config file actually exists', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-lint-runner-test-'));
    writePackageJson(root, {});
    fs.writeFileSync(path.join(root, '.eslintrc.json'), '{}', 'utf-8');
    execShellCommandMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    const result = await runLint(root);
    expect(result.status).toBe('passed');
    expect(result.source).toBe('inferred');
    expect(execShellCommandMock).toHaveBeenCalledWith('npx eslint .', root, undefined, expect.any(Number));
  });

  it('reports a real failure with the command tail as errorDetail', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-lint-runner-test-'));
    writePackageJson(root, { lint: 'eslint .' });
    execShellCommandMock.mockResolvedValue({ code: 1, stdout: 'some/file.ts: error\n', stderr: '', timedOut: false });

    const result = await runLint(root);
    expect(result.status).toBe('failed');
    expect(result.errorDetail).toContain('some/file.ts: error');
  });

  it('reports a timeout honestly rather than as a generic failure', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-lint-runner-test-'));
    writePackageJson(root, { lint: 'eslint .' });
    execShellCommandMock.mockResolvedValue({ code: null, stdout: '', stderr: '', timedOut: true });

    const result = await runLint(root);
    expect(result.status).toBe('failed');
    expect(result.errorDetail).toContain('timed out');
  });
});
