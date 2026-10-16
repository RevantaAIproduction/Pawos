import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { createLocalCodingRuntimeSession } from '../../shared/actions/CodingRuntimeSessionTypes';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  Notification: vi.fn(),
}));

import {
  __resetExecutionCancellationForTests,
  cancelExecution,
  inFlightAction,
  anyActionInFlight,
  isExecutionCancelled,
  onCancelledExecutionSettled,
  registerStop,
  runInExecution,
  waitUntilIdle,
} from './ExecutionCancellation';
import { execShellCommand } from './shellExec';
import { processManager } from './ProcessManager';
import { buildProjectPlugin } from './plugins/BuildProjectPlugin';
import { entitlementService } from '../billing/EntitlementService';
import { DesktopExecutionEngine } from './DesktopExecutionEngine';
import type { DesktopPlugin } from './DesktopPlugin';

/**
 * Cancellation of one execution's real work. These tests start real processes (node scripts in a
 * temp folder, including a grandchild) and check they are actually gone — and that another
 * execution's process is left running.
 */

// Every command first refreshes the environment from the registry (several seconds on a busy machine), so
// waits for a process to start are generous; what is asserted does not depend on timing.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-cancel-'));

/** A script that starts a grandchild, records both pids, and then idles for a long time. */
function longRunningScript(name: string): { script: string; pidFile: string } {
  const pidFile = path.join(tmp, `${name}.pids.json`);
  const script = path.join(tmp, `${name}.js`);
  fs.writeFileSync(
    script,
    [
      "const { spawn } = require('child_process');",
      "const fs = require('fs');",
      "const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });",
      `fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));`,
      'setTimeout(() => {}, 60000);',
    ].join('\n')
  );
  return { script, pidFile };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}

const readPids = (pidFile: string) => JSON.parse(fs.readFileSync(pidFile, 'utf-8')) as { child: number; grandchild: number };

beforeEach(() => __resetExecutionCancellationForTests());
afterEach(() => vi.restoreAllMocks());

describe('cancelling a running shell command', () => {
  it('stops the command and everything it started, reports it, and confirms the execution is idle', async () => {
    const { script, pidFile } = longRunningScript('a');
    const running = runInExecution('exec-aaaaaaaa', 'runCommand', () => execShellCommand(`node "${script}"`, tmp, undefined, 60_000));
    expect(await waitFor(() => fs.existsSync(pidFile), 30_000)).toBe(true);
    const pids = readPids(pidFile);
    expect(inFlightAction('exec-aaaaaaaa')?.actionType).toBe('runCommand');

    const cancelled = await cancelExecution('exec-aaaaaaaa');
    expect(cancelled).toMatchObject({ hadRunningAction: true, runningActionType: 'runCommand', stopped: 1, nonCancellable: false });
    expect(await waitUntilIdle('exec-aaaaaaaa', 15_000)).toBe(true);

    const result = await running;
    expect(result.cancelled).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(await waitFor(() => !alive(pids.child) && !alive(pids.grandchild), 5_000)).toBe(true);
  }, 120_000);

  it('cancels only the requested execution — another execution’s command keeps running', async () => {
    const a = longRunningScript('iso-a');
    const b = longRunningScript('iso-b');
    const runA = runInExecution('exec-iso-aaaa', 'runCommand', () => execShellCommand(`node "${a.script}"`, tmp, undefined, 60_000));
    const runB = runInExecution('exec-iso-bbbb', 'runCommand', () => execShellCommand(`node "${b.script}"`, tmp, undefined, 60_000));
    expect(await waitFor(() => fs.existsSync(a.pidFile) && fs.existsSync(b.pidFile), 30_000)).toBe(true);
    const pidsB = readPids(b.pidFile);

    await cancelExecution('exec-iso-aaaa');
    await runA;
    expect(isExecutionCancelled('exec-iso-bbbb')).toBe(false);
    expect(alive(pidsB.child)).toBe(true);
    expect(alive(pidsB.grandchild)).toBe(true);

    await cancelExecution('exec-iso-bbbb');
    expect((await runB).cancelled).toBe(true);
  }, 120_000);

  it('a command that finishes on its own leaves nothing registered to stop', async () => {
    const quick = path.join(tmp, 'quick.js');
    fs.writeFileSync(quick, 'process.stdout.write("ok")');
    const result = await runInExecution('exec-quickkkk', 'runCommand', () => execShellCommand(`node "${quick}"`, tmp, undefined, 60_000));
    expect(result).toMatchObject({ code: 0, stdout: 'ok' });
    expect(result.cancelled).toBeUndefined();
    expect(inFlightAction('exec-quickkkk')).toBeNull();
    expect(await cancelExecution('exec-quickkkk')).toMatchObject({ hadRunningAction: false, stopped: 0 });
  }, 120_000);
});

