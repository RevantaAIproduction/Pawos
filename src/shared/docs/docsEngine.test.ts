import { describe, expect, it } from 'vitest';
import { generateDocs, mergeChangelog, selectDocs, writableFiles } from './engine';
import { collectEvidence, extractComponents, extractSchema } from './evidence';
import { detectDocImpact } from './impact';
import { hashBody, mergeManaged, parseBlocks, renderBlock } from './managed';
import { mermaidBlocks, validateMermaid } from './mermaid';
import { findSecrets, isSecretPath, redactSecrets } from './secrets';
import { brief, parsePlanSections } from './render';
import type { GenerateDocsInput, ProjectSnapshot } from './types';

const files: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'shopflow',
    description: 'A small storefront.',
    version: '0.3.0',
    scripts: { dev: 'next dev', build: 'next build', test: 'vitest run', lint: 'eslint' },
    dependencies: { next: '15.0.0', react: '19.0.0', '@supabase/supabase-js': '2.0.0' },
    devDependencies: { vitest: '2.1.9', typescript: '5.8.0', tailwindcss: '4.0.0' },
    engines: { node: '>=20' },
  }),
  'src/components/Button.tsx': [
    "import React from 'react';",
    '',
    'export interface ButtonProps {',
    '  /** Text shown on the button. */',
    '  label: string;',
    "  variant?: 'primary' | 'secondary';",
    '  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;',
    '  disabled?: boolean;',
    '}',
    '',
    '/** The one button used across the store. */',
    "export function Button({ label, variant = 'primary', onClick, disabled }: ButtonProps) {",
    '  return <button className={variant} disabled={disabled} onClick={onClick}>{label}</button>;',
    '}',
  ].join('\n'),
  'src/components/ProductCard.tsx': [
    "'use client';",
    "import { useState } from 'react';",
    "import { Button } from './Button';",
    "import type { Product } from '../types';",
    '',
    'type ProductCardProps = { product: Product; onAdd: (id: string) => void };',
    '',
    'export const ProductCard = ({ product, onAdd }: ProductCardProps) => {',
    '  const [loading, setLoading] = useState(false);',
    '  return <div>{loading ? <span>…</span> : <Button label="Add" onClick={() => onAdd(product.id)} />}</div>;',
    '};',
  ].join('\n'),
  'src/components/Imported.tsx': ["import type { ExternalProps } from 'lib';", 'export default function Imported(props: ExternalProps) {', '  return <div {...props} />;', '}'].join('\n'),
  'src/widgets/CartWidget.tsx': ["import { ProductCard } from '../components/ProductCard';", 'export function CartWidget() {', '  return <aside><ProductCard product={{ id: "1" }} onAdd={() => {}} /></aside>;', '}'].join('\n'),
  'src/types.ts': 'export interface Product { id: string }',
  'app/page.tsx': ["import Link from 'next/link';", 'export default function Home() {', '  return <Link href="/products">Shop</Link>;', '}'].join('\n'),
  'app/products/page.tsx': ['export default function Products() {', '  const error = null;', '  return <a href="/products/42">One</a>;', '}'].join('\n'),
  'app/products/[id]/page.tsx': ['export default function Product() {', "  return <a href='/'>Home</a>;", '}'].join('\n'),
  'app/api/orders/route.ts': [
    "import { createClient } from '@supabase/supabase-js';",
    '/** Lists the signed-in user’s orders. */',
    'export async function GET() {',
    '  const { data } = await supabase.auth.getUser();',
    '  return Response.json(data);',
    '}',
    'export async function POST(req: Request) { return new Response(null, { status: 201 }); }',
    "const k = process.env.SUPABASE_URL; const s = process.env['PAYMENT_API_KEY'];",
  ].join('\n'),
  'supabase/migrations/001_init.sql': [
    'create table public.customers (',
    '  id uuid primary key default gen_random_uuid(),',
    '  email text not null unique',
    ');',
    'create table orders (',
    '  id uuid primary key,',
    '  customer_id uuid not null references customers(id),',
    '  total numeric(10,2) not null -- in dollars',
    ');',
    'alter table orders enable row level security;',
    'create policy "own orders" on orders for select using (auth.uid() = customer_id);',
  ].join('\n'),
  'supabase/migrations/002_status.sql': 'alter table orders add column status text not null default \'new\';',
  'src/styles/globals.css': ':root { --color-primary: #3355ff; --radius-md: 8px; font-family: Inter, sans-serif; }',
  'src/components/Button.test.tsx': "import { it } from 'vitest'; it('renders', () => {});",
  '.env': 'PAYMENT_API_KEY=fixture-placeholder',
  '.env.example': 'SUPABASE_URL=\nPAYMENT_API_KEY=\n',
  '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  test:\n    steps:\n      - run: npm ci\n      - run: npm test\n',
  'vercel.json': '{}',
};

