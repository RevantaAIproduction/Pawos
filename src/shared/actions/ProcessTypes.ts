import type { CommandShell } from './ActionTypes';

/**
 * Shared between main (ProcessManager, the emitter) and renderer (IPC bridge
 * consumers) — kept here rather than in src/main/execution/ProcessManager.ts
 * so renderer/preload files never import across the main-process boundary.
 */
export type ManagedProcessStatus = 'starting' | 'running' | 'exited' | 'crashed' | 'killed';

export type ManagedProcessInfo = {
  id: string;
  pid: number | null;
  command: string;
  cwd: string;
  label?: string;
  /** Which shell interpreted `command` — undefined means the OS default (cmd.exe). Preserved so restart() reuses the same shell. */
  shell?: CommandShell;
  status: ManagedProcessStatus;
  startedAt: number;
  exitedAt?: number;
  exitCode?: number | null;
  signal?: string | null;
};

export type ProcessOutputEvent = { processId: string; chunk: string; stream: 'stdout' | 'stderr' };
export type ProcessExitEvent = { processId: string; code: number | null; signal: string | null; status: ManagedProcessStatus };
