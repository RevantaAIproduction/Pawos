import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => {
  const outputListeners: ((e: { processId: string; chunk: string; stream: 'stdout' | 'stderr' }) => void)[] = [];
  const exitListeners: ((e: { processId: string; code: number | null; status: string }) => void)[] = [];
  let nextId = 1;
  return {
    outputListeners,
    exitListeners,
    ipc: {
      terminalStartUserShell: vi.fn(async (_cwd?: string) => ({ ok: true as const, info: { id: `shell-${nextId++}`, pid: 1 } })),
      processWriteStdin: vi.fn(async () => ({ ok: true as const })),
      actionExecute: vi.fn(async () => ({ ok: true })),
      onProcessOutput: (cb: (typeof outputListeners)[number]) => outputListeners.push(cb),
      onProcessExit: (cb: (typeof exitListeners)[number]) => exitListeners.push(cb),
    },
  };
});

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({ ipc: bridge.ipc }));

import { currentPromptFolder, ensureTerminal, getTerminalSnapshot, interruptTerminal, restartTerminal, sendTerminalLine } from './userTerminalSession';

const text = () => getTerminalSnapshot().chunks.map((c) => c.text).join('');
const out = (processId: string, chunk: string, stream: 'stdout' | 'stderr' = 'stdout') =>
  bridge.outputListeners.forEach((cb) => cb({ processId, chunk, stream }));

describe('Terminal panel session — the user\'s own real PowerShell', () => {
  beforeEach(async () => {
    await restartTerminal('C:\\code\\my-app');
    vi.clearAllMocks(); // count only what each test does
  });

  it('starts PowerShell in the open project folder, with the PowerShell banner', async () => {
    await restartTerminal('C:\\code\\my-app');
    expect(bridge.ipc.terminalStartUserShell).toHaveBeenLastCalledWith('C:\\code\\my-app');
    expect(getTerminalSnapshot().status).toBe('running');
    expect(text()).toContain('Windows PowerShell');
  });

  it('shows only its own shell output (Windows line endings normalized), stderr marked', () => {
    const id = getTerminalSnapshot().processId!;
    out(id, 'PS C:\\code\\my-app> ');
    out('some-other-process', 'npm run dev output\r\n');
    out(id, 'node -v\r\nv20.20.1\r\nPS C:\\code\\my-app> ');
    out(id, 'oops : not recognized\r\n', 'stderr');
    expect(text()).toContain('PS C:\\code\\my-app> node -v\nv20.20.1\nPS C:\\code\\my-app> ');
    expect(text()).not.toContain('npm run dev');
    expect(getTerminalSnapshot().chunks.at(-1)).toEqual({ text: 'oops : not recognized\n', stream: 'stderr' });
  });

  it('typed lines go to the shell; cls clears the screen', async () => {
    const id = getTerminalSnapshot().processId!;
    await sendTerminalLine('git status');
    expect(bridge.ipc.processWriteStdin).toHaveBeenLastCalledWith(id, 'git status\n');
    out(id, 'something\n');
    await sendTerminalLine('cls');
    expect(text()).toBe('');
  });

  it('keeps one shell across panel open/close; "+" stops it and starts a fresh one', async () => {
    const first = getTerminalSnapshot().processId;
    await ensureTerminal('C:\\elsewhere'); // reopening the panel: same shell
    expect(getTerminalSnapshot().processId).toBe(first);
    expect(bridge.ipc.terminalStartUserShell).not.toHaveBeenCalled();

    await restartTerminal('C:\\code\\my-app');
    expect(bridge.ipc.actionExecute).toHaveBeenCalledWith({ type: 'stopProcess', processId: first });
    expect(getTerminalSnapshot().processId).not.toBe(first);
  });

  it('Ctrl+C restarts PowerShell in the folder the user had cd-ed into, keeping the output', async () => {
    const id = getTerminalSnapshot().processId!;
    out(id, 'PS C:\\code\\my-app> cd src\nPS C:\\code\\my-app\\src> npm run dev\nlistening on 5173\n');
    expect(currentPromptFolder()).toBe('C:\\code\\my-app\\src');
    await interruptTerminal('C:\\code\\my-app');
    expect(bridge.ipc.actionExecute).toHaveBeenCalledWith({ type: 'stopProcess', processId: id });
    expect(bridge.ipc.terminalStartUserShell).toHaveBeenLastCalledWith('C:\\code\\my-app\\src');
    expect(getTerminalSnapshot().processId).not.toBe(id);
    expect(getTerminalSnapshot().status).toBe('running');
    expect(text()).toContain('listening on 5173\n^C\n');
  });

  it('when PowerShell exits, the panel says so and stops accepting input', async () => {
    const id = getTerminalSnapshot().processId!;
    bridge.exitListeners.forEach((cb) => cb({ processId: id, code: 0, status: 'exited' }));
    expect(getTerminalSnapshot().status).toBe('exited');
    expect(text()).toContain('Press + for a new terminal');
    await sendTerminalLine('dir');
    expect(bridge.ipc.processWriteStdin).not.toHaveBeenCalled();
  });
});
