import { beforeEach, describe, expect, it, vi } from 'vitest';

// InstallToolPlugin's own doc comment says it plainly: "Do not randomly install software on the
// machine." Every real side-effecting call this plugin makes (detectSoftware/buildCommand/
// runManagedCommand/verifyExecutable/verifyLaunch, and the version-check helper) is mocked here —
// no real winget/npm/pip/code invocation, no real process spawn, ever runs as part of this test file.
const detectSoftwareMock = vi.fn();
const buildCommandMock = vi.fn();
const runManagedCommandMock = vi.fn();
const verifyExecutableMock = vi.fn();
const verifyLaunchMock = vi.fn();
const runToolVersionCheckMock = vi.fn();

vi.mock('./softwareManager', async () => {
  const actual = await vi.importActual<typeof import('./softwareManager')>('./softwareManager');
  return {
    ...actual,
    detectSoftware: (...a: unknown[]) => detectSoftwareMock(...a),
    buildCommand: (...a: unknown[]) => buildCommandMock(...a),
    runManagedCommand: (...a: unknown[]) => runManagedCommandMock(...a),
    verifyExecutable: (...a: unknown[]) => verifyExecutableMock(...a),
    verifyLaunch: (...a: unknown[]) => verifyLaunchMock(...a),
  };
});
vi.mock('./toolVersionCheck', () => ({
  runToolVersionCheck: (...a: unknown[]) => runToolVersionCheckMock(...a),
}));

import { installToolPlugin } from './InstallToolPlugin';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';

type InstallRequest = Extract<ActionRequest, { type: 'installTool' }>;

function makeRequest(overrides: Partial<InstallRequest> = {}): ActionRequest {
  return {
    type: 'installTool',
    manager: 'npm',
    packageId: 'typescript',
    ...overrides,
  } as ActionRequest;
}

const NOT_INSTALLED = { installed: false as const };
const INSTALLED = { installed: true as const, version: '5.0.0' };