function snapshot(overrides: Record<string, string | null> = {}): ProjectSnapshot {
  const merged: Record<string, string> = { ...files };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  return { files: Object.entries(merged).map(([path, content]) => ({ path, content })), allPaths: Object.keys(merged) };
}

const base = (extra: Partial<GenerateDocsInput> = {}): GenerateDocsInput => ({ snapshot: snapshot(), existing: {}, date: '2026-10-19', ...extra });

describe('component and props evidence', () => {
  it('reads props, types, optionality, defaults and JSDoc from the real source', () => {
    const [button] = extractComponents({ path: 'src/components/Button.tsx', content: files['src/components/Button.tsx'] ?? '' });
    expect(button?.name).toBe('Button');
    expect(button?.description).toBe('The one button used across the store.');
    expect(button?.propsResolved).toBe(true);
    expect(button?.props.map((p) => [p.name, p.type, p.optional, p.defaultValue ?? null, p.description ?? null])).toEqual([
      ['label', 'string', false, null, 'Text shown on the button.'],
      ['variant', "'primary' | 'secondary'", true, "'primary'", null],
      ['onClick', '(event: React.MouseEvent<HTMLButtonElement>) => void', true, null, null],
      ['disabled', 'boolean', true, null, null],
    ]);
  });

  it('reads type aliases, arrow components, hooks, states and use client', () => {
    const [card] = extractComponents({ path: 'src/components/ProductCard.tsx', content: files['src/components/ProductCard.tsx'] ?? '' });
    expect(card?.props.map((p) => p.name)).toEqual(['product', 'onAdd']);
    expect(card?.clientOnly).toBe(true);
    expect(card?.hooks).toContain('useState');
    expect(card?.states).toContain('loading');
  });

  it('never invents props it cannot read: an imported props type is marked unresolved', () => {
    const [imported] = extractComponents({ path: 'src/components/Imported.tsx', content: files['src/components/Imported.tsx'] ?? '' });
    expect(imported?.exportKind).toBe('default');
    expect(imported?.props).toEqual([]);
    expect(imported?.propsResolved).toBe(false);
    expect(imported?.uncertain).toMatch(/ExternalProps.*elsewhere/);
  });

  it('handles forwardRef, inline types, extends and multi-line unions', () => {
    const code = [
      'interface Base { id: string }',
      'interface FieldProps extends Base {',
      '  size:',
      "    | 'sm'",
      "    | 'lg';",
      '}',
      'export const Field = React.forwardRef<HTMLInputElement, FieldProps>((props: FieldProps, ref) => <input ref={ref} />);',
      'export function Inline({ a }: { a: number; b?: string }) { return <i>{a}</i>; }',
    ].join('\n');
    const found = extractComponents({ path: 'src/Field.tsx', content: code });
    const field = found.find((c) => c.name === 'Field');
    expect(field?.props.map((p) => [p.name, p.type])).toEqual([['size', "| 'sm' | 'lg'"], ['id', 'string']]);
    const documented = extractComponents({ path: 'src/T.tsx', content: 'export function T({ title }: { /** The heading text. */ title?: string }) { return <h1>{title}</h1>; }' })[0];
    expect(documented?.props).toEqual([{ name: 'title', type: 'string', optional: true, description: 'The heading text.' }]);
    const inline = found.find((c) => c.name === 'Inline');
    expect(inline?.propsType).toBe('inline');
    expect(inline?.props.map((p) => [p.name, p.optional])).toEqual([['a', false], ['b', true]]);
  });

  it('ignores non-exported, non-PascalCase and test files; marks JavaScript props as untyped', () => {
    expect(extractComponents({ path: 'src/a.tsx', content: 'function Hidden() { return <div/>; }\nexport function helper() { return <div/>; }' })).toEqual([]);
    expect(extractComponents({ path: 'src/A.test.tsx', content: 'export function A() { return <div/>; }' })).toEqual([]);
    const [js] = extractComponents({ path: 'src/Card.jsx', content: 'export function Card({ title, size = 2 }) { return <b>{title}</b>; }' });
    expect(js?.propsResolved).toBe(false);
    expect(js?.props.map((p) => [p.name, p.type, p.defaultValue ?? null])).toEqual([['title', 'not typed (JavaScript)', null], ['size', 'not typed (JavaScript)', '2']]);
  });
});

