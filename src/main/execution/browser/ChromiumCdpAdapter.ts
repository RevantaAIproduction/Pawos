import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { app } from 'electron';
import WebSocket from 'ws';
import {
  BaseBrowserAdapter,
  type AdapterResult,
  type BrowserCapability,
  type BrowserConsoleEntry,
  type BrowserDownloadState,
  type BrowserField,
  type BrowserId,
  type BrowserNetworkEntry,
} from './BrowserAdapter';
import { resolveBrowserExecutable, resolveRealProfileDir, findExistingDebugPort, isBrowserRunning } from './browserDetect';
import { browserCapabilityStatus } from './browserCapabilityStatus';

function recordRealProfileReuseObservation(browser: BrowserId, status: 'working' | 'blocked', reason?: string): void {
  browserCapabilityStatus.record(browser, status, reason);
}

const CDP_CAPABILITIES: BrowserCapability[] = [
  'launch',
  'navigate',
  'read',
  'click',
  'fill',
  'upload',
  'download',
  'extract',
  'screenshot',
  'print',
  'cookies',
  'consoleLog',
  'networkLog',
];

type CdpTab = {
  targetId: string;
  ws: WebSocket;
  /** Which browser process (isolated automation profile, or the port opened for this tab) serves this tab — needed for closeTab's HTTP call, since a real-profile tab and an isolated tab can be served by two different processes on two different ports. */
  port: number;
  nextMsgId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  consoleLog: BrowserConsoleEntry[];
  networkLog: BrowserNetworkEntry[];
  expectedDownloadPath?: string;
  activeDownload?: BrowserDownloadState;
  lastKnownUrl: string | null;
};

const MAX_LOG_ENTRIES = 500;

/**
 * Distinguishes WHY a real-profile launch failed — reuseSession()'s catch
 * block reads `.code` to set a typed AdapterResult.reason so callers (the
 * Browser Capabilities panel, describeDone()) can render a clean status
 * instead of pattern-matching the human message string.
 */
class BrowserLaunchError extends Error {
  constructor(message: string, readonly code: 'already-running' | 'cdp-unavailable') {
    super(message);
  }
}

/**
 * Shared CDP-over-WebSocket automation for any real Chromium-family
 * browser (Chrome, Edge, Brave all speak the identical protocol) — one
 * implementation, three thin adapter instances differing only in which
 * real executable gets launched. Uses a fresh, isolated `--user-data-dir`
 * per Paw session rather than the user's real default profile: no saved
 * passwords/autofill exist to leak, matching the "never enter credentials"
 * boundary, at the cost of not seeing the user's real history/bookmarks
 * (left honestly not-implemented rather than reading their main profile).
 */
export class ChromiumCdpAdapter extends BaseBrowserAdapter {
  readonly capabilities = new Set(CDP_CAPABILITIES);

  // Two independent browser processes can exist at once: the default
  // isolated automation profile (always used unless the user explicitly
  // asked to reuse their real session), and — only when
  // ensureRealProfileBrowserRunning() is called — a second process pointed
  // at the user's REAL default profile directory. Kept as two entirely
  // separate process/port pairs so ordinary automation never accidentally
  // touches real saved passwords/autofill/logins.
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private launching: Promise<number> | null = null;
  private readonly isolatedUserDataDir: string;

  private realProcess: ChildProcess | null = null;
  private realPort: number | null = null;
  private realLaunching: Promise<number> | null = null;

  private tabs = new Map<string, CdpTab>();

  constructor(
    readonly id: BrowserId,
    readonly displayName: string,
    private readonly executableName: 'chrome' | 'edge' | 'brave'
  ) {
    super();
    this.isolatedUserDataDir = path.join(os.tmpdir(), `paw-browser-${this.executableName}`);
  }

  async detect(): Promise<boolean> {
    return Boolean(await resolveBrowserExecutable(this.executableName));
  }