describe('InstallToolPlugin', () => {
  beforeEach(() => {
    detectSoftwareMock.mockReset();
    buildCommandMock.mockReset();
    runManagedCommandMock.mockReset();
    verifyExecutableMock.mockReset();
    verifyLaunchMock.mockReset();
    runToolVersionCheckMock.mockReset();

    detectSoftwareMock.mockResolvedValue(NOT_INSTALLED);
    buildCommandMock.mockReturnValue('npm install -g typescript');
    runManagedCommandMock.mockResolvedValue({ ok: true, output: 'installed ok' });
  });

  describe('requirements()', () => {
    it('flags an invalid package id', () => {
      const reqs = installToolPlugin.requirements(makeRequest({ packageId: 'rm -rf /' }));
      expect(reqs[0]?.id).toBe('package-id-invalid');
    });

    it('flags an unsafe launch command', () => {
      const reqs = installToolPlugin.requirements(makeRequest({ launchCommand: 'evil.exe && rm -rf /' }));
      expect(reqs[0]?.id).toBe('launch-command-invalid');
    });

    it('is empty for a valid request', () => {
      expect(installToolPlugin.requirements(makeRequest())).toEqual([]);
    });
  });

  describe('prepare()', () => {
    it('reuses the result honestly when the package is already installed — never re-runs install', async () => {
      detectSoftwareMock.mockResolvedValue(INSTALLED);
      const prep = await installToolPlugin.prepare(makeRequest());
      expect(prep.reuse?.ok).toBe(true);
      expect(runManagedCommandMock).not.toHaveBeenCalled();
    });

    it('does not short-circuit when the package is not installed', async () => {
      detectSoftwareMock.mockResolvedValue(NOT_INSTALLED);
      const prep = await installToolPlugin.prepare(makeRequest());
      expect(prep.reuse).toBeUndefined();
    });
  });

  describe('execute()', () => {
    it('rejects an invalid package id without ever calling the install command', async () => {
      const result = await installToolPlugin.execute(makeRequest({ packageId: 'foo; rm -rf /' }));
      expect(result.ok).toBe(false);
      expect(runManagedCommandMock).not.toHaveBeenCalled();
    });

    it('runs the real install command for a valid request and reports honest state', async () => {
      const result = await installToolPlugin.execute(makeRequest());
      expect(result.ok).toBe(true);
      expect(buildCommandMock).toHaveBeenCalledWith('npm', 'install', 'typescript');
      expect(runManagedCommandMock).toHaveBeenCalledTimes(1);
      if (result.ok) {
        const data = result.data as { commandsRun: string[] };
        expect(data.commandsRun).toEqual(['npm install -g typescript']);
      }
    });

    it('falls back to a name-based winget install when the exact-id install fails', async () => {
      buildCommandMock.mockImplementation((_manager, _op, _id, opts) =>
        opts?.asName ? 'winget install python --silent --accept-package-agreements --accept-source-agreements' : 'winget install --id python.python --exact --silent --accept-package-agreements --accept-source-agreements'
      );
      runManagedCommandMock
        .mockResolvedValueOnce({ ok: false, message: 'no exact match' })
        .mockResolvedValueOnce({ ok: true, output: 'installed via name fallback' });

      const result = await installToolPlugin.execute(makeRequest({ manager: 'winget', packageId: 'python.python' }));
      expect(result.ok).toBe(true);
      expect(runManagedCommandMock).toHaveBeenCalledTimes(2);
      if (result.ok) {
        const data = result.data as { commandsRun: string[] };
        expect(data.commandsRun).toHaveLength(2);
      }
    });

    it('never falls back to a name-based install for non-winget managers', async () => {
      runManagedCommandMock.mockResolvedValue({ ok: false, message: 'not found' });
      const result = await installToolPlugin.execute(makeRequest({ manager: 'npm' }));
      expect(result.ok).toBe(false);
      expect(runManagedCommandMock).toHaveBeenCalledTimes(1);
    });

    it('reports a real failure honestly when the install command itself fails', async () => {
      runManagedCommandMock.mockResolvedValue({ ok: false, message: 'network error' });
      const result = await installToolPlugin.execute(makeRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('network error');
    });
  });

  describe('verify()', () => {
    const okResult: ActionResult = {
      ok: true,
      data: { manager: 'npm', packageId: 'typescript', detectedBefore: NOT_INSTALLED, commandsRun: ['npm install -g typescript'], recoveryAttempted: false },
    };

    it('passes an already-failed result straight through without checking anything', async () => {
      const failed: ActionResult = { ok: false, reason: 'failed', message: 'boom' };
      const result = await installToolPlugin.verify(makeRequest(), failed);
      expect(result).toBe(failed);
      expect(detectSoftwareMock).not.toHaveBeenCalled();
      expect(runToolVersionCheckMock).not.toHaveBeenCalled();
    });

    it('falls back to manager-level detection when no executableHint/verifyCommand/launchCommand was given', async () => {
      detectSoftwareMock.mockResolvedValue(INSTALLED);
      const result = await installToolPlugin.verify(makeRequest(), okResult);
      expect(result.ok).toBe(true);
      expect(detectSoftwareMock).toHaveBeenCalledWith('npm', 'typescript');
    });

    it('reports honest failure when manager-level detection still finds nothing installed', async () => {
      detectSoftwareMock.mockResolvedValue(NOT_INSTALLED);
      const result = await installToolPlugin.verify(makeRequest(), okResult);
      expect(result.ok).toBe(false);
    });

    it('uses a real executableHint check instead of manager detection when one was given', async () => {
      verifyExecutableMock.mockResolvedValue({ ok: true, output: 'v5.0.0' });
      const result = await installToolPlugin.verify(makeRequest({ executableHint: 'tsc' }), okResult);
      expect(result.ok).toBe(true);
      expect(verifyExecutableMock).toHaveBeenCalledWith('tsc');
      expect(detectSoftwareMock).not.toHaveBeenCalled();
    });

    it('reports honest failure when the executableHint is not actually found on PATH', async () => {
      verifyExecutableMock.mockResolvedValue({ ok: false, message: 'not found on PATH' });
      const result = await installToolPlugin.verify(makeRequest({ executableHint: 'tsc' }), okResult);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('not found on PATH');
    });

    it('uses verifyCommand when given, never falling back to manager detection', async () => {
      runToolVersionCheckMock.mockResolvedValue({ ok: true, output: 'Version 5.0.0' });
      const result = await installToolPlugin.verify(makeRequest({ verifyCommand: 'tsc --version' }), okResult);
      expect(result.ok).toBe(true);
      expect(runToolVersionCheckMock).toHaveBeenCalledWith('tsc --version');
      expect(detectSoftwareMock).not.toHaveBeenCalled();
    });

    it('confirms a real launched process for launchCommand+expectedProcessName, never trusting a bare exit code', async () => {
      verifyLaunchMock.mockResolvedValue(true);
      const result = await installToolPlugin.verify(
        makeRequest({ launchCommand: 'C:\\Program Files\\App\\app.exe', expectedProcessName: 'app.exe' }),
        okResult
      );
      expect(result.ok).toBe(true);
      expect(verifyLaunchMock).toHaveBeenCalledWith('C:\\Program Files\\App\\app.exe', 'app.exe');
    });

    it('reports honest failure when a launched app never actually shows up as a real OS process', async () => {
      verifyLaunchMock.mockResolvedValue(false);
      const result = await installToolPlugin.verify(
        makeRequest({ launchCommand: 'C:\\Program Files\\App\\app.exe', expectedProcessName: 'app.exe' }),
        okResult
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('recover()', () => {
    it('passes an already-successful result straight through', async () => {
      const ok: ActionResult = { ok: true, data: {} };
      const result = await installToolPlugin.recover(makeRequest(), ok);
      expect(result).toBe(ok);
      expect(runManagedCommandMock).not.toHaveBeenCalled();
    });

    it('runs a real force-reinstall repair pass and marks recoveryAttempted honestly', async () => {
      buildCommandMock.mockReturnValue('npm install -g typescript --force');
      runManagedCommandMock.mockResolvedValue({ ok: true, output: 'repaired' });
      const failed: ActionResult = {
        ok: false,
        reason: 'failed',
        message: 'verification failed',
        data: { manager: 'npm', packageId: 'typescript', detectedBefore: NOT_INSTALLED, commandsRun: ['npm install -g typescript'], recoveryAttempted: false },
      };
      const result = await installToolPlugin.recover(makeRequest(), failed);
      expect(result.ok).toBe(true);
      // force:true must select the 'repair' verb, not 'install' — the real distinguishing signal
      // that this was a repair pass, not a plain reinstall.
      expect(buildCommandMock).toHaveBeenCalledWith('npm', 'repair', 'typescript');
      if (result.ok) {
        const data = result.data as { recoveryAttempted: boolean; commandsRun: string[] };
        expect(data.recoveryAttempted).toBe(true);
        expect(data.commandsRun).toContain('npm install -g typescript --force');
      }
    });

    it('reports honest failure when the repair attempt itself fails, never fabricating success', async () => {
      buildCommandMock.mockReturnValue('npm install -g typescript --force');
      runManagedCommandMock.mockResolvedValue({ ok: false, message: 'repair failed too' });
      const failed: ActionResult = {
        ok: false,
        reason: 'failed',
        message: 'verification failed',
        data: { manager: 'npm', packageId: 'typescript', detectedBefore: NOT_INSTALLED, commandsRun: [], recoveryAttempted: false },
      };
      const result = await installToolPlugin.recover(makeRequest(), failed);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('repair failed too');
    });

    it('is a safe no-op when a failure carries no state at all', async () => {
      const failed: ActionResult = { ok: false, reason: 'failed', message: 'no state here' };
      const result = await installToolPlugin.recover(makeRequest(), failed);
      expect(result).toBe(failed);
      expect(runManagedCommandMock).not.toHaveBeenCalled();
    });
  });

  describe('describeInProgress() / describeDone()', () => {
    it('never says a generic "action executed" — names the real package', () => {
      expect(installToolPlugin.describeInProgress(makeRequest())).toContain('typescript');
    });

    it('honestly narrates a repair pass when one happened', () => {
      const result: ActionResult = {
        ok: true,
        data: { operation: 'install', manager: 'npm', packageId: 'typescript', detectedBefore: NOT_INSTALLED, commandsRun: [], verification: {}, recoveryAttempted: true },
      };
      const text = installToolPlugin.describeDone(makeRequest(), result);
      expect(text.toLowerCase()).toContain('repair');
    });

    it('narrates plain success without mentioning a repair that never happened', () => {
      const result: ActionResult = {
        ok: true,
        data: { operation: 'install', manager: 'npm', packageId: 'typescript', detectedBefore: NOT_INSTALLED, commandsRun: [], verification: {}, recoveryAttempted: false },
      };
      const text = installToolPlugin.describeDone(makeRequest(), result);
      expect(text.toLowerCase()).not.toContain('repair');
    });
  });
});