describe('repository evidence', () => {
  it('applies SQL migrations in order and reads relations, RLS and policies', () => {
    const schema = extractSchema(snapshot().files);
    const orders = schema.tables.find((t) => t.name === 'orders');
    expect(orders?.columns.map((c) => c.name)).toEqual(['id', 'customer_id', 'total', 'status']);
    expect(orders?.columns.find((c) => c.name === 'total')?.type).toBe('numeric(10,2)');
    expect(orders?.rowLevelSecurity).toBe(true);
    expect(orders?.policies).toEqual(['own orders (SELECT)']);
    expect(schema.relations).toEqual([{ from: 'orders', to: 'customers', column: 'customer_id' }]);
  });

  it('reads routes, API methods, navigation, env names, tests and deployment', () => {
    const ev = collectEvidence(snapshot());
    expect(ev.pages.map((p) => p.route)).toEqual(['/', '/products', '/products/[id]']);
    expect(ev.api.map((a) => `${a.method} ${a.route} ${a.checksAuth}`)).toEqual(['GET /api/orders true', 'POST /api/orders true']);
    expect(ev.navigation).toEqual([
      { from: '/', to: '/products' },
      { from: '/products', to: '/products/[id]' },
      { from: '/products/[id]', to: '/' },
    ]);
    expect(ev.env.map((e) => e.name)).toEqual(['PAYMENT_API_KEY', 'SUPABASE_URL']);
    expect(ev.tests.files).toEqual(['src/components/Button.test.tsx']);
    expect(ev.deploy.files.map((f) => f.kind)).toEqual(['Vercel']);
    expect(ev.components.find((c) => c.name === 'Button')?.usedBy).toEqual(['src/components/ProductCard.tsx']);
    expect(ev.components.find((c) => c.name === 'CartWidget')?.kind).toBe('widget');
  });
});

describe('secrets', () => {
  it('never reads secret files and redacts credential-looking values', () => {
    expect(isSecretPath('.env')).toBe(true);
    expect(isSecretPath('config/.env.production')).toBe(true);
    expect(isSecretPath('.env.example')).toBe(false);
    expect(isSecretPath('certs/server.pem')).toBe(true);
    const ev = collectEvidence(snapshot());
    expect(ev.paths).toContain('.env');
    expect(JSON.stringify(ev)).not.toContain('fixture-placeholder');
    const r = redactSecrets('const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB"; password: "hunter2hunter2"');
    expect(r.text).not.toMatch(/ghp_|hunter2/);
    expect(r.text).not.toMatch(/hunter2/);
    expect(findSecrets(r.text)).toEqual([]);
  });

  it('a generated document never contains a secret from the source', () => {
    const leaky = snapshot({ 'src/components/Leak.tsx': '/** Uses token ghp_abcdefghijklmnopqrstuvwxyz0123456789AB */\nexport function Leak() { return <div/>; }' });
    const result = generateDocs({ ...base(), snapshot: leaky, selection: { docs: ['components'] } });
    const page = result.files.find((f) => f.path === 'docs/components/Leak.md');
    expect(page?.action).toBe('create');
    expect(page?.content).not.toContain('ghp_');
    expect(result.warnings.join(' ')).toMatch(/GitHub token/);
  });
});

