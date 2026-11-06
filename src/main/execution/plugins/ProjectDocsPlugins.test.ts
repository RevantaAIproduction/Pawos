import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
vi.mock('../../memory/entities/fileEntities', () => ({ onFileCreated: vi.fn(), onFileModified: vi.fn() }));
vi.mock('../dependencyGraph/DependencyGraphCache', () => ({ dependencyGraphCache: { get: () => undefined } }));
vi.mock('../semanticIndex/RepositorySemanticIndexService', () => ({ repositorySemanticIndexService: { getIndex: () => undefined } }));
const ledger = { current: null as null | { projectRoot: string; entries: { path: string; originalPath: string; status: string; revertedAt?: number }[] } };
vi.mock('../codeChanges/codeChangeStore', () => ({ codeChangeStore: () => ({ get: () => ledger.current }) }));

import { planProjectDocsPlugin, writeProjectDocsPlugin } from './ProjectDocsPlugins';
import { DESTRUCTIVE_ACTION_TYPES, CODING_EXECUTION_ACTION_TYPES } from '../../../shared/actions/ActionTypes';
import { FILE_CHANGE_ACTION_TYPES, CodeChangeLedgerStore } from '../codeChanges/CodeChangeLedger';
import { describePlannedAction } from '../../../renderer/conversation/confirmationPrompt';

let root: string;
const write = (rel: string, content: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf-8');
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

type PlanData = { writable: string[]; files: { path: string; action: string; reason: string }[]; changes: unknown[] };
type WriteData = { written: { path: string; created: boolean }[]; notWritten: { path: string; reason: string }[] };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-docs-plugin-'));
  ledger.current = null;
  write('package.json', JSON.stringify({ name: 'demo', description: 'Demo app.', scripts: { dev: 'vite', test: 'vitest run' }, dependencies: { react: '18.3.1' } }));
  write('src/components/Badge.tsx', 'export interface BadgeProps {\n  /** Shown text. */\n  text: string;\n  tone?: "info" | "warn";\n}\nexport function Badge({ text, tone = "info" }: BadgeProps) {\n  return <span className={tone}>{text}</span>;\n}\n');
  write('src/App.tsx', "import { Badge } from './components/Badge';\nexport default function App() { return <Badge text=\"hi\" />; }\n");
  write('.env', 'API_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB\n');
  write('node_modules/x/Fake.tsx', 'export function Fake() { return <div/>; }');
});

describe('plan_project_docs (read-only)', () => {
  it('plans from the real source and writes nothing', async () => {
    const before = fs.readdirSync(root).sort();
    const result = await planProjectDocsPlugin.execute({ type: 'planProjectDocs', rootPath: root, docs: ['readme', 'components'] });
    expect(result.ok).toBe(true);
    const data = result.data as PlanData;
    expect(data.writable).toEqual(['README.md', 'docs/components/README.md', 'docs/components/App.md', 'docs/components/Badge.md']);
    expect(fs.readdirSync(root).sort()).toEqual(before);
    expect(JSON.stringify(data)).not.toContain('Fake'); // node_modules is never read
    expect(JSON.stringify(data)).not.toContain('ghp_'); // .env is never read
  });

  it('is not gated as a write, and write_project_docs is (approval + Pro)', () => {
    expect(DESTRUCTIVE_ACTION_TYPES).toContain('writeProjectDocs');
    expect(CODING_EXECUTION_ACTION_TYPES).toContain('writeProjectDocs');
    expect(DESTRUCTIVE_ACTION_TYPES).not.toContain('planProjectDocs');
    expect(CODING_EXECUTION_ACTION_TYPES).not.toContain('planProjectDocs');
    expect(describePlannedAction({ type: 'writeProjectDocs', rootPath: root, paths: ['README.md', 'docs/api.md'] })).toBe(`write these documentation files in ${root}: README.md, docs/api.md`);
  });
});