describe('cancelling a running build', () => {
  it('stops the build process through ProcessManager', async () => {
    const { script, pidFile } = longRunningScript('build');
    const request = { type: 'buildProject', cwd: tmp, buildCommand: `node "${script}"`, timeoutMs: 60_000 } as ActionRequest;
    const running = runInExecution('exec-buildddd', 'buildProject', async () => {
      const started = await buildProjectPlugin.execute(request);
      expect(started.ok).toBe(true);
      for await (const _event of buildProjectPlugin.observe(request, started)) {
        // drain progress until the process ends
      }
      return started;
    });
    expect(await waitFor(() => fs.existsSync(pidFile), 30_000)).toBe(true);
    const pids = readPids(pidFile);

    const cancelled = await cancelExecution('exec-buildddd');
    expect(cancelled).toMatchObject({ hadRunningAction: true, runningActionType: 'buildProject', stopped: 1 });
    expect(await waitUntilIdle('exec-buildddd', 15_000)).toBe(true);
    const started = (await running) as Extract<ActionResult, { ok: true }>;
    const info = processManager.getInfo((started.data as { processId: string }).processId);
    expect(info?.status).toBe('killed');
    expect(await waitFor(() => !alive(pids.child) && !alive(pids.grandchild), 5_000)).toBe(true);
  }, 120_000);
});

