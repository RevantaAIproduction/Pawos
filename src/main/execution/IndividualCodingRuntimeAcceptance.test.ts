import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalCodingRuntimeSession } from '../../shared/actions/CodingRuntimeSessionTypes';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import { subscriptionStore } from '../billing/SubscriptionStore';
import { usageQuotaConfigStore } from '../billing/UsageQuotaConfigStore';
import { usageStore } from '../billing/UsageStore';
import { usageEngine } from '../billing/UsageEngine';
import { creditStore } from '../billing/CreditStore';
import { codingModeStore } from './CodingModeStore';
import { DesktopExecutionEngine } from './DesktopExecutionEngine';
import { enforceCodingRuntimeSecurity } from './CodingRuntimeSecurity';
import { workspaceMemoryStore } from './WorkspaceMemoryStore';
import { memoryGraphStore } from '../memory/MemoryGraphStore';

const electronPaths = vi.hoisted(() => {
  const base = process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp';
  const root = `${base}\\pawos-acceptance-userdata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    root,
    downloads: `${root}\\downloads`,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'downloads' ? electronPaths.downloads : electronPaths.root),
  },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  Notification: vi.fn(),
}));

type AcceptanceAction = {
  request: ActionRequest;
  result: ActionResult;
  durationMs: number;
};

function projectFile(root: string, ...parts: string[]): string {
  return path.join(root, ...parts);
}

function read(root: string, ...parts: string[]): string {
  return fs.readFileSync(projectFile(root, ...parts), 'utf-8');
}

describe('Individual Coding Runtime real acceptance path', () => {
  let projectRoot: string;
  let session: ReturnType<typeof createLocalCodingRuntimeSession>;
  let engine: DesktopExecutionEngine;
  const actions: AcceptanceAction[] = [];

  beforeEach(() => {
    fs.mkdirSync(electronPaths.downloads, { recursive: true });
    subscriptionStore.init();
    usageQuotaConfigStore.init();
    usageStore.init();
    creditStore.init();
    codingModeStore.init();
    workspaceMemoryStore.init();
    memoryGraphStore.init();

    subscriptionStore.confirmPurchase('pro', { runtimeIds: ['coding'], orderId: 'acceptance-paid-coding' });
    codingModeStore.setMode('pro');
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-individual-coding-acceptance-'));
    session = createLocalCodingRuntimeSession({ id: `acceptance:${projectRoot}`, rootPath: projectRoot, createdAt: Date.now() });
    engine = new DesktopExecutionEngine();
    actions.length = 0;
  });

  afterEach(async () => {
    for (const action of actions) {
      const data = action.result.data as { id?: string; processId?: string } | undefined;
      const processId = data?.processId ?? data?.id;
      if (action.request.type === 'startProcess' && processId) {
        await engine.execute({ type: 'stopProcess', processId, codingRuntimeSession: session });
      }
    }
    vi.restoreAllMocks();
  });

  async function exec(request: ActionRequest): Promise<ActionResult> {
    const started = Date.now();
    const result = await engine.execute({ ...request, codingRuntimeSession: session } as ActionRequest);
    actions.push({ request, result, durationMs: Date.now() - started });
    return result;
  }

  it('creates, verifies, previews, replaces an asset, records usage, and preserves the selected workspace boundary', async () => {
    const initialUsage = usageEngine.getUnifiedUsageSummary().find((item) => item.capability === 'codeExecution')?.used ?? 0;

    expect(enforceCodingRuntimeSecurity({ type: 'listDirectory', path: projectRoot, codingRuntimeSession: session }).ok).toBe(true);
    expect(fs.readdirSync(projectRoot)).toEqual([]);

    await expect(exec({ type: 'runCommand', command: 'git init', cwd: projectRoot, confirmed: true })).resolves.toMatchObject({ ok: true });
    await expect(exec({ type: 'runCommand', command: 'git config user.email pawos-acceptance@example.test', cwd: projectRoot, confirmed: true })).resolves.toMatchObject({ ok: true });
    await expect(exec({ type: 'runCommand', command: 'git config user.name PawOS Acceptance', cwd: projectRoot, confirmed: true })).resolves.toMatchObject({ ok: true });

    const files: Array<[string[], string]> = [
      [
        ['package.json'],
        JSON.stringify(
          {
            scripts: {
              test: 'node --test tests/smoke.test.mjs',
              build: 'node scripts/build.mjs',
              start: 'node scripts/server.mjs',
              smoke: 'node scripts/check-render.mjs',
            },
          },
          null,
          2
        ),
      ],
      [
        ['src', 'index.html'],
        `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OrbitDesk</title><link rel="stylesheet" href="./styles.css"></head>
<body>
  <header class="hero"><nav><img src="../public/logo.svg" alt="OrbitDesk logo"><a href="#dashboard">Dashboard</a><a href="#login">Login</a></nav><section><p>Original SaaS dashboard</p><h1>OrbitDesk</h1><button>Start workspace</button></section></header>
  <main id="dashboard" class="dashboard"><article><h2>Revenue</h2><strong>$42k</strong></article><article><h2>Users</h2><strong>1,284</strong></article><article><h2>Tasks</h2><strong>87%</strong></article></main>
  <section id="login" class="login"><h2>Team sign in</h2><input aria-label="Email" placeholder="name@company.com"><button>Continue</button></section>
</body>
</html>
`,
      ],
      [
        ['src', 'styles.css'],
        `:root{font-family:Inter,Arial,sans-serif;color:#182026;background:#f7f9fc}.hero{min-height:58vh;background:#d8f3dc;padding:24px}.hero nav{display:flex;gap:18px;align-items:center}.hero img{width:42px;height:42px}.hero h1{font-size:56px;margin:36px 0 12px}.hero button,.login button{background:#31572c;color:white;border:0;border-radius:8px;padding:12px 16px}.dashboard{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:24px}.dashboard article,.login{background:white;border:1px solid #d7dee8;border-radius:8px;padding:18px}.login{margin:24px}.login input{display:block;margin:12px 0;padding:10px;width:min(320px,100%)}@media(max-width:640px){.hero h1{font-size:36px}.hero nav{flex-wrap:wrap}.dashboard{grid-template-columns:1fr}}`,
      ],
      [['public', 'logo.svg'], `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#31572c"/><path d="M17 38c8-18 22-18 30 0" fill="none" stroke="#d8f3dc" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="29" r="5" fill="#f7fff7"/></svg>`],
      [
        ['scripts', 'build.mjs'],
        `import fs from 'node:fs';import path from 'node:path';fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist/public',{recursive:true});fs.cpSync('src','dist',{recursive:true});fs.cpSync('public','dist/public',{recursive:true});console.log('built OrbitDesk to dist');`,
      ],
      [
        ['scripts', 'server.mjs'],
        `import http from 'node:http';import fs from 'node:fs';import path from 'node:path';const root=path.resolve('dist');const server=http.createServer((req,res)=>{const url=new URL(req.url??'/', 'http://localhost');const rel=url.pathname==='/'?'index.html':url.pathname.slice(1);const file=path.join(root,rel);if(!file.startsWith(root)){res.writeHead(403);res.end('forbidden');return;}if(!fs.existsSync(file)){res.writeHead(404);res.end('missing');return;}res.writeHead(200);fs.createReadStream(file).pipe(res);});server.listen(4177,()=>console.log('OrbitDesk preview ready on http://127.0.0.1:4177'));`,
      ],
      [
        ['scripts', 'check-render.mjs'],
        `const page=await fetch('http://127.0.0.1:4177/');if(page.status!==200)throw new Error('landing did not load');const html=await page.text();if(!html.includes('OrbitDesk'))throw new Error('brand missing');const logo=await fetch('http://127.0.0.1:4177/public/logo.svg');if(logo.status!==200)throw new Error('logo did not load');console.log('preview smoke passed');`,
      ],
      [
        ['tests', 'smoke.test.mjs'],
        `import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';test('acceptance app has branding, pages, and no empty placeholders',()=>{const html=fs.readFileSync('src/index.html','utf8');assert.match(html,/OrbitDesk/);assert.match(html,/dashboard/);assert.match(html,/Team sign in/);assert.doesNotMatch(html,/\\[(IMAGE|LOGO|VIDEO) HERE\\]/i);});`,
      ],
      [['.env.example'], 'DATABASE_URL=\n'],
    ];

    for (const [parts, content] of files) {
      await expect(exec({ type: 'writeFile', path: projectFile(projectRoot, ...parts), content, confirmed: true })).resolves.toMatchObject({ ok: true });
    }

    await expect(exec({ type: 'readEnvVars', path: projectFile(projectRoot, '.env.example') })).resolves.toMatchObject({ ok: true, data: { keys: ['DATABASE_URL'] } });
    await expect(exec({ type: 'runCommand', command: 'npm test', cwd: projectRoot, confirmed: true })).resolves.toMatchObject({ ok: true });
    await expect(exec({ type: 'buildProject', cwd: projectRoot, buildCommand: 'npm run build' })).resolves.toMatchObject({ ok: true, data: { status: 'success', outputDir: 'dist' } });

    await expect(exec({ type: 'startProcess', command: 'npm start', cwd: projectRoot, label: 'acceptance-preview' })).resolves.toMatchObject({ ok: true });
    const latestAction = actions[actions.length - 1];
    expect(latestAction).toBeDefined();
    const processId = (latestAction!.result.data as { id: string }).id;
    await expect(exec({ type: 'checkProcessHealth', processId, url: 'http://127.0.0.1:4177', timeoutMs: 8_000 })).resolves.toMatchObject({
      ok: true,
      data: { ready: true, reason: 'http-responding' },
    });
    await expect(exec({ type: 'runCommand', command: 'npm run smoke', cwd: projectRoot, confirmed: true })).resolves.toMatchObject({ ok: true });

    await expect(exec({ type: 'gitAdd', cwd: projectRoot, paths: ['.'] })).resolves.toMatchObject({ ok: true });
    await expect(exec({ type: 'gitCommit', cwd: projectRoot, message: 'Initial OrbitDesk acceptance app', confirmed: true })).resolves.toMatchObject({ ok: true });

    await expect(
      exec({
        type: 'writeFile',
        path: projectFile(projectRoot, 'public', 'logo.svg'),
        content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#184e77"/><path d="M16 46 32 12l16 34H38l-6-13-6 13z" fill="#bee9e8"/></svg>`,
        confirmed: true,
      })
    ).resolves.toMatchObject({ ok: true, data: { overwritten: true } });
    await expect(exec({ type: 'buildProject', cwd: projectRoot, buildCommand: 'npm run build' })).resolves.toMatchObject({ ok: true, data: { status: 'success', outputDir: 'dist' } });
    await expect(exec({ type: 'runCommand', command: 'npm run smoke', cwd: projectRoot, confirmed: true })).resolves.toMatchObject({ ok: true });
    const diffResult = await exec({ type: 'gitDiffStat', cwd: projectRoot });
    expect(diffResult.ok).toBe(true);
    const changedPaths = ((diffResult.data as { filesChanged: { path: string }[] }).filesChanged ?? []).map((file) => file.path);
    expect(changedPaths).toContain('public/logo.svg');

    const outside = projectFile(path.dirname(projectRoot), 'pawos-acceptance-outside.txt');
    fs.writeFileSync(outside, 'outside', 'utf-8');
    expect(enforceCodingRuntimeSecurity({ type: 'writeFile', path: outside, content: 'blocked', confirmed: true, codingRuntimeSession: session }).ok).toBe(false);
    expect(enforceCodingRuntimeSecurity({ type: 'runCommand', command: 'cd .. && npm test', cwd: projectRoot, confirmed: true, codingRuntimeSession: session }).ok).toBe(false);

    expect(fs.existsSync(projectFile(projectRoot, 'dist', 'index.html'))).toBe(true);
    expect(read(projectRoot, 'dist', 'index.html')).toContain('OrbitDesk');
    expect(read(projectRoot, 'dist', 'public', 'logo.svg')).toContain('#184e77');
    expect(fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))).toBe(false);

    const finalUsage = usageEngine.getUnifiedUsageSummary().find((item) => item.capability === 'codeExecution')?.used ?? 0;
    expect(finalUsage).toBeGreaterThan(initialUsage);
    expect(actions.some((action) => action.result.ok && action.result.data && 'usage' in (action.result.data as Record<string, unknown>))).toBe(false);
  }, 90_000);
});
