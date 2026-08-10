import { describe, expect, it, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildFeatureMap } from './FeatureMapBuilder';
import { languageProviderRegistry } from './languageProviders/LanguageProviderRegistry';
import { typeScriptLanguageProvider } from './languageProviders/TypeScriptLanguageProvider';
import type { DependencyGraphRecord } from './dependencyGraph/DependencyGraphCache';

beforeAll(() => {
  languageProviderRegistry.registerProvider(typeScriptLanguageProvider);
});

function makeTempProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-feature-map-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return root;
}

function makeRecord(edges: Record<string, string[]>): DependencyGraphRecord {
  const fileHashes: Record<string, number> = {};
  for (const f of Object.keys(edges)) fileHashes[f] = 1;
  return { root: '', builtAt: Date.now(), fileHashes, edges, exports: {} };
}

describe('FeatureMapBuilder', () => {
  it('returns no features when no route candidates are found', () => {
    const root = makeTempProject({ 'src/utils/helper.ts': 'export function helper() { return 1; }' });
    const record = makeRecord({ 'src/utils/helper.ts': [] });
    const { features } = buildFeatureMap(root, record, null);
    expect(features).toEqual([]);
  });

  it('discovers a single route with no other associations at base confidence', () => {
    const root = makeTempProject({ 'app/dashboard/page.tsx': 'export default function Dashboard() { return null; }' });
    const record = makeRecord({ 'app/dashboard/page.tsx': [] });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      name: '/dashboard',
      routeFiles: ['app/dashboard/page.tsx'],
      componentFiles: [],
      confidence: 0.4,
      method: 'route-convention',
    });
  });

  it('clusters a page with a component it directly imports (step 1.5)', () => {
    const root = makeTempProject({
      'app/dashboard/page.tsx': "import { Widget } from './Widget';\nexport default function Dashboard() { return null; }",
      'app/dashboard/Widget.tsx': 'export function Widget() { return null; }',
    });
    const record = makeRecord({
      'app/dashboard/page.tsx': ['app/dashboard/Widget.tsx'],
      'app/dashboard/Widget.tsx': [],
    });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    expect(features).toHaveLength(1);
    expect(features[0]?.routeFiles).toEqual(['app/dashboard/page.tsx']);
    expect(features[0]?.componentFiles).toEqual(['app/dashboard/Widget.tsx']);
    expect(features[0]?.confidence).toBeCloseTo(0.6, 5);
    expect(features[0]?.method).toContain('import-graph');
  });

  it('never merges two routes just because they share a common Layout import (the shared-hub regression case)', () => {
    const root = makeTempProject({
      'app/dashboard/page.tsx': "import { Layout } from '../Layout';\nexport default function Dashboard() { return null; }",
      'app/settings/page.tsx': "import { Layout } from '../Layout';\nexport default function Settings() { return null; }",
      'app/Layout.tsx': 'export function Layout() { return null; }',
    });
    const record = makeRecord({
      'app/dashboard/page.tsx': ['app/Layout.tsx'],
      'app/settings/page.tsx': ['app/Layout.tsx'],
      'app/Layout.tsx': [],
    });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    expect(features).toHaveLength(2);
    const names = features.map((f) => f.name).sort();
    expect(names).toEqual(['/dashboard', '/settings']);
    // Layout.tsx is reachable from both routes, so it must be excluded from both clusters —
    // never silently attributed to either.
    for (const feature of features) {
      expect(feature.componentFiles).not.toContain('app/Layout.tsx');
      expect(feature.confidence).toBeCloseTo(0.4, 5);
    }
  });

  it('associates a fetching file with the API route it calls, even with no import edge between them (step 2)', () => {
    const root = makeTempProject({
      'app/dashboard/page.tsx': 'export default function Dashboard() { return null; }',
      'app/api/dashboard/route.ts': 'export async function GET() { return Response.json({}); }',
      'app/dashboard/Widget.tsx': "export function Widget() { fetch('/api/dashboard'); return null; }",
    });
    const record = makeRecord({
      'app/dashboard/page.tsx': [],
      'app/api/dashboard/route.ts': [],
      'app/dashboard/Widget.tsx': [],
    });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    // Two independent clusters: the page alone, and the api route + the file that fetches it.
    expect(features).toHaveLength(2);
    const apiFeature = features.find((f) => f.routeFiles.includes('app/api/dashboard/route.ts'));
    expect(apiFeature?.componentFiles).toEqual(['app/dashboard/Widget.tsx']);
    expect(apiFeature?.method).toContain('api-call-correlation');
    const pageFeature = features.find((f) => f.routeFiles.includes('app/dashboard/page.tsx'));
    expect(pageFeature?.componentFiles).toEqual([]);
  });

  it('never merges two API routes just because a fetch call ambiguously matches both a literal and a dynamic catch-all path (the API-call exclusion regression case)', () => {
    const root = makeTempProject({
      'app/api/dashboard/route.ts': 'export async function GET() { return Response.json({}); }',
      'app/api/[id]/route.ts': 'export async function GET() { return Response.json({}); }',
      'app/dashboard/Widget.tsx': "export function Widget() { fetch('/api/dashboard'); return null; }",
    });
    const record = makeRecord({
      'app/api/dashboard/route.ts': [],
      'app/api/[id]/route.ts': [],
      'app/dashboard/Widget.tsx': [],
    });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    // '/api/dashboard' literally matches its own route AND the '/api/[id]' catch-all pattern —
    // ambiguous, so Widget.tsx must not be used to fuse those two distinct routes into one feature.
    expect(features).toHaveLength(2);
    for (const feature of features) {
      expect(feature.componentFiles).not.toContain('app/dashboard/Widget.tsx');
    }
  });

  it('classifies a Mongoose schema file transitively imported from a route as a data model file', () => {
    const root = makeTempProject({
      'app/dashboard/page.tsx': "import { Widget } from './Widget';\nexport default function Dashboard() { return null; }",
      'app/dashboard/Widget.tsx': "import { User } from '../../models/User';\nexport function Widget() { return User; }",
      'models/User.ts': 'export const User = new Schema({ name: String });',
    });
    const record = makeRecord({
      'app/dashboard/page.tsx': ['app/dashboard/Widget.tsx'],
      'app/dashboard/Widget.tsx': ['models/User.ts'],
      'models/User.ts': [],
    });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    expect(features).toHaveLength(1);
    expect(features[0]?.dataModelFiles).toEqual(['models/User.ts']);
    expect(features[0]?.componentFiles).toEqual(['app/dashboard/Widget.tsx']);
  });

  it('detects a Prisma schema file but honestly leaves it unassociated with any feature (documented limitation — nothing ES-imports a .prisma file)', () => {
    const root = makeTempProject({
      'app/dashboard/page.tsx': 'export default function Dashboard() { return null; }',
      'prisma/schema.prisma': 'model User {\n  id String @id\n}\n',
    });
    const record = makeRecord({ 'app/dashboard/page.tsx': [] });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    expect(features).toHaveLength(1);
    expect(features[0]?.dataModelFiles).toEqual([]);
  });

  it('associates a same-directory, name-stem-matching test file with an existing cluster', () => {
    const root = makeTempProject({
      'app/dashboard/page.tsx': "import { Widget } from './Widget';\nexport default function Dashboard() { return null; }",
      'app/dashboard/Widget.tsx': 'export function Widget() { return null; }',
      'app/dashboard/Widget.test.tsx': "import { Widget } from './Widget';\ntest('renders', () => { Widget(); });",
    });
    const record = makeRecord({
      'app/dashboard/page.tsx': ['app/dashboard/Widget.tsx'],
      'app/dashboard/Widget.tsx': [],
      'app/dashboard/Widget.test.tsx': ['app/dashboard/Widget.tsx'],
    });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    expect(features).toHaveLength(1);
    expect(features[0]?.testFiles).toEqual(['app/dashboard/Widget.test.tsx']);
    expect(features[0]?.method).toContain('name-stem-association');
  });

  it('detects Express router method calls as route candidates without any framework hint', () => {
    const root = makeTempProject({
      'src/routes/widgets.ts': "router.get('/widgets', (req, res) => res.json([]));\nrouter.post('/widgets', (req, res) => res.status(201).send());",
    });
    const record = makeRecord({ 'src/routes/widgets.ts': [] });
    const { features } = buildFeatureMap(root, record, null);
    expect(features).toHaveLength(1);
    expect(features[0]?.name).toBe('/widgets');
  });

  it('caps confidence at 1 even when every evidence type is present', () => {
    const root = makeTempProject({
      'app/dashboard/page.tsx':
        "import { Widget } from './Widget';\nexport default function Dashboard() { return null; }",
      'app/dashboard/Widget.tsx':
        "import { User } from '../../models/User';\nimport { config } from './config';\nfetch('/api/dashboard');\nexport function Widget() { return User; }",
      'app/api/dashboard/route.ts': 'export async function GET() { return Response.json({}); }',
      'models/User.ts': 'export const User = new Schema({ name: String });',
      'app/dashboard/Widget.test.tsx': "import { Widget } from './Widget';",
      'app/dashboard/config.ts': 'export const config = {};',
    });
    const record = makeRecord({
      'app/dashboard/page.tsx': ['app/dashboard/Widget.tsx'],
      'app/dashboard/Widget.tsx': ['models/User.ts', 'app/dashboard/config.ts'],
      'app/api/dashboard/route.ts': [],
      'models/User.ts': [],
      'app/dashboard/Widget.test.tsx': ['app/dashboard/Widget.tsx'],
      'app/dashboard/config.ts': [],
    });
    const { features } = buildFeatureMap(root, record, 'Next.js');
    const dashboardFeature = features.find((f) => f.routeFiles.includes('app/dashboard/page.tsx'));
    expect(dashboardFeature?.confidence).toBeLessThanOrEqual(1);
  });
});