describe('mermaid', () => {
  it('accepts the diagram types PawOS generates and rejects broken syntax', () => {
    expect(validateMermaid('flowchart LR\n  a["A"]\n  b(["B"])\n  a -->|"3"| b').ok).toBe(true);
    expect(validateMermaid('erDiagram\n  orders {\n    uuid id PK\n  }\n  customers ||--o{ orders : "customer_id"').ok).toBe(true);
    expect(validateMermaid('sequenceDiagram\n  participant A\n  A->>B: hi').ok).toBe(true);
    expect(validateMermaid('flowchart LR\n  a["A"] -->').ok).toBe(false);
    expect(validateMermaid('flowchart LR\n  end --> b').ok).toBe(false);
    expect(validateMermaid('flowchart LR\n  a["unclosed]').ok).toBe(false);
    expect(validateMermaid('erDiagram\n  a ||--xx b : rel').ok).toBe(false);
    expect(validateMermaid('erDiagram\n  a {\n    uuid id PK').ok).toBe(false);
    expect(validateMermaid('pie title x').ok).toBe(false);
  });

  it('every generated diagram, embedded or saved as .mmd, validates', () => {
    const result = generateDocs(base({ selection: { text: 'all documentation' } }));
    const sources = result.files.flatMap((f) => (f.path.endsWith('.mmd') ? [(f.content ?? '').replace(/^%%.*$/gm, '')] : mermaidBlocks(f.content ?? '').map((b) => b.source)));
    expect(sources.length).toBeGreaterThanOrEqual(5);
    for (const s of sources) expect(validateMermaid(s).problems).toEqual([]);
    expect(result.files.map((f) => f.path)).toEqual(expect.arrayContaining(['docs/diagrams/module-dependencies.mmd', 'docs/diagrams/database-erd.mmd', 'docs/diagrams/ui-flow.mmd']));
  });
});

describe('managed sections', () => {
  const sections = [
    { id: 'a', body: 'first' },
    { id: 'b', body: 'second' },
  ];

  it('regenerates only PawOS blocks and keeps the user’s text byte for byte', () => {
    const doc = `# Mine\n\nMy intro.\n\n${renderBlock({ id: 'a', body: 'old' })}\n\nMy notes.\n`;
    const merged = mergeManaged(doc, sections);
    expect(merged.content.startsWith('# Mine\n\nMy intro.\n\n')).toBe(true);
    expect(merged.content).toContain('\n\nMy notes.\n');
    expect(parseBlocks(merged.content).map((b) => [b.id, b.body])).toEqual([['a', 'first'], ['b', 'second']]);
    expect(merged.added).toEqual(['b']);
  });

  it('keeps a block the user edited by hand and reports a conflict', () => {
    const edited = renderBlock({ id: 'a', body: 'old' }).replace('\nold\n', '\nmy own words\n');
    const merged = mergeManaged(edited, [{ id: 'a', body: 'new' }]);
    expect(merged.conflicts).toEqual(['a']);
    expect(merged.content).toContain('my own words');
    expect(merged.changed).toBe(false);
  });

  it('keeps CRLF line endings and is stable', () => {
    const doc = `# T\r\n\r\n${renderBlock({ id: 'a', body: 'x' }).replace(/\n/g, '\r\n')}\r\n`;
    const merged = mergeManaged(doc, [{ id: 'a', body: 'y' }]);
    expect(merged.content).not.toMatch(/[^\r]\n/);
    expect(hashBody('a \nb')).toBe(hashBody('a\r\nb'));
  });
});

