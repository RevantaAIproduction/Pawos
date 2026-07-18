/**
 * Browser Runtime automates browsers, not browser engines. Every concrete
 * browser (Chrome, Edge, Brave, Firefox, Electron's own embedded Chromium,
 * eventually Safari) implements this SAME interface — BrowserRuntime.ts
 * only ever talks to a BrowserAdapter, never to a specific engine, so
 * adding a new browser later means writing one new adapter file, never
 * touching the runtime or any of the existing browser plugins.
 */
export type BrowserId = 'chrome' | 'edge' | 'brave' | 'firefox' | 'electron';

export type BrowserCapability =
  | 'launch'
  | 'navigate'
  | 'read'
  | 'click'
  | 'fill'
  | 'upload'
  | 'download'
  | 'extract'
  | 'screenshot'
  | 'print'
  | 'cookies'
  | 'history'
  | 'bookmarks'
  | 'consoleLog'
  | 'networkLog';

export type AdapterResult<T = void> = { ok: true; data?: T } | { ok: false; message: string; reason?: string };

export type BrowserField = { selector: string; value: string };

export type BrowserDownloadState = {
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
};

export type BrowserConsoleEntry = { level: string; text: string; timestamp: number };
export type BrowserNetworkEntry = { url: string; status: number | null; failed: boolean; timestamp: number };

/**
 * Every method a browser adapter can expose. Adapters that can't support a
 * given capability (Firefox for anything beyond open/navigate/download,
 * today) implement it as an honest not-implemented AdapterResult rather
 * than silently no-op-ing — BrowserRuntime checks `capabilities` before
 * dispatching so callers get a clear, specific explanation instead of a
 * confusing generic failure.
 */
export interface BrowserAdapter {
  readonly id: BrowserId;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<BrowserCapability>;

  /** Is this browser actually installed on this machine? Cheap, cached where possible. */
  detect(): Promise<boolean>;

  /** Opens a fresh tab/session at a URL, launching the browser process if needed. */
  launch(sessionId: string, url: string): Promise<AdapterResult>;
  /** The explicitly-gated "reuse my existing session" flow — drives the user's REAL browser profile (already-logged-in cookies/sessions) instead of Paw's isolated automation one. Only Chromium adapters support this; others report it honestly as unsupported. */
  reuseSession(sessionId: string, url: string): Promise<AdapterResult>;
  /** Re-navigates an already-open session. */
  navigate(sessionId: string, url: string): Promise<AdapterResult>;
  openTab(sessionId: string, url: string): Promise<AdapterResult>;
  closeTab(sessionId: string): Promise<AdapterResult>;
  isOpen(sessionId: string): boolean;
  listSessions(): string[];
  getCurrentUrl(sessionId: string): string | null;

  read(sessionId: string, maxChars?: number): Promise<AdapterResult<{ content: string; truncated: boolean }>>;
  click(sessionId: string, selector: string): Promise<AdapterResult<{ navigated: boolean }>>;
  fill(sessionId: string, fields: BrowserField[], submitSelector?: string): Promise<AdapterResult>;
  upload(sessionId: string, selector: string, filePath: string): Promise<AdapterResult>;
  extract(sessionId: string, selectors?: string[]): Promise<AdapterResult<unknown>>;
  scroll(sessionId: string, opts: { selector?: string; direction?: 'up' | 'down'; amount?: number }): Promise<AdapterResult>;
  evaluate(sessionId: string, expression: string): Promise<AdapterResult<unknown>>;

  prepareDownload(sessionId: string, savePath: string): void;
  triggerDownload(sessionId: string, url: string): Promise<AdapterResult>;
  getDownloadState(sessionId: string): BrowserDownloadState | undefined;

  screenshot(sessionId: string): Promise<AdapterResult<{ base64Png: string }>>;
  print(sessionId: string, savePath: string): Promise<AdapterResult>;

  cookies(sessionId: string): Promise<AdapterResult<{ name: string; domain: string; value: string }[]>>;
  history(): Promise<AdapterResult<{ url: string; title: string; lastVisitTime: number }[]>>;
  bookmarks(): Promise<AdapterResult<{ url: string; title: string }[]>>;

  getConsoleLog(sessionId: string, maxEntries?: number): BrowserConsoleEntry[] | null;
  getNetworkErrors(sessionId: string): BrowserNetworkEntry[] | null;
}

