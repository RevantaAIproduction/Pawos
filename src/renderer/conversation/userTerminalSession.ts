import { ipc } from '../services/ipc/ipcBridgeImplementation';

/**
 * The chat's Terminal panel session: ONE real, persistent PowerShell the user types into themselves
 * (the AI never writes to it). Lives at module level so closing and reopening the panel keeps the
 * same shell, history and output — like a terminal in an editor.
 */

export type TerminalStatus = 'idle' | 'starting' | 'running' | 'exited' | 'error';
export type TerminalChunk = { text: string; stream: 'stdout' | 'stderr' | 'system' };
export type TerminalSnapshot = { status: TerminalStatus; processId: string | null; chunks: TerminalChunk[]; cwd: string | null };

const MAX_CHARS = 200_000;
const BANNER = 'Windows PowerShell\nCopyright (C) Microsoft Corporation. All rights reserved.\n\n';

let snapshot: TerminalSnapshot = { status: 'idle', processId: null, chunks: [], cwd: null };
const listeners = new Set<() => void>();
let wired = false;

function emit(next: Partial<TerminalSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function append(text: string, stream: TerminalChunk['stream']): void {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '');
  if (!clean) return;
  let chunks = [...snapshot.chunks];
  const last = chunks[chunks.length - 1];
  if (last && last.stream === stream) chunks[chunks.length - 1] = { text: last.text + clean, stream };
  else chunks.push({ text: clean, stream });
  // Keep the newest output only.
  let total = chunks.reduce((sum, c) => sum + c.text.length, 0);
  while (total > MAX_CHARS && chunks.length > 1) {
    total -= chunks[0]!.text.length;
    chunks = chunks.slice(1);
  }
  emit({ chunks });
}

/** One IPC subscription for the app's lifetime (the bridge has no unsubscribe) — filtered to our shell. */
function wireOnce(): void {
  if (wired) return;
  wired = true;
  ipc.onProcessOutput((event) => {
    if (event.processId === snapshot.processId) append(event.chunk, event.stream === 'stderr' ? 'stderr' : 'stdout');
  });
  ipc.onProcessExit((event) => {
    if (event.processId !== snapshot.processId) return;
    append(`\n[PowerShell exited${event.code !== null && event.code !== undefined ? ` with code ${event.code}` : ''}. Press + for a new terminal.]\n`, 'system');
    emit({ status: 'exited' });
  });
}

export function getTerminalSnapshot(): TerminalSnapshot {
  return snapshot;
}

export function subscribeTerminal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts PowerShell in `cwd` (the open project, else home) unless one is already running. */
export async function ensureTerminal(cwd?: string | null): Promise<void> {
  wireOnce();
  if (snapshot.status === 'running' || snapshot.status === 'starting') return;
  emit({ status: 'starting', chunks: [{ text: BANNER, stream: 'system' }], cwd: cwd ?? null });
  const started = await ipc.terminalStartUserShell(cwd ?? undefined);
  if (!started.ok) {
    append(`Could not start PowerShell: ${started.message}\n`, 'system');
    emit({ status: 'error', processId: null });
    return;
  }
  emit({ status: 'running', processId: started.info.id });
}

/** "+" — stop the current shell and open a fresh one. */
export async function restartTerminal(cwd?: string | null): Promise<void> {
  const old = snapshot.processId;
  emit({ status: 'idle', processId: null, chunks: [] });
  if (old) await ipc.actionExecute({ type: 'stopProcess', processId: old }).catch(() => undefined);
  await ensureTerminal(cwd);
}

/** Sends one typed line. `cls` / `clear` also wipe the visible output, as in a real terminal. */
export async function sendTerminalLine(line: string): Promise<void> {
  if (!snapshot.processId || snapshot.status !== 'running') return;
  if (/^\s*(cls|clear|clear-host)\s*$/i.test(line)) emit({ chunks: [] });
  await ipc.processWriteStdin(snapshot.processId, `${line}\n`);
}

export function clearTerminal(): void {
  emit({ chunks: [] });
}

/** The folder in PowerShell's latest "PS C:\…>" prompt — where the user currently is (after any cd). */
export function currentPromptFolder(chunks: readonly TerminalChunk[] = snapshot.chunks): string | null {
  const text = chunks.map((c) => c.text).join('');
  const prompts = [...text.matchAll(/(?:^|\n)PS ([^\n>]+)>/g)];
  return prompts.length > 0 ? prompts[prompts.length - 1]![1]!.trim() : null;
}

/**
 * Ctrl+C. A piped shell can't receive a real interrupt signal, so this stops the running command by
 * ending the shell and starting a new one in the same folder the user was in — output so far stays.
 */
export async function interruptTerminal(fallbackCwd?: string | null): Promise<void> {
  const old = snapshot.processId;
  if (!old) return;
  const folder = currentPromptFolder() ?? fallbackCwd ?? null;
  const kept = [...snapshot.chunks, { text: '^C\n', stream: 'system' as const }];
  emit({ status: 'idle', processId: null });
  await ipc.actionExecute({ type: 'stopProcess', processId: old }).catch(() => undefined);
  const started = await ipc.terminalStartUserShell(folder ?? undefined);
  if (!started.ok) {
    emit({ chunks: kept });
    append(`Could not restart PowerShell: ${started.message}\n`, 'system');
    emit({ status: 'error' });
    return;
  }
  emit({ status: 'running', processId: started.info.id, chunks: kept });
}
