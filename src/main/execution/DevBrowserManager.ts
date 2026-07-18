import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { DevBrowserConsoleEntry, DevBrowserNetworkEntry } from '../../shared/actions/DevBrowserTypes';

const MAX_LOG_ENTRIES = 500;

export type DevBrowserDownloadState = {
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
};

type DevBrowserSession = {
  window: BrowserWindow;
  consoleLog: DevBrowserConsoleEntry[];
  networkLog: DevBrowserNetworkEntry[];
  /** Set once the user has approved general (non-localhost) browsing for this session — asked once, not on every navigation within it. */
  approvedGeneralBrowsing: boolean;
  /** The path the next triggered download should be saved to, consumed by the will-download handler so no native save dialog ever appears. */
  expectedDownloadPath?: string;
  activeDownload?: DevBrowserDownloadState;
};

/**
 * Extra allowed origins beyond localhost/127.0.0.1/0.0.0.0 — populated per
 * call when a workspace's own deployment URL has been recorded, never
 * arbitrary third-party sites. Exported so downloadProjectFile (which
 * doesn't navigate the browser, just fetches a URL) enforces the exact same
 * boundary rather than duplicating a second, possibly-drifting check.
 */
export function isAllowedUrl(url: string, allowedDeploymentOrigins: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname)) return true;
  return allowedDeploymentOrigins.some((allowed) => {
    try {
      return new URL(allowed).origin === parsed.origin;
    } catch {
      return false;
    }
  });
}

/**
 * A real browser window Paw drives for development purposes ONLY — not
 * general web browsing. Every navigation is checked against isAllowedUrl
 * before it happens, enforced here (not just by convention), so this can
 * never quietly become "open any website." Uses Electron's own
 * webContents.debugger (a real CDP session) for console/network capture —
 * no Puppeteer/Playwright dependency, since Electron already is Chromium.
 */
class DevBrowserManager {
  private sessions = new Map<string, DevBrowserSession>();
  /** Every managed BrowserWindow shares Electron's default session unless a partition is specified — this app never specifies one, so the will-download listener must be attached exactly once globally, not once per window (which would stack duplicate handlers and, worse, duplicate native dialogs). */
  private downloadInterceptionAttached = false;

  private attachDebugger(session: DevBrowserSession): void {
    const wc = session.window.webContents;
    try {
      wc.debugger.attach('1.3');
    } catch {
      return; // already attached
    }
    wc.debugger.sendCommand('Runtime.enable').catch(() => {});
    wc.debugger.sendCommand('Network.enable').catch(() => {});

    wc.debugger.on('message', (_event, method, params) => {
      if (method === 'Runtime.consoleAPICalled') {
        const text = (params.args ?? []).map((a: { value?: unknown; description?: string }) => String(a.value ?? a.description ?? '')).join(' ');
        session.consoleLog.push({ level: params.type ?? 'log', text, timestamp: Date.now() });
        if (session.consoleLog.length > MAX_LOG_ENTRIES) session.consoleLog.shift();
      } else if (method === 'Runtime.exceptionThrown') {
        const text = params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'Uncaught exception';
        session.consoleLog.push({ level: 'error', text, timestamp: Date.now() });
        if (session.consoleLog.length > MAX_LOG_ENTRIES) session.consoleLog.shift();
      } else if (method === 'Network.responseReceived') {
        const status: number = params.response?.status ?? 0;
        session.networkLog.push({ url: params.response?.url ?? '', status, failed: status >= 400, timestamp: Date.now() });
        if (session.networkLog.length > MAX_LOG_ENTRIES) session.networkLog.shift();
      } else if (method === 'Network.loadingFailed') {
        session.networkLog.push({ url: params.url ?? '', status: null, failed: true, timestamp: Date.now() });
        if (session.networkLog.length > MAX_LOG_ENTRIES) session.networkLog.shift();
      }
    });
  }

