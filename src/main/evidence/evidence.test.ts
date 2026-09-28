import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const mocks = vi.hoisted(() => ({
  browser: {
    open: vi.fn(async () => ({ ok: true })),
    navigateUnrestricted: vi.fn(async () => ({ ok: true })),
    captureScreenshot: vi.fn(async () => ({ ok: true, base64Png: 'iVBORw0KGgo=' })),
    evaluate: vi.fn(async () => ({ ok: true, value: 'Checkout' })),
    getConsoleLog: vi.fn(() => [
      { level: 'error', text: 'TypeError: cart is undefined', timestamp: 1 },
      { level: 'log', text: 'ready', timestamp: 2 },
    ]),
    getNetworkLog: vi.fn(() => [
      { url: 'http://localhost:5173/api/cart', status: 500, failed: false, timestamp: 1, method: 'GET' },
      { url: 'http://localhost:5173/app.js', status: 200, failed: false, timestamp: 1 },
      { url: 'http://localhost:5173/aborted', status: null, failed: true, canceled: true, timestamp: 1 },
    ]),
    close: vi.fn(() => true),
  },
}));

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() }, desktopCapturer: { getSources: vi.fn(async () => []) } }));
vi.mock('../execution/DevBrowserManager', () => ({ devBrowserManager: mocks.browser }));
vi.mock('../execution/ProcessManager', () => ({ processManager: { getInfo: () => undefined } }));
vi.mock('../billing/EntitlementService', () => ({ entitlementService: { isFeatureAvailable: () => true } }));

import { detectAppKinds } from './detectAppKinds';
import { WebEvidenceProvider } from './providers/WebEvidenceProvider';
import { OutputEvidenceProvider } from './providers/OutputEvidenceProvider';
import { AndroidEvidenceProvider, parseAdbDevices, type AdbRunner } from './providers/AndroidEvidenceProvider';
import { IosSimulatorEvidenceProvider, parseBootedSimulators } from './providers/IosSimulatorEvidenceProvider';
import { DesktopWindowEvidenceProvider, matchSource, parseOwnedWindows, type CaptureSource } from './providers/DesktopWindowEvidenceProvider';
import { EvidenceCaptureService } from './EvidenceCaptureService';
import { CaptureEvidencePlugin } from '../execution/plugins/CaptureEvidencePlugin';
import type { EvidenceProvider } from './EvidenceProvider';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-evidence-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function project(name: string, files: Record<string, string>): string {
  const dir = path.join(tmp, name);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}
const pkg = (deps: Record<string, string>) => JSON.stringify({ dependencies: deps });

describe('App kind detection (which capture provider applies)', () => {
  it.each([
    ['next web app', { 'package.json': pkg({ next: '15', react: '19', 'react-dom': '19' }) }, ['web']],
    ['electron desktop app', { 'package.json': pkg({ electron: '37', react: '18', 'react-dom': '18' }) }, ['desktop', 'web']],
    ['react native app', { 'package.json': pkg({ 'react-native': '0.76' }), 'android/build.gradle': '', 'ios/Podfile': '' }, ['android', 'ios']],
    ['flutter app', { 'pubspec.yaml': 'name: app' }, ['android', 'ios']],
    ['native android app', { 'app/src/main/AndroidManifest.xml': '<manifest/>', 'build.gradle': '' }, ['android']],
    ['express api', { 'package.json': pkg({ express: '4' }) }, ['backend']],
    ['fastapi service', { 'requirements.txt': 'fastapi==0.110\nuvicorn' }, ['backend']],
    ['wpf desktop app', { 'App.csproj': '<Project/>', 'Views/MainWindow.xaml': '<Window/>' }, ['desktop']],
  ])('%s', (name, files, expected) => {
    expect(detectAppKinds(project(name.replace(/\s/g, '-'), files)).sort()).toEqual([...expected].sort());
  });
});

