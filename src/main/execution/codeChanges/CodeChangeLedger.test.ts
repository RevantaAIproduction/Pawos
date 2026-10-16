import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diffLines } from 'diff';

// Real files and chunked async diffs: generous per-test time on a busy machine (a timed-out test that kept
// running would otherwise write into the next test's temp project).
vi.setConfig({ testTimeout: 60_000 });
import { CodeChangeLedgerStore, MAX_LEDGERS, MAX_STORED_BYTES, buildHunks } from './CodeChangeLedger';
import type { CodeChangeEvent } from '../../../shared/actions/CodeChangeTypes';

/**
 * The change ledger against real files in temp folders: every capture goes before → real fs
 * operation → after, exactly as DesktopExecutionEngine drives it.
 */

let account: string | null = 'user-A';
let busy = false;
let trashed: string[] = [];
let project: string;
let storeDir: string;

function newStore(extra: Partial<ConstructorParameters<typeof CodeChangeLedgerStore>[1]> = {}): CodeChangeLedgerStore {
  return new CodeChangeLedgerStore(storeDir, {
    getAccountId: () => account,
    isBusy: () => busy,
    moveToTrash: async (abs) => {
      const target = path.join(storeDir, 'trash', `${trashed.length}-${path.basename(abs)}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(abs, target);
      trashed.push(abs);
    },
    ...extra,
  });
}

let store: CodeChangeLedgerStore;
const file = (rel: string) => path.join(project, rel);
const write = (rel: string, data: string | Buffer) => {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  fs.writeFileSync(file(rel), data);
};
const read = (rel: string) => fs.readFileSync(file(rel), 'utf-8');
const bytes = (rel: string) => fs.readFileSync(file(rel));

/** One tracked operation: capture, do the real change, record. */
async function op(executionId: string, request: Record<string, unknown> & { type: string }, change: () => void, ok = true): Promise<CodeChangeEvent[]> {
  const token = store.beforeAction(executionId, request, project);
  expect(token).not.toBeNull();
  change();
  return store.afterAction(token!, { ok });
}
const writeOp = (id: string, rel: string, data: string | Buffer) => op(id, { type: 'writeFile', path: file(rel) }, () => write(rel, data));
const editOp = (id: string, rel: string, data: string | Buffer) => op(id, { type: 'applyCodeEdit', path: file(rel) }, () => write(rel, data));
const entry = (id: string, rel: string) => store.get(id)!.entries.find((e) => e.path === rel)!;

beforeEach(() => {
  account = 'user-A';
  busy = false;
  trashed = [];
  project = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ledger-project-'));
  fs.writeFileSync(path.join(project, 'package.json'), '{"name":"p"}');
  storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ledger-store-'));
  store = newStore();
});

describe('capturing changes', () => {
  it('modified: the real removed and added lines, relative path, ordered sequence', async () => {
    write('src/flags.ts', 'const a = 1;\nconst enabled = false;\nconst b = 2;\n');
    const [event] = await editOp('exec-mod-0001', 'src/flags.ts', 'const a = 1;\nconst enabled = true;\nconst b = 2;\n');
    expect(event).toMatchObject({ seq: 1, operation: 'edit', path: 'src/flags.ts', result: 'completed' });
    expect(event.entry).toMatchObject({ status: 'modified', added: 1, removed: 1 });
    const diff = await store.diff('exec-mod-0001', 'src/flags.ts');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    const changed = diff.hunks.flatMap((h) => h.lines).filter((l) => l.kind !== 'context');
    expect(changed).toEqual([
      { kind: 'remove', text: 'const enabled = false;', oldLine: 2, newLine: null },
      { kind: 'add', text: 'const enabled = true;', oldLine: null, newLine: 2 },
    ]);
    expect(diff.hunks[0].lines.filter((l) => l.kind === 'context').map((l) => l.text)).toEqual(['const a = 1;', 'const b = 2;']);
    expect(diff.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3 });
  });

  it('created: every line is an addition', async () => {
    await writeOp('exec-new-0001', 'src/new.ts', 'one\ntwo\nthree\n');
    expect(entry('exec-new-0001', 'src/new.ts')).toMatchObject({ status: 'created', added: 3, removed: 0 });
    const diff = await store.diff('exec-new-0001', 'src/new.ts');
    expect(diff.ok && diff.hunks[0].lines.every((l) => l.kind === 'add')).toBe(true);
  });

  it('deleted: every original line is a removal', async () => {
    write('old.txt', 'a\nb\n');
    await op('exec-del-0001', { type: 'deletePath', path: file('old.txt') }, () => fs.rmSync(file('old.txt')));
    expect(entry('exec-del-0001', 'old.txt')).toMatchObject({ status: 'deleted', added: 0, removed: 2 });
  });

  it('renamed: history moves with the file; a rename with an edit shows the edit', async () => {
    write('a.ts', 'x\ny\n');
    await editOp('exec-ren-0001', 'a.ts', 'x\nY\n');
    const [event] = await op('exec-ren-0001', { type: 'movePath', from: file('a.ts'), to: file('lib/b.ts') }, () => {
      fs.mkdirSync(file('lib'), { recursive: true });
      fs.renameSync(file('a.ts'), file('lib/b.ts'));
    });
    expect(event).toMatchObject({ operation: 'move', path: 'lib/b.ts', previousPath: 'a.ts' });
    expect(store.get('exec-ren-0001')!.entries).toHaveLength(1);
    expect(entry('exec-ren-0001', 'lib/b.ts')).toMatchObject({ status: 'renamed', originalPath: 'a.ts', added: 1, removed: 1 });
  });

  it('moving onto an existing file: source deleted, target modified — not presented as a rename', async () => {
    write('src.txt', 'new\n');
    write('dst.txt', 'old\n');
    await op('exec-ovr-0001', { type: 'movePath', from: file('src.txt'), to: file('dst.txt') }, () => fs.renameSync(file('src.txt'), file('dst.txt')));
    expect(entry('exec-ovr-0001', 'src.txt').status).toBe('deleted');
    expect(entry('exec-ovr-0001', 'dst.txt')).toMatchObject({ status: 'modified', added: 1, removed: 1 });
  });

  it('repeated edits collapse into one net change against the original baseline', async () => {
    write('f.ts', 'v1\n');
    await editOp('exec-rep-0001', 'f.ts', 'v2\n');
    await editOp('exec-rep-0001', 'f.ts', 'v3\n');
    const events = await editOp('exec-rep-0001', 'f.ts', 'v4\n');
    expect(events[0].seq).toBe(3);
    expect(entry('exec-rep-0001', 'f.ts')).toMatchObject({ status: 'modified', added: 1, removed: 1 });
    const diff = await store.diff('exec-rep-0001', 'f.ts');
    expect(diff.ok && diff.hunks.flatMap((h) => h.lines).map((l) => `${l.kind}:${l.text}`)).toEqual(['remove:v1', 'add:v4']);
  });

  it('a file put back exactly as it was has an empty net diff', async () => {
    write('f.ts', 'original\n');
    await editOp('exec-back-001', 'f.ts', 'changed\n');
    await editOp('exec-back-001', 'f.ts', 'original\n');
    expect(entry('exec-back-001', 'f.ts')).toMatchObject({ status: 'unchanged', added: 0, removed: 0 });
    const diff = await store.diff('exec-back-001', 'f.ts');
    expect(diff.ok && diff.hunks).toEqual([]);
    expect(store.summarize(store.get('exec-back-001')!).totals.files).toBe(0);
  });

  it('created then deleted within the task: no net change', async () => {
    await writeOp('exec-tmp-0001', 'scratch.txt', 'temp');
    await op('exec-tmp-0001', { type: 'deletePath', path: file('scratch.txt') }, () => fs.rmSync(file('scratch.txt')));
    expect(entry('exec-tmp-0001', 'scratch.txt').status).toBe('unchanged');
  });

  it('an operation that changed nothing (refused, failed before writing) records nothing', async () => {
    write('keep.txt', 'same');
    expect(await op('exec-noop-001', { type: 'writeFile', path: file('keep.txt') }, () => {}, false)).toEqual([]);
    expect(store.get('exec-noop-001')).toBeNull();
  });

  it('a write that changed the file but then failed (or was cancelled) is still recorded truthfully', async () => {
    write('half.txt', 'before');
    const [event] = await op('exec-fail-001', { type: 'writeFile', path: file('half.txt') }, () => write('half.txt', 'after'), false);
    expect(event).toMatchObject({ result: 'failed', entry: { status: 'modified' } });
  });

  it('tasks are attributed separately; each task diffs against its own baseline', async () => {
    write('shared.ts', 'base\n');
    await editOp('exec-taskA-01', 'shared.ts', 'by A\n');
    await editOp('exec-taskB-01', 'shared.ts', 'by B\n');
    const a = await store.diff('exec-taskA-01', 'shared.ts');
    const b = await store.diff('exec-taskB-01', 'shared.ts');
    expect(a.ok && a.hunks[0].lines.map((l) => l.text)).toEqual(['base', 'by A']);
    expect(b.ok && b.hunks[0].lines.map((l) => l.text)).toEqual(['by A', 'by B']);
  });

  it('a file in another folder of the same task widens the root to a common ancestor (never outside)', async () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ledger-other-'));
    write('in.ts', 'a');
    await editOp('exec-wide-001', 'in.ts', 'b');
    const token = store.beforeAction('exec-wide-001', { type: 'writeFile', path: path.join(elsewhere, 'x.ts') }, project);
    expect(token).not.toBeNull();
    fs.writeFileSync(path.join(elsewhere, 'x.ts'), 'x');
    await store.afterAction(token!, { ok: true });
    const paths = store.get('exec-wide-001')!.entries.map((e) => e.path);
    expect(paths.every((p) => !p.startsWith('..') && !path.isAbsolute(p))).toBe(true);
    expect(paths).toContain(`${path.basename(project)}/in.ts`);
  });

  it('commands are counted, never attributed', () => {
    store.noteUntrackedCommand('exec-cmd-0001', project);
    store.noteUntrackedCommand('exec-cmd-0001', project);
    expect(store.get('exec-cmd-0001')).toMatchObject({ untrackedCommandCount: 2, entries: [] });
  });
});

describe('sensitive and large content', () => {
  it('secret files: change recorded, content never stored or diffed, hash never sent to the renderer', async () => {
    write('.env', 'API_KEY=one\n');
    const [event] = await editOp('exec-sec-0001', '.env', 'API_KEY=two\n');
    expect(event.entry).toMatchObject({ status: 'modified', added: null, removed: null, final: { content: 'hidden', hiddenReason: 'secret', hash: null } });
    expect(event.entry?.baseline.hash).toBeNull();
    expect(store.summarize(store.get('exec-sec-0001')!).entries[0].final.hash).toBeNull();
    expect(await store.diff('exec-sec-0001', '.env')).toMatchObject({ ok: false, reason: 'hidden', hiddenReason: 'secret' });
    expect(fs.existsSync(path.join(storeDir, 'blobs'))).toBe(false);
    const everything = fs.readdirSync(storeDir, { recursive: true }).map(String).map((f) => path.join(storeDir, f)).filter((f) => fs.statSync(f).isFile());
    expect(everything.some((f) => fs.readFileSync(f, 'utf-8').includes('API_KEY'))).toBe(false);
  });

  it('binary and oversized files are recorded by metadata only', async () => {
    fs.writeFileSync(file('img.bin'), Buffer.from([1, 0, 2, 0]));
    await op('exec-bin-0001', { type: 'writeFile', path: file('img.bin') }, () => fs.writeFileSync(file('img.bin'), Buffer.from([3, 0, 4, 0])));
    expect(entry('exec-bin-0001', 'img.bin').final).toMatchObject({ content: 'hidden', hiddenReason: 'binary' });
    await writeOp('exec-big-0001', 'big.txt', 'x'.repeat(MAX_STORED_BYTES + 10));
    expect(entry('exec-big-0001', 'big.txt').final).toMatchObject({ content: 'hidden', hiddenReason: 'too_large' });
    expect(await store.diff('exec-big-0001', 'big.txt')).toMatchObject({ ok: false, reason: 'hidden', hiddenReason: 'too_large' });
  });
});

describe('accounts (H1)', () => {
  it('account B cannot list, read, diff, extend or revert account A’s changes', async () => {
    write('f.ts', 'a\n');
    await editOp('exec-acct-001', 'f.ts', 'b\n');
    account = 'user-B';
    expect(store.get('exec-acct-001')).toBeNull();
    expect(store.list()).toEqual([]);
    expect(await store.diff('exec-acct-001', 'f.ts')).toMatchObject({ ok: false, reason: 'not_found' });
    expect(await store.revert('exec-acct-001', 'f.ts')).toMatchObject({ ok: false, reason: 'not_found' });
    expect(store.beforeAction('exec-acct-001', { type: 'writeFile', path: file('f.ts') }, project)).toBeNull();
    expect(read('f.ts')).toBe('b\n');
    account = 'user-A';
    expect(store.list().map((s) => s.executionId)).toEqual(['exec-acct-001']);
  });

  it('signed out: nothing is recorded or readable', async () => {
    write('f.ts', 'a\n');
    await editOp('exec-acct-002', 'f.ts', 'b\n');
    account = null;
    expect(store.beforeAction('exec-acct-003', { type: 'writeFile', path: file('f.ts') }, project)).toBeNull();
    store.noteUntrackedCommand('exec-acct-003', project);
    expect(store.get('exec-acct-002')).toBeNull();
    expect(store.list()).toEqual([]);
    account = 'user-A';
    expect(store.get('exec-acct-003')).toBeNull();
  });

  it('a ledger without an account (e.g. older data) is never readable while signed in', async () => {
    write('f.ts', 'a\n');
    await editOp('exec-acct-004', 'f.ts', 'b\n');
    const ledgerFile = path.join(storeDir, 'ledgers', 'exec-acct-004.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf-8'));
    ledger.accountId = null;
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
    const fresh = newStore();
    expect(fresh.get('exec-acct-004')).toBeNull();
    expect(fresh.list()).toEqual([]);
    expect(await fresh.revert('exec-acct-004', 'f.ts')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('signing out between the capture and the record records nothing for the task', async () => {
    write('f.ts', 'a\n');
    const token = store.beforeAction('exec-acct-005', { type: 'writeFile', path: file('f.ts') }, project)!;
    write('f.ts', 'b\n');
    account = 'user-B';
    expect(await store.afterAction(token, { ok: true })).toEqual([]);
    account = 'user-A';
    expect(store.get('exec-acct-005')).toBeNull();
  });
});

describe('persistence and retention', () => {
  it('a fresh store (renderer reconnect, app restart) reconstructs the same changes and diffs', async () => {
    write('f.ts', 'a\n');
    await editOp('exec-per-0001', 'f.ts', 'b\n');
    const again = newStore();
    expect(again.get('exec-per-0001')!.entries[0]).toMatchObject({ path: 'f.ts', status: 'modified' });
    expect(again.get('exec-per-0001')!.events.map((e) => e.seq)).toEqual([1]);
    const diff = await again.diff('exec-per-0001', 'f.ts');
    expect(diff.ok && diff.added).toBe(1);
  });

  it('ledgers beyond the in-memory cache are still read correctly from disk', async () => {
    write('f.ts', 'a\n');
    for (let i = 0; i < 60; i += 1) await editOp(`exec-cache-${String(i).padStart(3, '0')}`, 'f.ts', `v${i}\n`);
    expect(store.get('exec-cache-000')!.entries[0]).toMatchObject({ path: 'f.ts', status: 'modified' });
    const diff = await store.diff('exec-cache-000', 'f.ts');
    expect(diff.ok && diff.hunks[0].lines.map((l) => l.text)).toEqual(['a', 'v0']);
  });

  it(`H3: with ${MAX_LEDGERS} existing records, the next task's first snapshots survive pruning and can be reverted`, async () => {
    // Older records (and blobs nobody references any more, aged past the grace period).
    for (let i = 0; i < MAX_LEDGERS; i += 1) store.noteUntrackedCommand(`exec-old-${String(i).padStart(4, '0')}`, project);
    const orphan = path.join(storeDir, 'blobs', 'f'.repeat(64));
    fs.mkdirSync(path.dirname(orphan), { recursive: true });
    fs.writeFileSync(orphan, 'nobody uses this');
    const old = new Date(Date.now() - 60 * 60_000);
    fs.utimesSync(orphan, old, old);

    write('first.ts', 'the original first file\n');
    await editOp('exec-new-task-1', 'first.ts', 'changed by the new task\n');
    const ledgers = fs.readdirSync(path.join(storeDir, 'ledgers')).filter((f) => f.endsWith('.json'));
    expect(ledgers.length).toBe(MAX_LEDGERS);
    expect(ledgers).toContain('exec-new-task-1.json');
    expect(fs.existsSync(orphan)).toBe(false); // garbage is still collected
    const diff = await store.diff('exec-new-task-1', 'first.ts');
    expect(diff.ok && diff.hunks[0].lines.map((l) => l.text)).toEqual(['the original first file', 'changed by the new task']);
    expect(await store.revert('exec-new-task-1', 'first.ts')).toMatchObject({ ok: true });
    expect(read('first.ts')).toBe('the original first file\n');
  });

  it('lists the account’s tasks newest first with totals', async () => {
    write('a.ts', '1\n');
    await editOp('exec-list-001', 'a.ts', '2\n3\n');
    await writeOp('exec-list-002', 'b.ts', 'x\n');
    const [first, second] = store.list();
    expect(first.executionId).toBe('exec-list-002');
    expect(second.totals).toMatchObject({ files: 1, added: 2, removed: 1, modified: 1 });
  });
});

describe('safe revert', () => {
  it('modified file, unchanged since the task: restored exactly, recorded as its own event', async () => {
    write('f.ts', 'original\n');
    await editOp('exec-rv-mod-1', 'f.ts', 'task\n');
    const result = await store.revert('exec-rv-mod-1', 'f.ts');
    expect(result).toMatchObject({ ok: true, restored: 'content' });
    expect(read('f.ts')).toBe('original\n');
    expect(result.ok && result.event).toMatchObject({ operation: 'revert', seq: 2, entry: { status: 'unchanged' } });
    expect(entry('exec-rv-mod-1', 'f.ts').revertedAt).toBeTypeOf('number');
  });

  it('H2: byte-exact — invalid UTF-8 and Windows-1252 bytes come back exactly', async () => {
    const windows1252 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x96, 0x20, 0x93, 0x71, 0x75, 0x6f, 0x74, 0x65, 0x94, 0x0d, 0x0a]); // café – “quote”\r\n
    const invalidUtf8 = Buffer.from([0x41, 0xc3, 0x28, 0xff, 0xfe, 0x42, 0x0a]);
    write('legacy.txt', windows1252);
    write('broken.txt', invalidUtf8);
    await editOp('exec-rv-byt-1', 'legacy.txt', 'replaced by the task\n');
    await editOp('exec-rv-byt-1', 'broken.txt', 'replaced too\n');
    expect(await store.revert('exec-rv-byt-1', 'legacy.txt')).toMatchObject({ ok: true });
    expect(await store.revert('exec-rv-byt-1', 'broken.txt')).toMatchObject({ ok: true });
    expect(bytes('legacy.txt').equals(windows1252)).toBe(true);
    expect(bytes('broken.txt').equals(invalidUtf8)).toBe(true);
  });

  it('H2: if the original bytes cannot be reproduced, the file is left exactly as it was', async () => {
    write('f.ts', 'original\n');
    await editOp('exec-rv-byt-2', 'f.ts', 'task version\n');
    // Damage the stored original: its content no longer matches its hash.
    const baselineHash = crypto.createHash('sha256').update('original\n').digest('hex');
    fs.writeFileSync(path.join(storeDir, 'blobs', baselineHash), 'tampered\n');
    const result = await store.revert('exec-rv-byt-2', 'f.ts');
    expect(result.ok).toBe(false);
    expect(read('f.ts')).toBe('task version\n');
    expect(fs.readdirSync(project).some((f) => f.includes('pawos-revert'))).toBe(false);
  });

  it('a file the user edited afterwards is a conflict — nothing is overwritten', async () => {
    write('f.ts', 'original\n');
    await editOp('exec-rv-cfl-1', 'f.ts', 'task\n');
    write('f.ts', 'task\nplus my own work\n');
    expect(await store.revert('exec-rv-cfl-1', 'f.ts')).toMatchObject({ ok: false, reason: 'conflict' });
    expect(read('f.ts')).toBe('task\nplus my own work\n');
  });

  it('M1: while a task step runs, revert waits (nothing it writes can be overwritten)', async () => {
    write('f.ts', 'original\n');
    await editOp('exec-rv-busy1', 'f.ts', 'task\n');
    busy = true;
    expect(await store.revert('exec-rv-busy1', 'f.ts')).toMatchObject({ ok: false, reason: 'conflict' });
    expect(read('f.ts')).toBe('task\n');
    busy = false;
    expect(await store.revert('exec-rv-busy1', 'f.ts')).toMatchObject({ ok: true });
  });

  it('M1: a later change by the task clears the revert mark, so it can be reverted again', async () => {
    write('f.ts', 'original\n');
    await editOp('exec-rv-agn-1', 'f.ts', 'first\n');
    expect(await store.revert('exec-rv-agn-1', 'f.ts')).toMatchObject({ ok: true });
    await editOp('exec-rv-agn-1', 'f.ts', 'second\n');
    expect(entry('exec-rv-agn-1', 'f.ts').revertedAt).toBeUndefined();
    expect(entry('exec-rv-agn-1', 'f.ts').status).toBe('modified');
    expect(await store.revert('exec-rv-agn-1', 'f.ts')).toMatchObject({ ok: true });
    expect(read('f.ts')).toBe('original\n');
  });

  it('unrelated files (changed by the user, never touched by the task) are left exactly as they are', async () => {
    write('task.ts', 'a\n');
    write('mine.ts', 'my uncommitted work\n');
    await editOp('exec-rv-unr-1', 'task.ts', 'b\n');
    write('mine.ts', 'my uncommitted work, edited\n');
    expect(await store.revert('exec-rv-unr-1', 'task.ts')).toMatchObject({ ok: true });
    expect(read('mine.ts')).toBe('my uncommitted work, edited\n');
    expect(await store.revert('exec-rv-unr-1', 'mine.ts')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('created file: moved to PawOS’s trash (never hard-deleted)', async () => {
    await writeOp('exec-rv-new-1', 'new.ts', 'hello\n');
    expect(await store.revert('exec-rv-new-1', 'new.ts')).toMatchObject({ ok: true, restored: 'removed' });
    expect(fs.existsSync(file('new.ts'))).toBe(false);
    expect(trashed).toEqual([fs.realpathSync.native(project) + path.sep + 'new.ts']);
  });

  it('deleted file: content restored', async () => {
    write('gone.ts', 'keep me\n');
    await op('exec-rv-del-1', { type: 'deletePath', path: file('gone.ts') }, () => fs.rmSync(file('gone.ts')));
    expect(await store.revert('exec-rv-del-1', 'gone.ts')).toMatchObject({ ok: true, restored: 'content' });
    expect(read('gone.ts')).toBe('keep me\n');
  });

  it('renamed file: moved back (and edits undone), the renamed copy goes to trash; refused if the original path is taken', async () => {
    write('a.ts', 'x\n');
    await op('exec-rv-ren-1', { type: 'movePath', from: file('a.ts'), to: file('b.ts') }, () => fs.renameSync(file('a.ts'), file('b.ts')));
    await editOp('exec-rv-ren-1', 'b.ts', 'y\n');
    write('a.ts', 'someone else’s new a.ts\n');
    expect(await store.revert('exec-rv-ren-1', 'b.ts')).toMatchObject({ ok: false, reason: 'conflict' });
    fs.rmSync(file('a.ts'));
    expect(await store.revert('exec-rv-ren-1', 'b.ts')).toMatchObject({ ok: true, restored: 'moved_back' });
    expect(read('a.ts')).toBe('x\n');
    expect(fs.existsSync(file('b.ts'))).toBe(false);
    expect(trashed.map((t) => path.basename(t))).toEqual(['b.ts']);
  });

  it('a second revert is refused safely', async () => {
    write('f.ts', '1\n');
    await editOp('exec-rv-two-1', 'f.ts', '2\n');
    await store.revert('exec-rv-two-1', 'f.ts');
    write('f.ts', 'later work\n');
    expect(await store.revert('exec-rv-two-1', 'f.ts')).toMatchObject({ ok: false, reason: 'already_reverted' });
    expect(read('f.ts')).toBe('later work\n');
  });

  it('secret files cannot be reverted (no copy is kept)', async () => {
    write('.env', 'A=1\n');
    await editOp('exec-rv-sec-1', '.env', 'A=2\n');
    expect(await store.revert('exec-rv-sec-1', '.env')).toMatchObject({ ok: false, reason: 'not_revertible' });
    expect(read('.env')).toBe('A=2\n');
  });

  it('path traversal is rejected — only ledger paths are accepted, and a tampered ledger cannot escape the root', async () => {
    write('f.ts', '1\n');
    await editOp('exec-rv-trv-1', 'f.ts', '2\n');
    expect(await store.revert('exec-rv-trv-1', '../outside.ts')).toMatchObject({ ok: false, reason: 'not_found' });
    const ledgerFile = path.join(storeDir, 'ledgers', 'exec-rv-trv-1.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf-8'));
    ledger.entries[0].path = '../escape.ts';
    ledger.entries[0].originalPath = '../escape.ts';
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
    const fresh = newStore();
    expect(await fresh.revert('exec-rv-trv-1', '../escape.ts')).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(fs.existsSync(path.join(path.dirname(project), 'escape.ts'))).toBe(false);
  });

  it('a path the Coding Runtime boundary refuses is never written', async () => {
    write('f.ts', '1\n');
    await editOp('exec-rv-bnd-1', 'f.ts', '2\n');
    const guarded = newStore({ checkWriteBoundary: () => 'Blocked by the workspace boundary.' });
    expect(await guarded.revert('exec-rv-bnd-1', 'f.ts')).toEqual({ ok: false, path: 'f.ts', reason: 'forbidden', message: 'Blocked by the workspace boundary.' });
    expect(read('f.ts')).toBe('2\n');
  });

  it('never writes through a symbolic link that replaced the file', async () => {
    write('f.ts', '1\n');
    await editOp('exec-rv-lnk-1', 'f.ts', '2\n');
    const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ledger-link-')), 'victim.txt');
    fs.writeFileSync(target, 'do not touch');
    fs.rmSync(file('f.ts'));
    try {
      fs.symlinkSync(target, file('f.ts'), 'file');
    } catch {
      return; // creating symlinks needs Developer Mode/admin on Windows — nothing to test here
    }
    expect((await store.revert('exec-rv-lnk-1', 'f.ts')).ok).toBe(false);
    expect(fs.readFileSync(target, 'utf-8')).toBe('do not touch');
  });
});

describe('hunks (async line diff)', () => {
  it('keeps 3 lines of context and merges nearby changes', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);
    const before = lines.join('\n') + '\n';
    const afterLines = [...lines];
    afterLines[4] = 'X5';
    afterLines[8] = 'X9'; // 3 unchanged lines apart → same hunk
    afterLines[25] = 'X26'; // far away → its own hunk
    const after = afterLines.join('\n') + '\n';
    const hunks = buildHunks(diffLines(before, after), 3);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ oldStart: 2, newStart: 2 });
    expect(hunks[1]).toMatchObject({ oldStart: 23, oldLines: 7, newStart: 23, newLines: 7 });
  });
});
