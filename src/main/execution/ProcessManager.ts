import { spawn, execFile, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { ManagedProcessInfo, ProcessOutputEvent, ProcessExitEvent } from '../../shared/actions/ProcessTypes';
import type { CommandShell } from '../../shared/actions/ActionTypes';
import { withShell } from './plugins/shellCommand';

export type { ManagedProcessStatus, ManagedProcessInfo, ProcessOutputEvent, ProcessExitEvent } from '../../shared/actions/ProcessTypes';

type ManagedProcess = ManagedProcessInfo & {
  child: ChildProcess;
  outputBuffer: string;
};

/** Ring buffer cap — generous, since only getProcessOutput's own maxChars slice ever reaches the model. */
const RING_BUFFER_MAX_CHARS = 200_000;
/** How long start() waits for a definitive spawn/error signal before assuming the launch itself succeeded. */
const START_GRACE_MS = 300;
/** Bounds unbounded growth from processes that started, exited, and were never explicitly cleaned up. */
const MAX_TRACKED_PROCESSES = 50;

/**
 * child_process.spawn-based registry for anything Paw runs as a background
 * process (dev servers, watch builds) — distinct from RunCommandPlugin's
 * buffered exec(), which blocks until exit and has no way to represent
 * "still running and that's fine." Every process here was started by Paw
 * itself; stop()/restart() never touch a PID this class didn't spawn.
 *
 * On Windows, spawn(..., {shell:true}) makes cmd.exe the direct child and
 * the real process (node/python/etc.) a grandchild — child.kill() would
 * only kill the shell wrapper and orphan the real process, so stop() shells
 * out to `taskkill /T /F` (tree-kill) instead.
 */
class ProcessManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess>();

  private toInfo(managed: ManagedProcess): ManagedProcessInfo {
    const { child: _child, outputBuffer: _outputBuffer, ...info } = managed;
    return info;
  }

  private prune(): void {
    if (this.processes.size <= MAX_TRACKED_PROCESSES) return;
    const finished = [...this.processes.values()]
      .filter((p) => p.status !== 'running' && p.status !== 'starting')
      .sort((a, b) => (a.exitedAt ?? 0) - (b.exitedAt ?? 0));
    for (const p of finished) {
      if (this.processes.size <= MAX_TRACKED_PROCESSES) break;
      this.processes.delete(p.id);
    }
  }

  start(command: string, cwd: string, label?: string, shell?: CommandShell): Promise<{ ok: true; info: ManagedProcessInfo } | { ok: false; message: string }> {
    return new Promise((resolve) => {
      let settled = false;
      const id = uuidv4();

      let child: ChildProcess;
      try {
        child = spawn(withShell(command, shell), { cwd, shell: true, windowsHide: true });
      } catch (error) {
        resolve({ ok: false, message: error instanceof Error ? error.message : 'Failed to start process.' });
        return;
      }

      const managed: ManagedProcess = {
        id,
        pid: child.pid ?? null,
        command,
        cwd,
        label,
        shell,
        status: 'starting',
        startedAt: Date.now(),
        child,
        outputBuffer: '',
      };
      this.processes.set(id, managed);
      this.prune();

      const appendOutput = (chunk: string, stream: 'stdout' | 'stderr') => {
        managed.outputBuffer = (managed.outputBuffer + chunk).slice(-RING_BUFFER_MAX_CHARS);
        this.emit('output', { processId: id, chunk, stream } satisfies ProcessOutputEvent);
      };

      child.stdout?.on('data', (data) => appendOutput(data.toString(), 'stdout'));
      child.stderr?.on('data', (data) => appendOutput(data.toString(), 'stderr'));

      child.once('spawn', () => {
        managed.pid = child.pid ?? managed.pid;
        managed.status = 'running';
        if (!settled) {
          settled = true;
          resolve({ ok: true, info: this.toInfo(managed) });
        }
      });

      child.once('error', (error) => {
        managed.status = 'crashed';
        managed.exitedAt = Date.now();
        if (!settled) {
          settled = true;
          resolve({ ok: false, message: error.message });
        } else {
          this.emit('exit', { processId: id, code: null, signal: null, status: 'crashed' } satisfies ProcessExitEvent);
        }
      });

      child.once('exit', (code, signal) => {
        managed.status = code === 0 ? 'exited' : managed.status === 'killed' ? 'killed' : 'crashed';
        managed.exitedAt = Date.now();
        managed.exitCode = code;
        managed.signal = signal;
        this.emit('exit', { processId: id, code, signal, status: managed.status } satisfies ProcessExitEvent);
      });

      // Backstop in case 'spawn' never fires distinctly for this command —
      // by this point we have a pid and no error has arrived, so the launch
      // itself is real; readiness (is it actually serving traffic) is a
      // separate, pull-based concern (ProcessVerification), not this promise.
      setTimeout(() => {
        if (!settled) {
          settled = true;
          if (managed.status === 'starting') managed.status = 'running';
          resolve({ ok: true, info: this.toInfo(managed) });
        }
      }, START_GRACE_MS);
    });
  }

  async stop(processId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const managed = this.processes.get(processId);
    if (!managed) return { ok: false, message: `No tracked process with id "${processId}".` };
    if (managed.status !== 'running' && managed.status !== 'starting') return { ok: true };

    managed.status = 'killed';
    if (!managed.pid) {
      managed.child.kill();
      return { ok: true };
    }

    return new Promise((resolve) => {
      execFile('taskkill', ['/PID', String(managed.pid), '/T', '/F'], (error) => {
        if (error && !/not found/i.test(error.message)) {
          resolve({ ok: false, message: error.message });
        } else {
          resolve({ ok: true });
        }
      });
    });
  }

  async restart(processId: string): Promise<{ ok: true; info: ManagedProcessInfo } | { ok: false; message: string }> {
    const managed = this.processes.get(processId);
    if (!managed) return { ok: false, message: `No tracked process with id "${processId}".` };
    const { command, cwd, label, shell } = managed;
    const stopResult = await this.stop(processId);
    if (!stopResult.ok) return stopResult;
    return this.start(command, cwd, label, shell);
  }

  list(): ManagedProcessInfo[] {
    return [...this.processes.values()].map((p) => this.toInfo(p));
  }

  getInfo(processId: string): ManagedProcessInfo | undefined {
    const managed = this.processes.get(processId);
    return managed ? this.toInfo(managed) : undefined;
  }

  getOutput(processId: string, maxChars = 4000): { ok: true; output: string; info: ManagedProcessInfo } | { ok: false; message: string } {
    const managed = this.processes.get(processId);
    if (!managed) return { ok: false, message: `No tracked process with id "${processId}".` };
    return { ok: true, output: managed.outputBuffer.slice(-maxChars), info: this.toInfo(managed) };
  }
}

export const processManager = new ProcessManager();