describe('Web evidence — PawOS hidden browser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('local page: hidden session, screenshot plus the real console errors and failed requests; session closed', async () => {
    const result = await new WebEvidenceProvider(0).capture({ phase: 'before', label: 'x', target: { provider: 'web', url: 'http://localhost:5173/checkout' } });
    expect(mocks.browser.open).toHaveBeenCalledWith(expect.any(String), 'http://localhost:5173/checkout', [], { hidden: true });
    expect(result).toMatchObject({
      ok: true,
      targetDescription: 'http://localhost:5173/checkout',
      pageSignals: { title: 'Checkout', consoleErrors: ['TypeError: cart is undefined'], failedRequests: ['GET http://localhost:5173/api/cart → 500'] },
    });
    expect(mocks.browser.close).toHaveBeenCalledTimes(1);
  });

  it('deployed page opens hidden too (never a visible window)', async () => {
    await new WebEvidenceProvider(0).capture({ phase: 'before', label: 'x', target: { provider: 'web', url: 'https://shop.example.com/cart' } });
    expect(mocks.browser.navigateUnrestricted).toHaveBeenCalledWith(expect.any(String), 'https://shop.example.com/cart', { hidden: true });
  });
});

describe('Output evidence — commands and local APIs (text, never a screenshot)', () => {
  const dir = project('cli', { 'fail.js': "console.error('Error: total is NaN'); process.exit(1);", 'pass.js': "console.log('3 passed');" });

  it('captures the real failing output and exit code, then the passing one', async () => {
    const provider = new OutputEvidenceProvider();
    const before = await provider.capture({ phase: 'before', label: 'x', target: { provider: 'output', command: 'node fail.js', cwd: dir } });
    expect(before).toMatchObject({ ok: true, output: { source: 'node fail.js', status: 1 } });
    expect(before.ok && before.output!.text).toContain('Error: total is NaN');
    const after = await provider.capture({ phase: 'after', label: 'x', target: { provider: 'output', command: 'node pass.js', cwd: dir } });
    expect(after).toMatchObject({ ok: true, output: { status: 0, text: '3 passed' } });
  }, 30000);

  it('same command rules as runCommand: no unknown programs, no chaining', async () => {
    const provider = new OutputEvidenceProvider();
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'output', command: 'rm -rf /', cwd: dir } })).toMatchObject({ ok: false, unavailable: false });
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'output', command: 'node pass.js && node fail.js', cwd: dir } })).toMatchObject({ ok: false });
  });

  it('local API response with its HTTP status; non-local APIs refused', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"db timeout"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const provider = new OutputEvidenceProvider();
    const result = await provider.capture({ phase: 'before', label: 'x', target: { provider: 'output', httpUrl: `http://127.0.0.1:${port}/api/orders` } });
    server.close();
    expect(result).toMatchObject({ ok: true, output: { source: `GET http://127.0.0.1:${port}/api/orders`, status: 500, text: '{"error":"db timeout"}' } });
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'output', httpUrl: 'https://api.example.com/x' } })).toMatchObject({ ok: false });
  });
});

describe('Android evidence — adb', () => {
  it('parses only ready devices', () => {
    expect(parseAdbDevices('List of devices attached\nemulator-5554\tdevice\nR58M\tunauthorized\nZX1\toffline\n\n')).toEqual(['emulator-5554']);
  });

  it('no adb installed → unavailable (not a failure)', async () => {
    const provider = new AndroidEvidenceProvider(async () => null);
    expect(await provider.availability()).toMatchObject({ available: false, detail: expect.stringContaining('adb') });
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'android' } })).toMatchObject({ ok: false, unavailable: true });
  });

  it('adb but no device → unavailable; one device → its screen; several → must choose', async () => {
    let devices = 'List of devices attached\n';
    const adb: AdbRunner = async (args) =>
      args[0] === 'devices' ? { ok: true, stdout: Buffer.from(devices), stderr: '' } : { ok: true, stdout: PNG, stderr: '' };
    const provider = new AndroidEvidenceProvider(async () => adb);
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'android' } })).toMatchObject({ ok: false, unavailable: true });
    devices += 'emulator-5554\tdevice\n';
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'android' } })).toMatchObject({ ok: true, targetDescription: 'Android emulator-5554', image: PNG });
    devices += 'R58M\tdevice\n';
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'android' } })).toMatchObject({ ok: false, unavailable: false });
  });
});