export const NOT_IMPLEMENTED = (feature: string, browserName: string): { ok: false; message: string } => ({
  ok: false,
  message: `${browserName} automation doesn't support ${feature} yet.`,
});

/**
 * Shared no-op/not-implemented defaults, same discipline as BasePlugin for
 * DesktopPlugin — an adapter only overrides what it genuinely supports.
 */
export abstract class BaseBrowserAdapter implements BrowserAdapter {
  abstract readonly id: BrowserId;
  abstract readonly displayName: string;
  abstract readonly capabilities: ReadonlySet<BrowserCapability>;

  abstract detect(): Promise<boolean>;
  abstract launch(sessionId: string, url: string): Promise<AdapterResult>;
  abstract navigate(sessionId: string, url: string): Promise<AdapterResult>;
  abstract closeTab(sessionId: string): Promise<AdapterResult>;
  abstract isOpen(sessionId: string): boolean;
  abstract listSessions(): string[];
  abstract getCurrentUrl(sessionId: string): string | null;

  async openTab(sessionId: string, url: string): Promise<AdapterResult> {
    return this.launch(sessionId, url);
  }

  async reuseSession(_sessionId: string, _url: string): Promise<AdapterResult> {
    return NOT_IMPLEMENTED('reusing your real logged-in session', this.displayName);
  }

  async read(_sessionId: string, _maxChars?: number): Promise<AdapterResult<{ content: string; truncated: boolean }>> {
    return NOT_IMPLEMENTED('reading page content', this.displayName);
  }
  async click(_sessionId: string, _selector: string): Promise<AdapterResult<{ navigated: boolean }>> {
    return NOT_IMPLEMENTED('clicking elements', this.displayName);
  }
  async fill(_sessionId: string, _fields: BrowserField[], _submitSelector?: string): Promise<AdapterResult> {
    return NOT_IMPLEMENTED('filling forms', this.displayName);
  }
  async upload(_sessionId: string, _selector: string, _filePath: string): Promise<AdapterResult> {
    return NOT_IMPLEMENTED('uploading files', this.displayName);
  }
  async extract(_sessionId: string, _selectors?: string[]): Promise<AdapterResult<unknown>> {
    return NOT_IMPLEMENTED('extracting page data', this.displayName);
  }
  async scroll(_sessionId: string, _opts: { selector?: string; direction?: 'up' | 'down'; amount?: number }): Promise<AdapterResult> {
    return NOT_IMPLEMENTED('scrolling', this.displayName);
  }
  async evaluate(_sessionId: string, _expression: string): Promise<AdapterResult<unknown>> {
    return NOT_IMPLEMENTED('running page scripts', this.displayName);
  }

  prepareDownload(_sessionId: string, _savePath: string): void {
    // Default: no staging needed — adapters that support real download
    // interception (CDP-based ones) override this.
  }
  async triggerDownload(_sessionId: string, _url: string): Promise<AdapterResult> {
    return NOT_IMPLEMENTED('triggering downloads directly', this.displayName);
  }
  getDownloadState(_sessionId: string): BrowserDownloadState | undefined {
    return undefined;
  }

  async screenshot(_sessionId: string): Promise<AdapterResult<{ base64Png: string }>> {
    return NOT_IMPLEMENTED('screenshots', this.displayName);
  }
  async print(_sessionId: string, _savePath: string): Promise<AdapterResult> {
    return NOT_IMPLEMENTED('printing to PDF', this.displayName);
  }
  async cookies(_sessionId: string): Promise<AdapterResult<{ name: string; domain: string; value: string }[]>> {
    return NOT_IMPLEMENTED('reading cookies', this.displayName);
  }
  async history(): Promise<AdapterResult<{ url: string; title: string; lastVisitTime: number }[]>> {
    return NOT_IMPLEMENTED('reading browsing history', this.displayName);
  }
  async bookmarks(): Promise<AdapterResult<{ url: string; title: string }[]>> {
    return NOT_IMPLEMENTED('reading bookmarks', this.displayName);
  }
  getConsoleLog(_sessionId: string, _maxEntries?: number): BrowserConsoleEntry[] | null {
    return null;
  }
  getNetworkErrors(_sessionId: string): BrowserNetworkEntry[] | null {
    return null;
  }
}