describe('the engine', () => {
  it('produces all three documentation types from the evidence, with nothing invented', () => {
    const result = generateDocs(base({ selection: { text: 'all documentation' } }));
    const paths = result.files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'README.md',
        'docs/ARCHITECTURE.md',
        'docs/database.md',
        'docs/api.md',
        'docs/auth.md',
        'docs/testing.md',
        'docs/deployment.md',
        'docs/components/README.md',
        'docs/components/Button.md',
        'docs/components/ProductCard.md',
        'docs/components/Imported.md',
        'docs/widgets/CartWidget.md',
        'docs/design-system.md',
        'docs/pages.md',
        'docs/ui-flows.md',
      ])
    );
    expect(result.ok).toBe(true);
    expect(result.files.every((f) => f.action === 'create')).toBe(true);
    const imported = result.files.find((f) => f.path === 'docs/components/Imported.md');
    expect(imported?.content).toMatch(/\*\*Unverified:\*\*.*ExternalProps/);
    expect(imported?.content).not.toMatch(/\| `\w+` \| `/); // no props table rows
    const readme = result.files.find((f) => f.path === 'README.md')?.content ?? '';
    expect(readme).toContain('A small storefront.');
    expect(readme).toContain('npm run dev');
    expect(readme).not.toMatch(new RegExp(['sk', 'live'].join('_')));
    // On-request documents are not produced without a plan, decision or entry.
    expect(paths).not.toContain('PRD.md');
    expect(paths).not.toContain('IMPLEMENTATION_PLAN.md');
    expect(paths).not.toContain('CHANGELOG.md');
  });

  it('says a document does not apply instead of writing an empty one', () => {
    const bare = { files: [{ path: 'index.js', content: 'console.log(1)' }], allPaths: ['index.js'] };
    const result = generateDocs({ snapshot: bare, existing: {}, date: '2026-10-19', selection: { docs: ['database', 'api', 'components'] } });
    expect(result.files).toEqual([]);
    expect(result.notApplicable.map((n) => n.doc)).toEqual(['database', 'api', 'components']);
  });

  it('is deterministic, and running it again over its own output changes nothing', () => {
    const first = generateDocs(base({ selection: { text: 'all documentation' } }));
    const again = generateDocs(base({ selection: { text: 'all documentation' } }));
    expect(again.files).toEqual(first.files);
    const existing = Object.fromEntries(writableFiles(first).map((f) => [f.path, f.content]));
    const rerun = generateDocs(base({ selection: { text: 'all documentation' }, existing }));
    expect(rerun.files.filter((f) => f.action !== 'unchanged').map((f) => `${f.path}:${f.action}`)).toEqual([]);
  });

  it('leaves a user’s own README alone unless adopting is allowed', () => {
    const existing = { 'README.md': '# My project\n\nHand written.\n' };
    const skipped = generateDocs(base({ selection: { docs: ['readme'] }, existing }));
    expect(skipped.files[0]?.action).toBe('skipped');
    const adopted = generateDocs(base({ selection: { docs: ['readme'] }, existing, policy: { allowCreate: true, adoptUnmanaged: true } }));
    expect(adopted.files[0]?.content?.startsWith('# My project\n\nHand written.\n')).toBe(true);
    expect(adopted.files[0]?.action).toBe('update');
  });

  it('honours the policy: no new files, and a per-path rule', () => {
    const noCreate = generateDocs(base({ selection: { docs: ['api'] }, policy: { allowCreate: false } }));
    expect(noCreate.files[0]?.action).toBe('skipped');
    const rule = generateDocs(base({ selection: { docs: ['api', 'pages'] }, policy: { allowCreate: true, allowPath: (p) => p.startsWith('docs/pages') } }));
    expect(rule.files.map((f) => `${f.path}:${f.action}`)).toEqual(['docs/api.md:skipped', 'docs/pages.md:create']);
  });

  it('never treats a documentation file that exists but was not read as missing', () => {
    const snap = snapshot({ 'docs/api.md': 'huge' });
    const result = generateDocs({ ...base(), snapshot: { ...snap, files: snap.files.filter((f) => f.path !== 'docs/api.md') }, selection: { docs: ['api'] }, changelog: [{ category: 'Added', entry: 'x' }], existing: {} });
    expect(result.files.find((f) => f.path === 'docs/api.md')?.action).toBe('skipped');
    const withChangelog = generateDocs({ ...base(), snapshot: { ...snap, allPaths: [...(snap.allPaths ?? []), 'CHANGELOG.md'] }, changelog: [{ category: 'Added', entry: 'x' }] });
    expect(withChangelog.files.find((f) => f.path === 'CHANGELOG.md')?.action).toBe('skipped');
  });

  it('reports an edited generated diagram as a conflict and keeps it', () => {
    const first = generateDocs(base({ selection: { docs: ['database'] } }));
    const erd = first.files.find((f) => f.path.endsWith('.mmd'))?.content ?? '';
    const existing = { 'docs/diagrams/database-erd.mmd': `${erd}  %% my note\n` };
    const second = generateDocs(base({ selection: { docs: ['database'] }, existing }));
    expect(second.files.find((f) => f.path.endsWith('.mmd'))?.action).toBe('conflict');
  });
});

describe('table text', () => {
  it('keeps the first sentence of a long description, capped', () => {
    expect(brief('Lists orders. Requires a session. Body: none.')).toBe('Lists orders.');
    expect(brief('x'.repeat(300))).toHaveLength(198);
    expect(brief(undefined)).toBe('');
  });
});

describe('selection', () => {
  it('picks documents from the request', () => {
    const none = { existing: {} };
    expect(selectDocs({ text: 'update the API docs and the ERD' }, none)).toEqual(['database', 'api']);
    expect(selectDocs({ text: 'write UI documentation' }, none)).toEqual(['components', 'widgets', 'design-system', 'pages', 'ui-flows']);
    expect(selectDocs({ categories: ['product'] }, none)).toEqual(['readme', 'prd', 'requirements', 'implementation-plan', 'changelog']);
    expect(selectDocs(undefined, { ...none, plan: { markdown: '# x' } })).toContain('implementation-plan');
  });
});

describe('triggers: change impact and sync', () => {
  it('maps real changed files to the documents they affect', () => {
    const impact = detectDocImpact([
      { path: 'src/components/Button.tsx', kind: 'modified' },
      { path: 'supabase/migrations/003.sql', kind: 'added' },
      { path: 'app/api/orders/route.ts', kind: 'modified' },
      { path: 'docs/api.md', kind: 'modified' },
      { path: '.env', kind: 'modified' },
    ]);
    expect(impact.map((i) => i.doc)).toEqual(['api', 'components', 'database']);
    expect(impact.find((i) => i.doc === 'components')?.paths).toEqual(['src/components/Button.tsx']);
  });

  it('sync updates only the docs the project keeps, and only for the changed component', () => {
    const full = generateDocs(base({ selection: { docs: ['components', 'api'] } }));
    const existing = Object.fromEntries(writableFiles(full).filter((f) => f.path !== 'docs/api.md').map((f) => [f.path, f.content]));
    const changed = snapshot({
      'src/components/Button.tsx': (files['src/components/Button.tsx'] ?? '').replace('  disabled?: boolean;', '  disabled?: boolean;\n  /** Shows a spinner. */\n  busy?: boolean;'),
    });
    const result = generateDocs({
      snapshot: changed,
      existing,
      date: '2026-10-19',
      mode: 'sync',
      changes: [{ path: 'src/components/Button.tsx', kind: 'modified' }, { path: 'app/api/orders/route.ts', kind: 'modified' }],
      changelog: [{ category: 'Added', entry: 'Button busy state.' }],
    });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath['docs/components/Button.md']?.action).toBe('update');
    expect(byPath['docs/components/Button.md']?.content).toContain('`busy`');
    expect(byPath['docs/components/ProductCard.md']).toBeUndefined();
    expect(byPath['docs/api.md']).toBeUndefined(); // not kept by this project
    expect(byPath['CHANGELOG.md']?.action).toBe('skipped'); // no CHANGELOG.md: not created by a trigger
  });

  it('sync can be narrowed to the documents an adapter can derive, but never drops an explicit changelog entry', () => {
    const full = generateDocs(base({ selection: { docs: ['components', 'api'] } }));
    const existing = { ...Object.fromEntries(writableFiles(full).map((f) => [f.path, f.content])), 'CHANGELOG.md': '# Changelog\n' };
    const changed = snapshot({ 'app/api/orders/route.ts': (files['app/api/orders/route.ts'] ?? '').replace('export async function POST', 'export async function DELETE() { return new Response(null); }\nexport async function POST') });
    const result = generateDocs({ snapshot: changed, existing, date: '2026-10-19', mode: 'sync', changes: [{ path: 'app/api/orders/route.ts', kind: 'modified' }], selection: { docs: ['components'] }, changelog: [{ category: 'Added', entry: 'Delete orders.' }] });
    expect(result.files.map((f) => `${f.path}:${f.action}`)).toEqual(['CHANGELOG.md:update']);
  });

  it('sync marks the page of a deleted component as removed, without deleting it', () => {
    const full = generateDocs(base({ selection: { docs: ['components'] } }));
    const existing = Object.fromEntries(writableFiles(full).map((f) => [f.path, f.content]));
    const result = generateDocs({ snapshot: snapshot({ 'src/components/Imported.tsx': null }), existing, date: '2026-10-19', mode: 'sync', changes: [{ path: 'src/components/Imported.tsx', kind: 'deleted' }] });
    const page = result.files.find((f) => f.path === 'docs/components/Imported.md');
    expect(page?.action).toBe('update');
    expect(page?.content).toContain('**Removed:** `src/components/Imported.tsx` was deleted');
  });
});

describe('changelog', () => {
  it('adds entries under Unreleased, idempotently, without touching releases', () => {
    const existing = '# Changelog\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- First release.\n';
    const once = mergeChangelog(existing, [{ category: 'Fixed', entry: 'Cart total rounding.' }]);
    expect(once).toBe('# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Cart total rounding.\n\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- First release.\n');
    expect(mergeChangelog(once, [{ category: 'Fixed', entry: 'Cart total rounding.' }])).toBe(once);
    const twice = mergeChangelog(once, [{ category: 'Fixed', entry: 'Second fix.' }]);
    expect(twice).toContain('- Cart total rounding.\n- Second fix.\n');
  });
});

describe('approved plans and decisions', () => {
  const plan = {
    title: 'ShopFlow v1',
    markdown: ['## Product Scope', 'A storefront.', '## Requirements', '- Users can check out', '## Architecture', 'Next.js + Supabase', '## Testing', 'Vitest'].join('\n'),
  };

  it('saves an approved plan as PRD, requirements and implementation plan', () => {
    expect(parsePlanSections(plan.markdown).map((s) => s.title)).toEqual(['Product Scope', 'Requirements', 'Architecture', 'Testing']);
    const result = generateDocs(base({ plan, selection: { docs: [] } }));
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f.content ?? '']));
    expect(byPath['PRD.md']).toContain('## Product Scope\n\nA storefront.');
    expect(byPath['REQUIREMENTS.md']).toContain('- Users can check out');
    expect(byPath['IMPLEMENTATION_PLAN.md']).toContain('## Architecture');
    expect(byPath['IMPLEMENTATION_PLAN.md']).toContain('## Testing');
  });

  it('numbers a new ADR after the existing ones and never rewrites an existing ADR', () => {
    const snap = snapshot({ 'docs/adr/0001-use-supabase.md': '# 1. Use Supabase' });
    const result = generateDocs({ snapshot: snap, existing: { 'docs/adr/0001-use-supabase.md': '# 1. Use Supabase' }, date: '2026-10-19', adr: { title: 'Use Next.js app router', context: 'c', decision: 'd' } });
    const adr = result.files.find((f) => f.path === 'docs/adr/0002-use-next-js-app-router.md');
    expect(adr?.action).toBe('create');
    expect(adr?.content).toContain('- **Date:** 2026-10-19');
    expect(result.files.find((f) => f.path === 'docs/adr/README.md')?.content).toContain('0001-use-supabase');
  });
});