describe('iOS Simulator evidence — xcrun simctl (macOS only)', () => {
  it('on Windows: "implemented but environment unavailable/unverified", never a ticket failure', async () => {
    const provider = new IosSimulatorEvidenceProvider('win32');
    expect(await provider.availability()).toMatchObject({ available: false, verified: false, detail: expect.stringContaining('Implemented but environment unavailable/unverified') });
    expect(await provider.capture({ phase: 'before', label: 'x', target: { provider: 'iosSimulator' } })).toMatchObject({ ok: false, unavailable: true });
  });

  it('on macOS (simulated): finds the booted simulator and saves its screenshot', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[1] === 'list') return { ok: true, stdout: JSON.stringify({ devices: { 'iOS-18': [{ udid: 'U1', name: 'iPhone 16', state: 'Booted' }, { udid: 'U2', name: 'iPad', state: 'Shutdown' }] } }), stderr: '' };
      fs.writeFileSync(args[4]!, PNG);
      return { ok: true, stdout: '', stderr: '' };
    });
    const result = await new IosSimulatorEvidenceProvider('darwin', run).capture({ phase: 'after', label: 'x', target: { provider: 'iosSimulator' } });
    expect(result).toMatchObject({ ok: true, targetDescription: 'iOS Simulator iPhone 16', image: PNG });
    expect(parseBootedSimulators('not json')).toEqual([]);
  });
});

describe('Desktop window evidence — only the target app\'s own window', () => {
  const source = (id: string): CaptureSource => ({ id, name: 'x', thumbnail: { isEmpty: () => false, toPNG: () => PNG } });

  it('parses the process tree\'s windows and matches the capture source by handle', () => {
    expect(parseOwnedWindows('4120\t395890\tInvoice App\r\n77\t0\tghost\r\nbad line\r\n')).toEqual([{ pid: 4120, handle: '395890', title: 'Invoice App' }]);
    expect(matchSource([source('window:111:0'), source('window:395890:0')], '395890')?.id).toBe('window:395890:0');
    expect(matchSource([source('window:3958901:0')], '395890')).toBeUndefined(); // no prefix confusion
  });

  it('captures the launched app\'s window — found through its process, not the active window', async () => {
    const listOwned = vi.fn(async () => [{ pid: 4120, handle: '395890', title: 'Invoice App' }]);
    const provider = new DesktopWindowEvidenceProvider('win32', listOwned, async () => [source('window:111:0'), source('window:395890:0')], () => 4100);
    const result = await provider.capture({ phase: 'before', label: 'x', target: { provider: 'desktopWindow', processId: 'proc-1' } });
    expect(listOwned).toHaveBeenCalledWith(4100);
    expect(result).toMatchObject({ ok: true, targetDescription: 'Invoice App (pid 4120)', image: PNG });
  });

  it('never falls back to another window', async () => {
    const provider = (windows: { pid: number; handle: string; title: string }[], sources: CaptureSource[]) =>
      new DesktopWindowEvidenceProvider('win32', async () => windows, async () => sources, () => 4100);
    const req = { phase: 'before' as const, label: 'x', target: { provider: 'desktopWindow' as const, processId: 'p' } };
    expect(await provider([], [source('window:111:0')]).capture(req)).toMatchObject({ ok: false, unavailable: true }); // no window yet
    expect(await provider([{ pid: 1, handle: '5', title: 'App' }], [source('window:111:0')]).capture(req)).toMatchObject({ ok: false, unavailable: true }); // not capturable
    expect(await provider([{ pid: 1, handle: '5', title: 'Main' }, { pid: 2, handle: '6', title: 'Settings' }], []).capture(req)).toMatchObject({ ok: false, unavailable: false }); // must pick
    const titled = await provider([{ pid: 1, handle: '5', title: 'Main' }, { pid: 2, handle: '6', title: 'Settings' }], [source('window:6:0')]).capture({ ...req, target: { ...req.target, windowTitle: 'settings' } });
    expect(titled).toMatchObject({ ok: true });
  });

  it('unknown process, or not Windows → reported, not guessed', async () => {
    expect(await new DesktopWindowEvidenceProvider('win32', async () => [], async () => [], () => null).capture({ phase: 'before', label: 'x', target: { provider: 'desktopWindow', processId: 'nope' } })).toMatchObject({ ok: false, unavailable: false });
    expect(await new DesktopWindowEvidenceProvider('linux').availability()).toMatchObject({ available: false });
  });
});

