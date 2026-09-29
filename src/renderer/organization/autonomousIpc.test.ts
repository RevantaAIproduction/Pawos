import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getAutonomousIpc, AUTONOMOUS_IPC_CHANNELS } from './autonomousIpc';

const ROOT = path.join(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

afterEach(() => {
  delete (globalThis as any).window;
});

describe('Autonomous Work IPC reaches the production preload bridge', () => {
  it('maps every channel AutonomousOrchestrator invokes', () => {
    const invoked = [...read('src/renderer/organization/AutonomousOrchestrator.ts').matchAll(/\.invoke\('([a-zA-Z:]+)'/g)].map((m) => m[1]);
    expect(invoked.length).toBeGreaterThan(0);
    for (const channel of invoked) expect(AUTONOMOUS_IPC_CHANNELS).toContain(channel);
  });

  it('every mapped bridge method (and the credential lookups) is defined by the real preload', () => {
    const preload = read('src/main/preload/bridgeImpl.ts');
    const needed = [
      'billingGetPawComputeConfig', 'billingSettleAutonomousRun',
      'connectivityPostJiraComment', 'connectivityTransitionJiraIssue',
      'connectivityPostLinearComment', 'connectivityTransitionLinearIssue',
      'connectivityGetStoredCredential', 'connectivityGetJiraMetadata',
    ];
    for (const method of needed) expect(preload).toMatch(new RegExp(`\\b${method}:`));
  });

  it('the orchestrator no longer reads window.electron directly', () => {
    expect(read('src/renderer/organization/AutonomousOrchestrator.ts')).not.toContain('window as any).electron');
  });

  it('routes channels to __pawos_ipc__ methods with their arguments', async () => {
    const settle = vi.fn().mockResolvedValue({ actualPc: 3 });
    const postJira = vi.fn().mockResolvedValue({ ok: true, data: { ok: true } });
    (globalThis as any).window = { __pawos_ipc__: { billingSettleAutonomousRun: settle, connectivityPostJiraComment: postJira } };
    const ipc = getAutonomousIpc()!;
    await expect(ipc.invoke('billing:settleAutonomousRun', 'run-1', 'org-1')).resolves.toEqual({ actualPc: 3 });
    expect(settle).toHaveBeenCalledWith('run-1', 'org-1');
    await ipc.invoke('connectivity:postJiraComment', { issueKey: 'PAW-1' });
    expect(postJira).toHaveBeenCalledWith({ issueKey: 'PAW-1' });
    await expect(ipc.invoke('connectivity:unknown')).rejects.toThrow(/not exposed/);
  });

  it('falls back to the window.electron stub only when there is no preload bridge (unit tests)', () => {
    const stub = { invoke: vi.fn() };
    (globalThis as any).window = { electron: { ipcRenderer: stub } };
    expect(getAutonomousIpc()).toBe(stub);
    (globalThis as any).window = {};
    expect(getAutonomousIpc()).toBeNull();
  });
});