describe('write_project_docs', () => {
  it('writes only the approved paths, with engine-generated content', async () => {
    const result = await writeProjectDocsPlugin.execute({ type: 'writeProjectDocs', rootPath: root, docs: ['readme', 'components'], paths: ['docs/components/Badge.md'], confirmed: true });
    expect(result.ok).toBe(true);
    expect((result.data as WriteData).written).toEqual([{ path: 'docs/components/Badge.md', created: true }]);
    expect(exists('README.md')).toBe(false);
    const page = read('docs/components/Badge.md');
    expect(page).toContain('| `text` | `string` | yes | — | Shown text. |');
    expect(page).toContain('| `tone` | `"info" \\| "warn"` | no | `"info"` |');
  });

  it('refuses paths outside the plan or the project, and writes nothing for them', async () => {
    const result = await writeProjectDocsPlugin.execute({ type: 'writeProjectDocs', rootPath: root, docs: ['components'], paths: ['../escape.md', 'src/App.tsx', 'docs/api.md'], confirmed: true });
    expect(result.ok).toBe(false);
    expect((result.data as WriteData).notWritten.map((n) => n.path)).toEqual(['../escape.md', 'src/App.tsx', 'docs/api.md']);
    expect(fs.existsSync(path.join(root, '..', 'escape.md'))).toBe(false);
    expect(read('src/App.tsx')).toContain('export default function App');
  });

  it('keeps the user’s text and hand-edited sections when regenerating', async () => {
    await writeProjectDocsPlugin.execute({ type: 'writeProjectDocs', rootPath: root, docs: ['components'], paths: ['docs/components/Badge.md'], confirmed: true });
    const edited = read('docs/components/Badge.md').replace('# Badge\n', '# Badge\n\nMy own notes about badges.\n').replace('Not rendered by any file PawOS read.', 'mine');
    fs.writeFileSync(path.join(root, 'docs/components/Badge.md'), edited);
    write('src/components/Badge.tsx', read('src/components/Badge.tsx').replace('  tone?:', '  /** Hide it. */\n  hidden?: boolean;\n  tone?:'));
    const result = await writeProjectDocsPlugin.execute({ type: 'writeProjectDocs', rootPath: root, docs: ['components'], paths: ['docs/components/Badge.md'], confirmed: true });
    expect(result.ok).toBe(true);
    const page = read('docs/components/Badge.md');
    expect(page).toContain('My own notes about badges.');
    expect(page).toContain('`hidden`');
  });

  it('a user-written README is not overwritten', async () => {
    write('README.md', '# Demo\n\nWritten by hand.\n');
    const plan = await planProjectDocsPlugin.execute({ type: 'planProjectDocs', rootPath: root, docs: ['readme'] });
    expect((plan.data as PlanData).files[0]?.action).toBe('skipped');
    const result = await writeProjectDocsPlugin.execute({ type: 'writeProjectDocs', rootPath: root, docs: ['readme'], paths: ['README.md'], confirmed: true });
    expect(result.ok).toBe(false);
    expect(read('README.md')).toBe('# Demo\n\nWritten by hand.\n');
  });

  it('saves an approved plan as product documents', async () => {
    const plan = { title: 'Demo v1', markdown: '## Product Scope\nA demo.\n## Requirements\n- Fast\n## Implementation Phases\n1. Build it' };
    const result = await writeProjectDocsPlugin.execute({ type: 'writeProjectDocs', rootPath: root, plan, docs: [], paths: ['PRD.md', 'REQUIREMENTS.md', 'IMPLEMENTATION_PLAN.md'], confirmed: true });
    expect(result.ok).toBe(true);
    expect(read('PRD.md')).toContain('A demo.');
    expect(read('REQUIREMENTS.md')).toContain('- Fast');
    expect(read('IMPLEMENTATION_PLAN.md')).toContain('1. Build it');
  });
});

describe('sync from the task change ledger', () => {
  it('updates only the docs the task’s own changed files affect', async () => {
    await writeProjectDocsPlugin.execute({ type: 'writeProjectDocs', rootPath: root, docs: ['components', 'readme'], paths: ['docs/components/README.md', 'docs/components/Badge.md', 'README.md'], confirmed: true });
    write('src/components/Badge.tsx', read('src/components/Badge.tsx').replace('  tone?:', '  size?: number;\n  tone?:'));
    ledger.current = { projectRoot: fs.realpathSync.native(root), entries: [{ path: 'src/components/Badge.tsx', originalPath: 'src/components/Badge.tsx', status: 'modified' }] };
    const plan = await planProjectDocsPlugin.execute({ type: 'planProjectDocs', rootPath: root, sync: true, executionId: 'exec-docs-0001' });
    const data = plan.data as PlanData;
    expect(data.changes).toEqual([{ path: 'src/components/Badge.tsx', kind: 'modified' }]);
    // The Badge page and the index (its prop count changed); not App's page, not the README.
    expect(data.writable).toEqual(['docs/components/README.md', 'docs/components/Badge.md']);
  });

  it('without a ledger, sync plans nothing', async () => {
    const plan = await planProjectDocsPlugin.execute({ type: 'planProjectDocs', rootPath: root, sync: true, executionId: 'exec-docs-0002' });
    expect((plan.data as PlanData).writable).toEqual([]);
  });
});

describe('change ledger capture', () => {
  it('records every documentation file a writeProjectDocs step writes, under the same task', async () => {
    expect(FILE_CHANGE_ACTION_TYPES.has('writeProjectDocs')).toBe(true);
    const store = new CodeChangeLedgerStore(fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-docs-ledger-')), { getAccountId: () => 'user-A', isBusy: () => false, moveToTrash: async () => undefined });
    const token = store.beforeAction('exec-docs-ledger-1', { type: 'writeProjectDocs', rootPath: root, paths: ['README.md', 'docs/api.md'] }, root);
    expect(token?.paths.map((p) => p.rel)).toEqual(['README.md', 'docs/api.md']);
    write('README.md', '# x\n');
    write('docs/api.md', '# api\n');
    const events = await store.afterAction(token!, { ok: true });
    expect(events.map((e) => [e.path, e.entry?.status])).toEqual([['README.md', 'created'], ['docs/api.md', 'created']]);
    expect(store.beforeAction('exec-docs-ledger-2', { type: 'writeProjectDocs', rootPath: root, paths: [] }, root)).toBeNull();
  });
});
