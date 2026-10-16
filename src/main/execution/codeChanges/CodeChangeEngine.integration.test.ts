import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionRequest } from '../../../shared/actions/ActionTypes';
import type { CodeChangeEvent } from '../../../shared/actions/CodeChangeTypes';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-engine-changes-userdata-'));
vi.mock('electron', () => ({
  app: { getPath: () => userData },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  Notification: vi.fn(),
}));

// The plugins' Memory Graph bookkeeping needs an initialised memory store; it is not what this test covers.
vi.mock('../../memory/entities/fileEntities', () => ({ onFileCreated: vi.fn(), onFileModified: vi.fn(), onFileDeleted: vi.fn(), onFileMoved: vi.fn(), onFileRenamed: vi.fn() }));
vi.mock('../../memory/entities/codingRuntimeMemoryEntities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../memory/entities/codingRuntimeMemoryEntities')>()),
  recordCodingEditHistory: vi.fn(),
}));
// Usage metering is billing's concern, not this test's: allow the action through (every other gate stays real).
vi.mock('../CodingRuntimeUsageBoundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../CodingRuntimeUsageBoundary')>()),
  enforceCodingRuntimeUsage: vi.fn(async () => null),
}));

import { DesktopExecutionEngine } from '../DesktopExecutionEngine';
import { entitlementService } from '../../billing/EntitlementService';
import { codeChangeStore } from './codeChangeStore';
import { accountSession } from '../../auth/AccountSession';
import { codingModeStore } from '../CodingModeStore';

/**
 * The real engine with its real file plugins (writeFile, applyCodeEdit, deletePath, movePath): a
 * task's operations produce change events and a ledger attributed to that task's execution only.
 */

afterEach(() => vi.restoreAllMocks());

function setup() {
  vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(true);
  vi.spyOn(entitlementService, 'isRuntimeEntitled').mockReturnValue(true);
  // The verified signed-in account (set by the main process from a verified session in the app).
  vi.spyOn(accountSession, 'verifiedUserId', 'get').mockReturnValue('user-1');
  // The local coding-mode safety toggle: full (Pro) mode, so file actions are allowed to run.
  vi.spyOn(codingModeStore, 'getMode').mockReturnValue('pro');
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-engine-changes-project-'));
  fs.writeFileSync(path.join(project, 'package.json'), '{"name":"demo"}');
  fs.mkdirSync(path.join(project, 'src'));
  fs.writeFileSync(path.join(project, 'src', 'config.ts'), 'export const enabled = false;\nexport const retries = 3;\n');
  const engine = new DesktopExecutionEngine();
  const events: CodeChangeEvent[] = [];
  engine.on('codeChange', (event: CodeChangeEvent) => events.push(event));
  return { project, engine, events };
}

describe('the engine records a task’s real file operations', () => {
  it('two files changed by one task: events in order, ledger and diffs match the filesystem', async () => {
    const { project, engine, events } = setup();
    const executionId = 'exec-engine-two-files';
    const config = path.join(project, 'src', 'config.ts');
    const created = path.join(project, 'src', 'feature.ts');

    const edit = await engine.execute({
      type: 'applyCodeEdit',
      path: config,
      edits: [{ contextBefore: [], oldLines: ['export const enabled = false;'], newLines: ['export const enabled = true;'], contextAfter: ['export const retries = 3;'] }],
      confirmed: true,
      executionId,
    } as unknown as ActionRequest);
    expect(edit).toMatchObject({ ok: true });
    const write = await engine.execute({ type: 'writeFile', path: created, content: 'export const feature = 1;\n', confirmed: true, executionId } as ActionRequest);
    expect(write).toMatchObject({ ok: true });

    expect(events.map((e) => [e.seq, e.path, e.entry?.status])).toEqual([
      [1, 'src/config.ts', 'modified'],
      [2, 'src/feature.ts', 'created'],
    ]);
    expect(events.every((e) => e.executionId === executionId)).toBe(true);

    const ledger = codeChangeStore().get(executionId)!;
    expect(fs.realpathSync.native(ledger.projectRoot)).toBe(fs.realpathSync.native(project));
    const diff = await codeChangeStore().diff(executionId, 'src/config.ts');
    expect(diff.ok && diff.hunks.flatMap((h) => h.lines).filter((l) => l.kind !== 'context').map((l) => `${l.kind}:${l.text}`)).toEqual([
      'remove:export const enabled = false;',
      'add:export const enabled = true;',
    ]);
    // The final state really is what is on disk.
    expect(fs.readFileSync(config, 'utf-8')).toBe('export const enabled = true;\nexport const retries = 3;\n');

    // Revert one file through the real store and the Coding Runtime boundary check; the other file is untouched.
    const reverted = await codeChangeStore().revert(executionId, 'src/config.ts');
    expect(reverted).toMatchObject({ ok: true, restored: 'content' });
    expect(fs.readFileSync(config, 'utf-8')).toBe('export const enabled = false;\nexport const retries = 3;\n');
    expect(fs.readFileSync(created, 'utf-8')).toBe('export const feature = 1;\n');
  });

  it('delete and move through the real plugins', async () => {
    const { project, engine, events } = setup();
    const executionId = 'exec-engine-del-move';
    const from = path.join(project, 'src', 'config.ts');
    const to = path.join(project, 'src', 'settings.ts');
    const moved = await engine.execute({ type: 'movePath', from, to, confirmed: true, executionId, cwd: project } as unknown as ActionRequest);
    expect(moved).toMatchObject({ ok: true });
    const removed = await engine.execute({ type: 'deletePath', path: path.join(project, 'package.json'), permanent: true, confirmed: true, executionId } as unknown as ActionRequest);
    expect(removed).toMatchObject({ ok: true });
    expect(events.map((e) => [e.operation, e.path, e.previousPath ?? null, e.entry?.status])).toEqual([
      ['move', 'src/settings.ts', 'src/config.ts', 'renamed'],
      ['delete', 'package.json', null, 'deleted'],
    ]);
  });

  it('an action without an execution id is not attributed to any task', async () => {
    const { project, engine, events } = setup();
    const result = await engine.execute({ type: 'writeFile', path: path.join(project, 'untracked.ts'), content: 'x', confirmed: true } as ActionRequest);
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    expect(events).toEqual([]);
  });

  it('a refused overwrite (waiting for confirmation) records nothing', async () => {
    const { project, engine, events } = setup();
    const result = await engine.execute({ type: 'writeFile', path: path.join(project, 'src', 'config.ts'), content: 'overwrite', executionId: 'exec-engine-refused' } as ActionRequest);
    expect(result).toMatchObject({ ok: false, reason: 'requires-confirmation' });
    expect(events).toEqual([]);
    expect(codeChangeStore().get('exec-engine-refused')).toBeNull();
  });
});