  /**
   * Spawns a browser process against a given user-data-dir and waits until
   * its CDP port responds — the one implementation shared by the isolated
   * automation profile and the real-profile "reuse my session" flow.
   * `timeoutMs` differs between the two callers: a fresh isolated profile
   * is fast (no real data to load). A real user profile was expected to
   * just be slower — but live verification against a real, heavily-
   * extended Chrome profile showed its CDP port never opened at all,
   * consistently, across every attempt up to 120s (confirmed by watching
   * for the `DevToolsActivePort` file Chromium writes the instant its
   * debug port is live — it never appeared). That means "wait longer"
   * is the wrong fix here: a real profile with security-focused
   * extensions, enterprise hardening, or similar can outright block
   * remote debugging, not just delay it. `isRealProfile` drives the
   * timeout error message so a genuine block isn't reported as "just
   * slow, try again."
   */
  private async spawnAndWaitForPort(userDataDir: string, timeoutMs: number, isRealProfile: boolean): Promise<number> {
    const exe = await resolveBrowserExecutable(this.executableName);
    if (!exe) throw new Error(`${this.displayName} isn't installed on this machine.`);

    const port = 9400 + Math.floor(Math.random() * 500);
    fs.mkdirSync(userDataDir, { recursive: true });

    const proc = spawn(
      exe,
      [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
      { detached: false, stdio: 'ignore' }
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) {
        throw new BrowserLaunchError(
          `${this.displayName} exited immediately — if it's already open with this profile, close it first (a running browser locks its own profile directory, so a second automated instance can't attach to it).`,
          'already-running'
        );
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          this.trackProcess(proc, port, userDataDir === this.isolatedUserDataDir);
          return port;
        }
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    proc.kill();
    if (isRealProfile) {
      throw new BrowserLaunchError(
        `${this.displayName} opened, but its remote-debugging port never responded — this usually isn't just slowness; it can mean a security extension or enterprise policy on your real profile is blocking remote debugging outright. Your real choices: (1) use an isolated automation profile instead (safe, but won't have your real logins), or (2) check ${this.executableName}://policy / your installed extensions for anything blocking DevTools, then try again.`,
        'cdp-unavailable'
      );
    }
    throw new Error(`${this.displayName} didn't respond on its debugging port in time — if it's already open with this profile, close it first and try again.`);
  }

  private trackProcess(proc: ChildProcess, port: number, isolated: boolean): void {
    if (isolated) {
      this.process = proc;
      this.port = port;
      proc.on('exit', () => {
        this.process = null;
        this.port = null;
        for (const [sessionId, tab] of this.tabs) if (tab.port === port) this.tabs.delete(sessionId);
      });
    } else {
      this.realProcess = proc;
      this.realPort = port;
      proc.on('exit', () => {
        this.realProcess = null;
        this.realPort = null;
        for (const [sessionId, tab] of this.tabs) if (tab.port === port) this.tabs.delete(sessionId);
      });
    }
  }

  private async ensureBrowserRunning(): Promise<number> {
    if (this.process && !this.process.killed && this.port) return this.port;
    if (this.launching) return this.launching;
    this.launching = this.spawnAndWaitForPort(this.isolatedUserDataDir, 20_000, false);
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  private async ensureRealProfileBrowserRunning(): Promise<number> {
    if (this.realProcess && !this.realProcess.killed && this.realPort) return this.realPort;
    if (this.realLaunching) return this.realLaunching;
    // 60s: generous enough to cover a genuinely slow cold start, but live
    // verification (watching for Chromium's DevToolsActivePort file, which
    // appears the instant the debug port is truly live) showed a real,
    // heavily-extended profile's CDP port never opens at all — not once,
    // across attempts up to 120s. Waiting longer doesn't help that case;
    // it only delays the honest explanation the user actually needs.
    this.realLaunching = this.spawnAndWaitForPort(resolveRealProfileDir(this.executableName), 60_000, true);
    try {
      return await this.realLaunching;
    } finally {
      this.realLaunching = null;
    }
  }

  private async openNewTarget(port: number, url: string): Promise<{ targetId: string; webSocketDebuggerUrl: string }> {
    const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const json = (await res.json()) as { id: string; webSocketDebuggerUrl: string };
    return { targetId: json.id, webSocketDebuggerUrl: json.webSocketDebuggerUrl };
  }

  private send<T = unknown>(tab: CdpTab, method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = tab.nextMsgId++;
      tab.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      tab.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (tab.pending.has(id)) {
          tab.pending.delete(id);
          reject(new Error(`CDP command "${method}" timed out.`));
        }
      }, 20_000);
    });
  }

  private attachListeners(tab: CdpTab): void {
    tab.ws.on('message', (raw) => {
      let msg: { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (typeof msg.id === 'number') {
        const pending = tab.pending.get(msg.id);
        if (!pending) return;
        tab.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
        return;
      }

      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = (msg.params?.args as { value?: unknown; description?: string }[]) ?? [];
        const text = args.map((a) => String(a.value ?? a.description ?? '')).join(' ');
        tab.consoleLog.push({ level: String(msg.params?.type ?? 'log'), text, timestamp: Date.now() });
        if (tab.consoleLog.length > MAX_LOG_ENTRIES) tab.consoleLog.shift();
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const details = msg.params?.exceptionDetails as { exception?: { description?: string }; text?: string } | undefined;
        tab.consoleLog.push({ level: 'error', text: details?.exception?.description ?? details?.text ?? 'Uncaught exception', timestamp: Date.now() });
        if (tab.consoleLog.length > MAX_LOG_ENTRIES) tab.consoleLog.shift();
      } else if (msg.method === 'Network.responseReceived') {
        const response = msg.params?.response as { status?: number; url?: string } | undefined;
        const status = response?.status ?? 0;
        tab.networkLog.push({ url: response?.url ?? '', status, failed: status >= 400, timestamp: Date.now() });
        if (tab.networkLog.length > MAX_LOG_ENTRIES) tab.networkLog.shift();
      } else if (msg.method === 'Network.loadingFailed') {
        tab.networkLog.push({ url: String(msg.params?.url ?? ''), status: null, failed: true, timestamp: Date.now() });
        if (tab.networkLog.length > MAX_LOG_ENTRIES) tab.networkLog.shift();
      } else if (msg.method === 'Page.frameNavigated') {
        const frame = msg.params?.frame as { url?: string; parentId?: string } | undefined;
        if (frame && !frame.parentId) tab.lastKnownUrl = frame.url ?? tab.lastKnownUrl;
      } else if (msg.method === 'Page.downloadWillBegin') {
        const p = msg.params as { suggestedFilename?: string } | undefined;
        const target = tab.expectedDownloadPath ?? path.join(app.getPath('downloads'), p?.suggestedFilename ?? 'download');
        tab.activeDownload = { state: 'progressing', savePath: target, receivedBytes: 0, totalBytes: 0 };
      } else if (msg.method === 'Page.downloadProgress') {
        const p = msg.params as { state?: string; receivedBytes?: number; totalBytes?: number } | undefined;
        if (tab.activeDownload) {
          tab.activeDownload.receivedBytes = p?.receivedBytes ?? 0;
          tab.activeDownload.totalBytes = p?.totalBytes ?? 0;
          tab.activeDownload.state = p?.state === 'completed' ? 'completed' : p?.state === 'canceled' ? 'cancelled' : 'progressing';
        }
      }
    });
  }

  private async createTab(sessionId: string, url: string, port: number): Promise<AdapterResult> {
    try {
      const { targetId, webSocketDebuggerUrl } = await this.openNewTarget(port, url);
      const ws = new WebSocket(webSocketDebuggerUrl);
      const tab: CdpTab = { targetId, ws, port, nextMsgId: 1, pending: new Map(), consoleLog: [], networkLog: [], lastKnownUrl: url };

      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', (e) => reject(e));
      });
      this.attachListeners(tab);
      this.tabs.set(sessionId, tab);

      await this.send(tab, 'Runtime.enable');
      await this.send(tab, 'Network.enable');
      await this.send(tab, 'Page.enable');
      await this.send(tab, 'Page.setDownloadBehavior', { behavior: 'allow', downloadPath: app.getPath('downloads') });

      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async launch(sessionId: string, url: string): Promise<AdapterResult> {
    if (this.tabs.has(sessionId)) return this.navigate(sessionId, url);
    try {
      const port = await this.ensureBrowserRunning();
      return this.createTab(sessionId, url, port);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  /**
   * The explicitly-gated "reuse my existing session" flow — three real
   * outcomes, tried in order, never silently collapsed into one:
   *
   * 1. ATTACH: if this browser is already running with remote debugging
   *    enabled (a prior Paw session, or a user who turned it on), open a
   *    new tab on that live port directly — genuine reuse of the exact
   *    running instance, nothing relaunched.
   * 2. EXPLAIN: if it's running WITHOUT remote debugging, there is no way
   *    to enable CDP on an already-running process — explained honestly,
   *    with real choices, never silently downgraded to something else.
   * 3. LAUNCH: if it isn't running at all, launch it fresh pointed at the
   *    user's REAL profile directory — nothing was locking it, so this
   *    genuinely gives Paw their real logins without ever touching a
   *    password or cookie value directly.
   */
  async reuseSession(sessionId: string, url: string): Promise<AdapterResult> {
    if (this.tabs.has(sessionId)) return this.navigate(sessionId, url);

    const existingPort = await findExistingDebugPort(this.executableName);
    if (existingPort) {
      return this.createTab(sessionId, url, existingPort);
    }

    const running = await isBrowserRunning(this.executableName);
    if (running) {
      return {
        ok: false,
        reason: 'running-no-debug-port',
        message:
          `${this.displayName} is already running, but not with remote debugging enabled, so I can't attach to your existing session — ` +
          `there's genuinely no way to turn that on for a browser that's already open. Your real choices: ` +
          `(1) use an isolated automation profile instead (safe, but won't have your real logins), ` +
          `(2) close ${this.displayName} yourself and ask me to try again — I'll then be able to open it with your real profile, or ` +
          `(3) use Paw's own browser instead.`,
      };
    }

    try {
      const port = await this.ensureRealProfileBrowserRunning();
      const result = await this.createTab(sessionId, url, port);
      if (result.ok) recordRealProfileReuseObservation(this.id, 'working');
      return result;
    } catch (error) {
      const code = error instanceof BrowserLaunchError ? error.code : undefined;
      if (code === 'cdp-unavailable') recordRealProfileReuseObservation(this.id, 'blocked', (error as Error).message);
      return { ok: false, message: (error as Error).message, reason: code };
    }
  }

  async navigate(sessionId: string, url: string): Promise<AdapterResult> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return this.launch(sessionId, url);
    try {
      await this.send(tab, 'Page.navigate', { url });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async closeTab(sessionId: string): Promise<AdapterResult> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return { ok: false, message: 'No open session with that id.' };
    try {
      await fetch(`http://127.0.0.1:${tab.port}/json/close/${tab.targetId}`);
      tab.ws.terminate();
      this.tabs.delete(sessionId);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  isOpen(sessionId: string): boolean {
    return this.tabs.has(sessionId);
  }

  listSessions(): string[] {
    return [...this.tabs.keys()];
  }

  getCurrentUrl(sessionId: string): string | null {
    return this.tabs.get(sessionId)?.lastKnownUrl ?? null;
  }

  private async evalExpr<T = unknown>(sessionId: string, expression: string): Promise<AdapterResult<T>> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return { ok: false, message: 'No open browser session with that id.' };
    try {
      const result = await this.send<{ result?: { value?: T }; exceptionDetails?: { text?: string } }>(tab, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) return { ok: false, message: result.exceptionDetails.text ?? 'Script error.' };
      return { ok: true, data: result.result?.value as T };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async evaluate(sessionId: string, expression: string): Promise<AdapterResult<unknown>> {
    return this.evalExpr(sessionId, expression);
  }

  async read(sessionId: string, maxChars = 20_000): Promise<AdapterResult<{ content: string; truncated: boolean }>> {
    const result = await this.evalExpr<string>(sessionId, 'document.body.innerText');
    if (!result.ok) return result;
    const text = result.data ?? '';
    const truncated = text.length > maxChars;
    return { ok: true, data: { content: truncated ? text.slice(0, maxChars) : text, truncated } };
  }

  async click(sessionId: string, selector: string): Promise<AdapterResult<{ navigated: boolean }>> {
    const before = await this.evalExpr<string>(sessionId, 'location.href');
    const script = `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return 'missing';
        el.click();
        return 'ok';
      })()
    `;
    const clicked = await this.evalExpr<string>(sessionId, script);
    if (!clicked.ok) return clicked;
    if (clicked.data === 'missing') return { ok: false, message: `Could not find an element matching "${selector}".` };
    await new Promise((r) => setTimeout(r, 300));
    const after = await this.evalExpr<string>(sessionId, 'location.href');
    return { ok: true, data: { navigated: before.ok && after.ok && before.data !== after.data } };
  }

  async fill(sessionId: string, fields: BrowserField[], submitSelector?: string): Promise<AdapterResult> {
    const script = `
      (function() {
        const fields = ${JSON.stringify(fields)};
        for (const { selector, value } of fields) {
          const el = document.querySelector(selector);
          if (!el) return 'missing:' + selector;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
            ?? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (setter) setter.call(el, value); else el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const submitSelector = ${JSON.stringify(submitSelector ?? null)};
        if (submitSelector) {
          const submitEl = document.querySelector(submitSelector);
          if (!submitEl) return 'missing-submit:' + submitSelector;
          submitEl.click();
        }
        return 'ok';
      })()
    `;
    const result = await this.evalExpr<string>(sessionId, script);
    if (!result.ok) return result;
    if (result.data !== 'ok') return { ok: false, message: `Could not find element matching "${String(result.data).split(':')[1]}".` };
    return { ok: true };
  }

  async upload(sessionId: string, selector: string, filePath: string): Promise<AdapterResult> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return { ok: false, message: 'No open browser session with that id.' };
    try {
      const { root } = await this.send<{ root: { nodeId: number } }>(tab, 'DOM.getDocument');
      const { nodeId } = await this.send<{ nodeId: number }>(tab, 'DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) return { ok: false, message: `Could not find an element matching "${selector}".` };
      await this.send(tab, 'DOM.setFileInputFiles', { files: [filePath], nodeId });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async extract(sessionId: string, selectors?: string[]): Promise<AdapterResult<unknown>> {
    const script = selectors?.length
      ? `
        (function() {
          const selectors = ${JSON.stringify(selectors)};
          const out = {};
          for (const sel of selectors) {
            out[sel] = Array.from(document.querySelectorAll(sel)).map(el => el.textContent.trim());
          }
          return out;
        })()
      `
      : `
        (function() {
          return {
            links: Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({ text: a.textContent.trim(), href: a.href })),
            headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 50).map(h => h.textContent.trim()),
          };
        })()
      `;
    return this.evalExpr(sessionId, script);
  }

  async scroll(sessionId: string, opts: { selector?: string; direction?: 'up' | 'down'; amount?: number }): Promise<AdapterResult> {
    const script = opts.selector
      ? `document.querySelector(${JSON.stringify(opts.selector)})?.scrollIntoView({behavior:'smooth'}); 'ok'`
      : `window.scrollBy(0, ${(opts.direction === 'up' ? -1 : 1) * (opts.amount ?? 600)}); 'ok'`;
    const result = await this.evalExpr<string>(sessionId, script);
    return result.ok ? { ok: true } : result;
  }

  prepareDownload(sessionId: string, savePath: string): void {
    const tab = this.tabs.get(sessionId);
    if (tab) {
      tab.expectedDownloadPath = savePath;
      tab.activeDownload = undefined;
    }
  }

  async triggerDownload(sessionId: string, url: string): Promise<AdapterResult> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return { ok: false, message: 'No open browser session with that id.' };
    try {
      await this.send(tab, 'Page.navigate', { url });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  getDownloadState(sessionId: string): BrowserDownloadState | undefined {
    return this.tabs.get(sessionId)?.activeDownload;
  }

  async screenshot(sessionId: string): Promise<AdapterResult<{ base64Png: string }>> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return { ok: false, message: 'No open browser session with that id.' };
    try {
      const result = await this.send<{ data: string }>(tab, 'Page.captureScreenshot', { format: 'png' });
      return { ok: true, data: { base64Png: result.data } };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async print(sessionId: string, savePath: string): Promise<AdapterResult> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return { ok: false, message: 'No open browser session with that id.' };
    try {
      const result = await this.send<{ data: string }>(tab, 'Page.printToPDF', {});
      await fs.promises.mkdir(path.dirname(savePath), { recursive: true });
      await fs.promises.writeFile(savePath, Buffer.from(result.data, 'base64'));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async cookies(sessionId: string): Promise<AdapterResult<{ name: string; domain: string; value: string }[]>> {
    const tab = this.tabs.get(sessionId);
    if (!tab) return { ok: false, message: 'No open browser session with that id.' };
    try {
      const result = await this.send<{ cookies: { name: string; domain: string; value: string }[] }>(tab, 'Network.getCookies');
      return { ok: true, data: result.cookies };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  getConsoleLog(sessionId: string, maxEntries = 100): BrowserConsoleEntry[] | null {
    const tab = this.tabs.get(sessionId);
    return tab ? tab.consoleLog.slice(-maxEntries) : null;
  }

  getNetworkErrors(sessionId: string): BrowserNetworkEntry[] | null {
    const tab = this.tabs.get(sessionId);
    return tab ? tab.networkLog.filter((e) => e.failed) : null;
  }
}
