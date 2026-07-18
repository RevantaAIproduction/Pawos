import { execFile } from 'child_process';
import * as net from 'net';
import { processManager } from '../ProcessManager';
import type { ObservationEvent } from '../../../shared/actions/ExecutionLifecycle';

const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls a URL via a real HTTP request until it responds 2xx/3xx or the timeout elapses — "verified", not "probably started." */
export async function waitForHttpHealthy(
  url: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ ok: true; status: number } | { ok: false; message: string }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'No response.';

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status < 400) return { ok: true, status: res.status };
      lastError = `Responded with status ${res.status}.`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Request failed.';
    }
    await sleep(intervalMs);
  }
  return { ok: false, message: `"${url}" never responded within ${Math.round(timeoutMs / 1000)}s — ${lastError}` };
}

export function isProcessAlive(processId: string): boolean {
  return processManager.getInfo(processId)?.status === 'running';
}

/** Waits for a tracked process to actually exit (or times out while it's still running) — covers "did the script finish, and with what exit code." */
export async function waitForExit(
  processId: string,
  opts: { timeoutMs?: number } = {}
): Promise<{ ok: true; exitCode: number | null } | { ok: false; message: string }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const info = processManager.getInfo(processId);
    if (!info) return { ok: false, message: `No tracked process with id "${processId}".` };
    if (info.status !== 'running' && info.status !== 'starting') {
      return { ok: true, exitCode: info.exitCode ?? null };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, message: `Still running after ${Math.round(timeoutMs / 1000)}s.` };
}

/** Polls a process's ring-buffered output for a regex — a port isn't listening the instant a process spawns, so this is what "actually ready" checks before an HTTP probe. */
export async function waitForLogPattern(
  processId: string,
  pattern: RegExp,
  opts: { timeoutMs?: number } = {}
): Promise<{ ok: true; matchedLine: string } | { ok: false; message: string }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const output = processManager.getOutput(processId, 8000);
    if (!output.ok) return { ok: false, message: output.message };
    const match = output.output.match(pattern);
    if (match) return { ok: true, matchedLine: match[0] };
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, message: `Never saw output matching ${pattern} within ${Math.round(timeoutMs / 1000)}s.` };
}

/** Cheap TCP-connect probe — for proactive "is this port already taken" checks and passive verification a server is listening. */
export function checkPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host, timeout: 2000 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

/** Polls `tasklist` for a process by image name (e.g. "Code.exe") — used to verify launches of apps PawOS didn't itself spawn via ProcessManager (VS Code, Notepad, ...). */
export async function waitForOsProcess(imageName: string, opts: { timeoutMs?: number } = {}): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found = await new Promise<boolean>((resolve) => {
      execFile('tasklist', ['/FI', `IMAGENAME eq ${imageName}`], (error, stdout) => {
        resolve(!error && stdout.toLowerCase().includes(imageName.toLowerCase()));
      });
    });
    if (found) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

/**
 * Generic "watch a Paw-spawned process while it's in flight" observation —
 * reused by every plugin whose real work happens in a background process
 * (startProcess/restartProcess/buildProject/runDeployScript) instead of each
 * writing its own poll loop. Yields one event per new line of output as it
 * appears, and a final event once the process leaves running/starting.
 */
export async function* observeProcess(processId: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): AsyncGenerator<ObservationEvent> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastTail = '';

  while (Date.now() < deadline) {
    const info = processManager.getInfo(processId);
    if (!info) return;
    if (info.status !== 'running' && info.status !== 'starting') {
      const summary =
        info.status === 'exited' && info.exitCode === 0
          ? 'Finished.'
          : `Process ${info.status}${info.exitCode != null ? ` (exit code ${info.exitCode})` : ''}.`;
      yield { at: Date.now(), message: summary };
      return;
    }
    const output = processManager.getOutput(processId, 300);
    const tail = output.ok ? output.output.trim() : '';
    if (tail && tail !== lastTail) {
      lastTail = tail;
      const lastLine = tail.split('\n').filter(Boolean).slice(-1)[0] ?? tail;
      yield { at: Date.now(), message: lastLine.slice(0, 200) };
    }
    await sleep(intervalMs);
  }
}