  private getOrCreate(sessionId: string): DevBrowserSession {
    let session = this.sessions.get(sessionId);
    if (session && !session.window.isDestroyed()) return session;

    const win = new BrowserWindow({
      show: true,
      width: 1000,
      height: 700,
      title: `Paw Browser — ${sessionId}`,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    session = { window: win, consoleLog: [], networkLog: [], approvedGeneralBrowsing: false };
    win.on('closed', () => this.sessions.delete(sessionId));
    this.sessions.set(sessionId, session);
    this.attachDebugger(session);
    this.ensureDownloadInterception(win.webContents.session);
    return session;
  }

  /** A collision-safe default save path for a download nothing explicitly prepared for (e.g. a plain navigation that turned out to be a download) — Electron's real Downloads folder, never a bare filename that could silently overwrite something. */
  private defaultDownloadPath(filename: string): string {
    const downloadsDir = app.getPath('downloads');
    let candidate = path.join(downloadsDir, filename);
    if (!fs.existsSync(candidate)) return candidate;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let n = 1;
    do {
      candidate = path.join(downloadsDir, `${base} (${n})${ext}`);
      n += 1;
    } while (fs.existsSync(candidate));
    return candidate;
  }

  /**
   * Real downloads — whether explicitly triggered via downloadBrowserFile or
   * an "organic" one from a plain navigation/click that happened to be a
   * download — go through this ONE session-level will-download listener,
   * attached exactly once (guarded by downloadInterceptionAttached; see its
   * declaration for why). item.setSavePath() is ALWAYS called, with either
   * the caller's prepared path or a real Downloads-folder default, so no
   * native save dialog can ever appear from a Paw-managed browser window —
   * confirmed directly: leaving any path unset here is what caused one.
   */
  private ensureDownloadInterception(electronSession: Electron.Session): void {
    if (this.downloadInterceptionAttached) return;
    this.downloadInterceptionAttached = true;

    electronSession.on('will-download', (_event, item, webContents) => {
      let owner: DevBrowserSession | undefined;
      for (const candidate of this.sessions.values()) {
        if (candidate.window.webContents === webContents) {
          owner = candidate;
          break;
        }
      }

      const targetPath = owner?.expectedDownloadPath ?? this.defaultDownloadPath(item.getFilename());
      item.setSavePath(targetPath);
      if (owner) owner.expectedDownloadPath = undefined;

      const state: DevBrowserDownloadState = {
        state: 'progressing',
        savePath: item.getSavePath(),
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
      };
      if (owner) owner.activeDownload = state;

      item.on('updated', (_e, itemState) => {
        state.state = itemState === 'interrupted' ? 'interrupted' : 'progressing';
        state.receivedBytes = item.getReceivedBytes();
        state.totalBytes = item.getTotalBytes();
        if (owner) owner.activeDownload = state;
      });
      item.once('done', (_e, itemState) => {
        state.state = itemState;
        state.savePath = item.getSavePath();
        if (owner) owner.activeDownload = state;
      });
    });
  }

  async open(
    sessionId: string,
    url: string,
    allowedDeploymentOrigins: string[] = []
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!isAllowedUrl(url, allowedDeploymentOrigins)) {
      return { ok: false, message: 'The Development Browser can only open localhost/127.0.0.1 URLs or a workspace\'s own recorded deployment URL.' };
    }
    const session = this.getOrCreate(sessionId);
    try {
      await session.window.loadURL(url);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async refresh(sessionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return { ok: false, message: 'No open Development Browser session with that id.' };
    session.window.webContents.reload();
    return { ok: true };
  }

  /**
   * General-web navigation, deliberately separate from open() — the caller
   * (BrowseWebPlugin) owns the permission decision entirely; this method
   * enforces no origin restriction at all, unlike open()'s hard
   * localhost/deployment-only boundary, which stays untouched for the
   * Development Browser use case.
   */
  async navigateUnrestricted(sessionId: string, url: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const session = this.getOrCreate(sessionId);
    try {
      await session.window.loadURL(url);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  approveGeneralBrowsing(sessionId: string): void {
    this.getOrCreate(sessionId).approvedGeneralBrowsing = true;
  }

  isApprovedForGeneralBrowsing(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.approvedGeneralBrowsing ?? false;
  }

  getCurrentUrl(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return null;
    return session.window.webContents.getURL();
  }

  /** Every open session id — the whole of "multi-tab" support: each tab is just another sessionId sharing this same manager, nothing tab-specific to build. */
  listSessions(): string[] {
    return [...this.sessions.keys()].filter((id) => this.isOpen(id));
  }

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return false;
    session.window.close();
    return true;
  }

  /**
   * Generic page-JS execution, reused by every read/extract/click/scroll/wait
   * browser plugin instead of each hand-rolling its own executeJavaScript
   * call (the pattern fillForm above already established for itself).
   */
  async evaluate(sessionId: string, expression: string): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return { ok: false, message: 'No open browser session with that id.' };
    try {
      const value = await session.window.webContents.executeJavaScript(expression);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  /** Registers where the NEXT download this session triggers should land — consumed once by the will-download handler, so no native save dialog ever appears. */
  prepareDownload(sessionId: string, savePath: string): void {
    const session = this.getOrCreate(sessionId);
    session.expectedDownloadPath = savePath;
    session.activeDownload = undefined;
  }

  /** Triggers a download directly from a URL (no click needed) — goes through the same will-download interception as a real click would. */
  async triggerDownload(sessionId: string, url: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return { ok: false, message: 'No open browser session with that id.' };
    try {
      session.window.webContents.downloadURL(url);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  getDownloadState(sessionId: string): DevBrowserDownloadState | undefined {
    return this.sessions.get(sessionId)?.activeDownload;
  }

  getConsoleLog(sessionId: string, maxEntries = 100): DevBrowserConsoleEntry[] | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.consoleLog.slice(-maxEntries);
  }

  getNetworkErrors(sessionId: string): DevBrowserNetworkEntry[] | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.networkLog.filter((entry) => entry.failed);
  }

  async captureScreenshot(sessionId: string): Promise<{ ok: true; base64Png: string } | { ok: false; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return { ok: false, message: 'No open Development Browser session with that id.' };
    const image = await session.window.webContents.capturePage();
    return { ok: true, base64Png: image.toPNG().toString('base64') };
  }

  async fillForm(
    sessionId: string,
    fields: { selector: string; value: string }[],
    submitSelector?: string
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return { ok: false, message: 'No open Development Browser session with that id.' };

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
    try {
      const result = await session.window.webContents.executeJavaScript(script);
      if (typeof result === 'string' && result !== 'ok') {
        return { ok: false, message: `Could not find element matching "${result.split(':')[1]}".` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  /** Sets a <input type="file">'s files via CDP DOM.setFileInputFiles — the DOM API has no way to do this from page-side JS, so this is the one operation that has to go through the debugger session rather than executeJavaScript. */
  async setFileInput(sessionId: string, selector: string, filePath: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || session.window.isDestroyed()) return { ok: false, message: 'No open Development Browser session with that id.' };

    try {
      const dbg = session.window.webContents.debugger;
      const { root } = await dbg.sendCommand('DOM.getDocument');
      const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) return { ok: false, message: `Could not find an element matching "${selector}".` };
      await dbg.sendCommand('DOM.setFileInputFiles', { files: [filePath], nodeId });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  isOpen(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return Boolean(session && !session.window.isDestroyed());
  }
}

export const devBrowserManager = new DevBrowserManager();
