import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execShellCommandMock = vi.fn();
vi.mock('../shellExec', () => ({ execShellCommand: (...args: unknown[]) => execShellCommandMock(...args) }));

import { runTypecheck } from './TypecheckRunner';

function writePackageJson(root: string, scripts: Record<string, string> = {}): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }), 'utf-8');
}

describe('runTypecheck', () => {
  beforeEach(() => {
    execShellCommandMock.mockReset();
  });

  it('skips honestly when there is no typecheck script and no tsconfig.json', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-typecheck-runner-test-'));
    writePackageJson(root, {});
    const result = await runTypecheck(root);
    expect(result.status).toBe('skipped');
    expect(execShellCommandMock).not.toHaveBeenCalled();
  });

  it('prefers the project-declared npm script over the inferred tsc fallback', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-typecheck-runner-test-'));
    writePackageJson(root, { typecheck: 'tsc --noEmit -p tsconfig.json' });
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}', 'utf-8');
    execShellCommandMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    const result = await runTypecheck(root);
    expect(result.status).toBe('passed');
    expect(result.source).toBe('packageScript');
    expect(execShellCommandMock).toHaveBeenCalledWith('npm run typecheck', root, undefined, expect.any(Number));
  });

  it('falls back to npx tsc --noEmit only when a real tsconfig.json exists', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-typecheck-runner-test-'));
    writePackageJson(root, {});
    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}', 'utf-8');
    execShellCommandMock.mockResolvedValue({ code: 0, stdout: '', stderr: '', timedOut: false });

    const result = await runTypecheck(root);
    expect(result.status).toBe('passed');
    expect(result.source).toBe('inferred');
    expect(execShellCommandMock).toHaveBeenCalledWith('npx tsc --noEmit', root, undefined, expect.any(Number));
  });

  it('reports a real type error failure with the tail as errorDetail', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-typecheck-runner-test-'));
    writePackageJson(root, { typecheck: 'tsc --noEmit' });
    execShellCommandMock.mockResolvedValue({ code: 1, stdout: "src/a.ts(1,1): error TS2322: Type 'string' is not assignable.\n", stderr: '', timedOut: false });

    const result = await runTypecheck(root);
    expect(result.status).toBe('failed');
    expect(result.errorDetail).toContain('TS2322');
  });
});
