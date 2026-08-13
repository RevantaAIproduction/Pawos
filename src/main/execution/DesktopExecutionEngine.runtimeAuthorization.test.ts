import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { createLocalCodingRuntimeSession } from '../../shared/actions/CodingRuntimeSessionTypes';
import { entitlementService } from '../billing/EntitlementService';
import { DesktopExecutionEngine } from './DesktopExecutionEngine';
import type { DesktopPlugin } from './DesktopPlugin';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  Notification: vi.fn(),
}));

function makeSession() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-runtime-auth-'));
  return {
    root,
    session: createLocalCodingRuntimeSession({ id: `session:${root}`, rootPath: root, createdAt: 1 }),
  };
}

function fakePlugin(actionType: ActionRequest['type'], execute = vi.fn(async (): Promise<ActionResult> => ({ ok: true }))): DesktopPlugin {
  return {
    id: `fake-${actionType}`,
    canHandle: (request) => request.type === actionType,
    requirements: () => [],
    prepare: vi.fn(async () => ({ requirements: [] })),
    execute,
    async *observe() {
      return;
    },
    verify: vi.fn(async (_request, result) => result),
    recover: vi.fn(async (_request, result) => result),
    describeInProgress: () => 'Working.',
    describeDone: (_request, result) => (result.ok ? 'Done.' : 'Blocked.'),
  };
}

describe('DesktopExecutionEngine runtime authorization boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects an unentitled runtime before plugin preparation or execution', async () => {
    const project = makeSession();
    const pluginExecute = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    const plugin = fakePlugin('createDocx', pluginExecute);
    const engine = new DesktopExecutionEngine();
    (engine as unknown as { plugins: DesktopPlugin[] }).plugins = [plugin];

    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
    vi.spyOn(entitlementService, 'isRuntimeEntitled').mockImplementation((runtimeId) => runtimeId !== 'office');

    const result = await engine.execute({
      type: 'createDocx',
      outputPath: path.join(project.root, 'proposal.docx'),
      title: 'Proposal',
      sections: [{ paragraphs: ['Body'] }],
      codingRuntimeSession: project.session,
    });

    expect(result).toMatchObject({ ok: false, reason: 'entitlement-restricted', data: { runtimeId: 'office' } });
    expect(plugin.prepare).not.toHaveBeenCalled();
    expect(pluginExecute).not.toHaveBeenCalled();
  });

  it('allows an entitled runtime to continue to the existing plugin path', async () => {
    const project = makeSession();
    const pluginExecute = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    const plugin = fakePlugin('createDocx', pluginExecute);
    const engine = new DesktopExecutionEngine();
    (engine as unknown as { plugins: DesktopPlugin[] }).plugins = [plugin];

    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
    vi.spyOn(entitlementService, 'isRuntimeEntitled').mockImplementation((runtimeId) => runtimeId === 'office');

    const result = await engine.execute({
      type: 'createDocx',
      outputPath: path.join(project.root, 'proposal.docx'),
      title: 'Proposal',
      sections: [{ paragraphs: ['Body'] }],
      codingRuntimeSession: project.session,
    });

    expect(result.ok).toBe(true);
    expect(plugin.prepare).toHaveBeenCalled();
    expect(pluginExecute).toHaveBeenCalled();
  });
});