describe('steps that cannot be stopped', () => {
  it('reports the step as non-cancellable and does not confirm until it really returns (bounded wait)', async () => {
    let finish!: () => void;
    const step = runInExecution('exec-nocancel', 'writeFile', () => new Promise<void>((resolve) => (finish = resolve)));
    const cancelled = await cancelExecution('exec-nocancel');
    expect(cancelled).toMatchObject({ hadRunningAction: true, runningActionType: 'writeFile', stopped: 0, nonCancellable: true });

    const started = Date.now();
    expect(await waitUntilIdle('exec-nocancel', 200)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);

    finish();
    await step;
    expect(await waitUntilIdle('exec-nocancel', 200)).toBe(true);
  });

  it('work registered after the cancel is stopped immediately', async () => {
    const stop = vi.fn();
    await cancelExecution('exec-late-reg');
    await runInExecution('exec-late-reg', 'runCommand', async () => {
      registerStop(stop);
    });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('cancelling twice is safe and signals nothing twice', async () => {
    const stop = vi.fn();
    let finish!: () => void;
    const step = runInExecution('exec-twiceeee', 'runCommand', async () => {
      registerStop(stop);
      await new Promise<void>((resolve) => (finish = resolve));
    });
    await cancelExecution('exec-twiceeee');
    await cancelExecution('exec-twiceeee');
    expect(stop).toHaveBeenCalledTimes(1);
    finish();
    await step;
  });
});

describe('the engine with a cancelled execution', () => {
  function engineWith(execute: () => Promise<ActionResult>, recover = vi.fn(async (_r: ActionRequest, result: ActionResult) => result)) {
    const plugin: DesktopPlugin = {
      id: 'fake-createDocx',
      canHandle: (request) => request.type === 'createDocx',
      requirements: () => [],
      prepare: vi.fn(async () => ({ requirements: [] })),
      execute: vi.fn(execute),
      async *observe() {
        return;
      },
      verify: vi.fn(async (_request, result) => result),
      recover,
      describeInProgress: () => 'Working.',
      describeDone: () => 'Done.',
    };
    const engine = new DesktopExecutionEngine();
    (engine as unknown as { plugins: DesktopPlugin[] }).plugins = [plugin];
    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
    vi.spyOn(entitlementService, 'isRuntimeEntitled').mockReturnValue(true);
    return { engine, plugin };
  }

  const docxRequest = (executionId: string): ActionRequest => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-cancel-engine-'));
    return {
      type: 'createDocx',
      outputPath: path.join(root, 'out.docx'),
      title: 'T',
      sections: [{ paragraphs: ['x'] }],
      codingRuntimeSession: createLocalCodingRuntimeSession({ id: `s:${root}`, rootPath: root, createdAt: 1 }),
      executionId,
    } as ActionRequest;
  };

  it('refuses a step of an execution that was cancelled before it started', async () => {
    const { engine, plugin } = engineWith(async () => ({ ok: true }));
    await cancelExecution('exec-pre-cancel');
    const result = await engine.execute(docxRequest('exec-pre-cancel'));
    expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(plugin.prepare).not.toHaveBeenCalled();
    expect(plugin.execute).not.toHaveBeenCalled();
  });

  it('a step that finished after the cancel is never reported as a success', async () => {
    const { engine } = engineWith(async () => {
      await cancelExecution('exec-finished-after');
      return { ok: true, data: { written: true } };
    });
    const result = await engine.execute(docxRequest('exec-finished-after'));
    expect(result).toMatchObject({ ok: false, reason: 'cancelled', data: { finishedAfterCancel: true, result: { written: true } } });
  });

  it('a cancelled step is never retried', async () => {
    const recover = vi.fn(async (_r: ActionRequest, result: ActionResult) => result);
    const { engine } = engineWith(async () => {
      await cancelExecution('exec-no-retry');
      return { ok: false, reason: 'failed', message: 'network flake' };
    }, recover);
    const result = await engine.execute(docxRequest('exec-no-retry'));
    expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(recover).not.toHaveBeenCalled();
  });

  it('an action without an execution id runs exactly as before', async () => {
    const { engine, plugin } = engineWith(async () => ({ ok: true }));
    const request = docxRequest('unused');
    delete (request as { executionId?: string }).executionId;
    expect((await engine.execute(request)).ok).toBe(true);
    expect(plugin.execute).toHaveBeenCalledTimes(1);
  });
});

describe('signals for the renderer and for revert', () => {
  it('M2: a cancelled execution reports when its running step has really returned — and not before', async () => {
    const settled: string[] = [];
    const off = onCancelledExecutionSettled((id) => settled.push(id));
    let finish!: () => void;
    const step = runInExecution('exec-settle-1', 'writeFile', () => new Promise<void>((resolve) => (finish = resolve)));
    await cancelExecution('exec-settle-1');
    expect(settled).toEqual([]);
    finish();
    await step;
    expect(settled).toEqual(['exec-settle-1']);
    off();
  });

  it('an execution that was not cancelled never reports settling', async () => {
    const settled: string[] = [];
    const off = onCancelledExecutionSettled((id) => settled.push(id));
    await runInExecution('exec-normal-1', 'writeFile', async () => {});
    expect(settled).toEqual([]);
    off();
  });

  it('anyActionInFlight is true exactly while some step runs', async () => {
    expect(anyActionInFlight()).toBe(false);
    let finish!: () => void;
    const step = runInExecution('exec-busy-1', 'applyCodeEdit', () => new Promise<void>((resolve) => (finish = resolve)));
    expect(anyActionInFlight()).toBe(true);
    finish();
    await step;
    expect(anyActionInFlight()).toBe(false);
  });
});