describe('EvidenceCaptureService + plugin', () => {
  const root = path.join(tmp, 'store');
  const fakeImage: EvidenceProvider = { id: 'web', availability: async () => ({ provider: 'web', available: true, verified: true, detail: '' }), capture: async () => ({ ok: true, targetDescription: 'http://localhost:3000', image: PNG }) };
  const fakeAndroid: EvidenceProvider = { id: 'android', availability: async () => ({ provider: 'android', available: false, verified: false, detail: 'no adb' }), capture: async () => ({ ok: false, unavailable: true, message: 'adb is not installed.' }) };
  const service = new EvidenceCaptureService([fakeImage, new OutputEvidenceProvider(), fakeAndroid], () => root);

  it('saves an image capture (PNG + description JSON) and returns it for the chat', async () => {
    const outcome = await service.capture({ phase: 'before', label: 'Cart overflows', target: { provider: 'web', url: 'http://localhost:3000' }, runId: 'run-7' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { evidence, imageBase64 } = outcome.data;
    expect(evidence).toMatchObject({ phase: 'before', label: 'Cart overflows', provider: 'web', kind: 'image', runId: 'run-7' });
    expect(fs.readFileSync(evidence.filePath)).toEqual(PNG);
    expect(JSON.parse(fs.readFileSync(evidence.filePath.replace(/-before\.png$/, '.json'), 'utf8')).id).toBe(evidence.id);
    expect(imageBase64).toBe(PNG.toString('base64'));
  });

  it('saves output evidence as labelled text', async () => {
    const dir = project('svc-cli', { 'fail.js': "console.error('boom'); process.exit(2);" });
    const outcome = await service.capture({ phase: 'before', label: 'Job crashes', target: { provider: 'output', command: 'node fail.js', cwd: dir } });
    expect(outcome.ok && outcome.data.evidence.kind).toBe('output');
    if (!outcome.ok) return;
    expect(fs.readFileSync(outcome.data.evidence.filePath, 'utf8')).toMatch(/PawOS output evidence — before[\s\S]*Status: 2[\s\S]*boom/);
    expect(outcome.data.imageBase64).toBeUndefined();
  }, 30000);

  it('plugin: an unavailable environment is ok + unavailable (the ticket carries on); output needs a coding plan', async () => {
    const plugin = new CaptureEvidencePlugin(service, () => false);
    const result = await plugin.execute({ type: 'captureEvidence', phase: 'before', label: 'x', target: { provider: 'android' } });
    expect(result).toMatchObject({ ok: true, data: { unavailable: true, message: expect.stringContaining('continue the ticket without it') } });
    expect(plugin.requirements({ type: 'captureEvidence', phase: 'before', label: 'x', target: { provider: 'output', command: 'npm test', cwd: tmp } })).toHaveLength(1);
    expect(plugin.requirements({ type: 'captureEvidence', phase: 'before', label: 'x', target: { provider: 'web', url: 'http://localhost:3000' } })).toHaveLength(0);
    const check = await plugin.execute({ type: 'checkEvidenceCapture', projectFolder: project('chk', { 'package.json': pkg({ express: '4' }) }) });
    expect(check).toMatchObject({ ok: true, data: { appKinds: ['backend'], suggestedProviders: ['output'] } });
  });
});
