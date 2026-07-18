import type {
  AdapterResult,
  BrowserAdapter,
  BrowserConsoleEntry,
  BrowserDownloadState,
  BrowserField,
  BrowserId,
  BrowserNetworkEntry,
} from './BrowserAdapter';
import { ChromiumCdpAdapter } from './ChromiumCdpAdapter';
import { electronAdapter } from './ElectronAdapter';
import { firefoxAdapter } from './FirefoxAdapter';
import { browserPreferences } from './browserPreferences';
import { browserCapabilityStatus } from './browserCapabilityStatus';
import type { BrowserCapabilityKey, BrowserCapabilityReport } from '../../../shared/actions/BrowserCapabilityTypes';

const chromeAdapter = new ChromiumCdpAdapter('chrome', 'Google Chrome', 'chrome');
const edgeAdapter = new ChromiumCdpAdapter('edge', 'Microsoft Edge', 'edge');
const braveAdapter = new ChromiumCdpAdapter('brave', 'Brave', 'brave');

const ALL_ADAPTERS: Record<BrowserId, BrowserAdapter> = {
  chrome: chromeAdapter,
  edge: edgeAdapter,
  brave: braveAdapter,
  firefox: firefoxAdapter,
  electron: electronAdapter,
};

export type AvailableBrowser = { id: BrowserId; displayName: string; installed: boolean };

/** Human labels for the capability panel — order matches how they read naturally, not the type declaration order. */
const CAPABILITY_LABELS: Record<BrowserCapabilityKey, string> = {
  launch: 'Open',
  navigate: 'Navigate',
  read: 'Read',
  click: 'Click',
  fill: 'Fill Forms',
  upload: 'Upload',
  download: 'Download',
  print: 'Print PDF',
  screenshot: 'Screenshots',
};
const CAPABILITY_DISPLAY_ORDER: BrowserCapabilityKey[] = ['launch', 'navigate', 'read', 'click', 'fill', 'upload', 'download', 'print', 'screenshot'];

/** Only Chromium adapters implement reuseSession — Firefox/Electron inherit BaseBrowserAdapter's honest not-implemented default. */
const SESSION_ATTACH_SUPPORTED: BrowserId[] = ['chrome', 'edge', 'brave'];

/**
 * The generic Browser Runtime — never talks to a specific browser engine
 * directly, only ever through a BrowserAdapter. Owns the one piece of
 * state adapters themselves don't share: which adapter a given sessionId
 * is bound to, so every plugin call after the first one for that session
 * routes to the same real browser process without the caller needing to
 * remember which one it picked. Existing browser plugins call this
 * (matching DevBrowserManager's old method names 1:1) instead of a
 * concrete manager — adding a new browser later means writing one new
 * adapter and adding it to ALL_ADAPTERS above, never touching this class
 * or any plugin. Fallback order when no browser is named is driven by
 * browserPreferences (user-configurable), not a hardcoded list.
 */
class BrowserRuntime {
  private sessionAdapter = new Map<string, BrowserAdapter>();
  private detectCache = new Map<BrowserId, boolean>();
  /** Which sessions have already had the user's one-time approval for general (non-local) browsing — tracked here, not per-adapter, since the same approval should hold regardless of which real browser ends up driving the session. */
  private approvedSessions = new Set<string>();

  approveGeneralBrowsing(sessionId: string): void {
    this.approvedSessions.add(sessionId);
  }

  isApprovedForGeneralBrowsing(sessionId: string): boolean {
    return this.approvedSessions.has(sessionId);
  }

  /** "Do not hardcode Chrome" — walks the user's configured preferred order (default chrome/edge/brave/electron, persisted via browserPreferences), picking the first one actually installed. Electron is appended as an always-available safety net even if the user's configured order omits it. */
  private async resolveAdapter(preferred?: BrowserId): Promise<BrowserAdapter> {
    if (preferred) return ALL_ADAPTERS[preferred];
    const order = browserPreferences.getPreferredOrder();
    const candidates = [...order, 'electron' as BrowserId].filter((id, i, arr) => arr.indexOf(id) === i && id !== 'firefox');
    for (const id of candidates) {
      const adapter = ALL_ADAPTERS[id];
      if (await this.isDetected(adapter)) return adapter;
    }
    return electronAdapter; // unreachable in practice — electron is always detected
  }

  getPreferredBrowserOrder(): BrowserId[] {
    return browserPreferences.getPreferredOrder();
  }

  setPreferredBrowserOrder(order: BrowserId[]): void {
    browserPreferences.setPreferredOrder(order);
  }

  private async isDetected(adapter: BrowserAdapter): Promise<boolean> {
    if (this.detectCache.has(adapter.id)) return this.detectCache.get(adapter.id)!;
    const detected = await adapter.detect();
    this.detectCache.set(adapter.id, detected);
    return detected;
  }

  /**
   * Falls back to the Electron adapter for any sessionId it recognizes
   * even if BrowserRuntime never bound it explicitly — this is what makes
   * read-only inspection (console/network/screenshot) work uniformly for
   * BOTH general Browser Runtime sessions AND Development Browser sessions
   * (openDevBrowser calls devBrowserManager directly, bypassing this class
   * entirely, since its localhost-only restriction is a separate concern
   * this runtime doesn't touch) without those Dev Browser plugins needing
   * any changes.
   */
  private adapterFor(sessionId: string): BrowserAdapter | undefined {
    const bound = this.sessionAdapter.get(sessionId);
    if (bound) return bound;
    if (electronAdapter.isOpen(sessionId)) return electronAdapter;
    return undefined;
  }

  /** "Paw should detect what browsers exist on the user's computer" — a real, user-facing capability report, not just internal fallback logic. */
  async listAvailableBrowsers(): Promise<AvailableBrowser[]> {
    const ids: BrowserId[] = ['chrome', 'edge', 'brave', 'firefox', 'electron'];
    const results: AvailableBrowser[] = [];
    for (const id of ids) {
      const adapter = ALL_ADAPTERS[id];
      results.push({ id, displayName: adapter.displayName, installed: await this.isDetected(adapter) });
    }
    return results;
  }

  /**
   * The "Browser Capabilities" panel's data source — static capabilities
   * come straight from each adapter's own `capabilities` Set (the same
   * thing that gates every plugin call), so this can never drift out of
   * sync with what actually works. `realProfileReuse` is the one field
   * that ISN'T derivable from the adapter alone: whether "reuse my real
   * login" genuinely works depends on the user's specific profile
   * (extensions, enterprise hardening), not the browser vendor — so it
   * reflects the last real observed outcome (browserCapabilityStatus),
   * defaulting to 'untested' until the user actually tries it, never a
   * guessed or hardcoded "supported".
   */
  async getCapabilities(): Promise<BrowserCapabilityReport[]> {
    const ids: BrowserId[] = ['chrome', 'edge', 'brave', 'firefox', 'electron'];
    const reports: BrowserCapabilityReport[] = [];
    for (const id of ids) {
      const adapter = ALL_ADAPTERS[id];
      const installed = await this.isDetected(adapter);
      const capabilities = CAPABILITY_DISPLAY_ORDER.map((key) => ({
        key,
        label: CAPABILITY_LABELS[key] ?? key,
        supported: adapter.capabilities.has(key),
      }));
      const sessionAttach = SESSION_ATTACH_SUPPORTED.includes(id);
      const observation = browserCapabilityStatus.get(id);
      reports.push({
        id,
        displayName: adapter.displayName,
        installed,
        capabilities,
        sessionAttach,
        realProfileReuse: sessionAttach ? { status: observation?.status ?? 'untested', reason: observation?.reason } : { status: 'unsupported' },
      });
    }
    return reports;
  }

  /**
   * The general Browser Runtime's one navigation entry point — matches
   * devBrowserManager.navigateUnrestricted's exact name/shape so
   * BrowseWebPlugin's call site needs only its import swapped. Deliberately
   * separate from (and never used by) the Development Browser plugins
   * (openDevBrowser/refreshDevBrowser/fillDevForm/etc.), which keep calling
   * devBrowserManager directly — their hard localhost/deployment-only
   * restriction is a distinct, already-correct security boundary this
   * mission doesn't touch, and it only ever needs Electron's own browser.
   */
  async navigateUnrestricted(sessionId: string, url: string, preferred?: BrowserId): Promise<{ ok: true } | { ok: false; message: string }> {
    const existing = this.adapterFor(sessionId);
    if (existing) return this.toLegacy(await existing.navigate(sessionId, url));

    const adapter = await this.resolveAdapter(preferred);
    const result = await adapter.launch(sessionId, url);
    if (result.ok) this.sessionAdapter.set(sessionId, adapter);
    return this.toLegacy(result);
  }

  /**
   * "Reuse my existing login for GitHub" — drives the user's REAL browser
   * profile instead of Paw's isolated automation one. Only Chrome/Edge/
   * Brave support this (never Firefox/Electron); the plugin's
   * requirements() checks that before this is even called. Unlike most
   * other passthroughs here, this one preserves the adapter's `reason`
   * field (e.g. 'running-no-debug-port') rather than collapsing it away —
   * the whole point of this flow is "never silently fail," so the caller
   * needs to know WHICH honest failure this was, not just that it failed.
   */
  async reuseSession(sessionId: string, url: string, browser: 'chrome' | 'edge' | 'brave'): Promise<{ ok: true } | { ok: false; message: string; reason?: string }> {
    const adapter = ALL_ADAPTERS[browser];
    const result = await adapter.reuseSession(sessionId, url);
    if (result.ok) {
      this.sessionAdapter.set(sessionId, adapter);
      return { ok: true };
    }
    return { ok: false, message: result.message, reason: result.reason };
  }

  getCurrentUrl(sessionId: string): string | null {
    return this.adapterFor(sessionId)?.getCurrentUrl(sessionId) ?? null;
  }

  listSessions(): string[] {
    return [...this.sessionAdapter.keys()].filter((id) => this.isOpen(id));
  }

  isOpen(sessionId: string): boolean {
    return this.adapterFor(sessionId)?.isOpen(sessionId) ?? false;
  }

  close(sessionId: string): boolean {
    const adapter = this.adapterFor(sessionId);
    if (!adapter) return false;
    void adapter.closeTab(sessionId);
    this.sessionAdapter.delete(sessionId);
    return true;
  }

  private capabilityGate<T>(sessionId: string, capability: string): { ok: false; message: string } | { ok: true; adapter: BrowserAdapter } {
    const adapter = this.adapterFor(sessionId);
    if (!adapter) return { ok: false, message: 'No open browser session with that id.' };
    if (!adapter.capabilities.has(capability as never)) {
      return { ok: false, message: `${adapter.displayName} automation doesn't support ${capability} yet.` };
    }
    return { ok: true, adapter };
  }

  private toLegacy<T>(result: AdapterResult<T>): { ok: true; value: T } | { ok: true } | { ok: false; message: string } {
    if (!result.ok) return { ok: false, message: result.message };
    return 'data' in result ? { ok: true, value: result.data as T } : { ok: true };
  }

  async evaluate(sessionId: string, expression: string): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'read');
    if (!gate.ok) return gate;
    const result = await gate.adapter.evaluate(sessionId, expression);
    return result.ok ? { ok: true, value: result.data } : { ok: false, message: result.message };
  }

  async read(sessionId: string, maxChars?: number): Promise<{ ok: true; content: string; truncated: boolean } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'read');
    if (!gate.ok) return gate;
    const result = await gate.adapter.read(sessionId, maxChars);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, content: result.data?.content ?? '', truncated: result.data?.truncated ?? false };
  }

  async click(sessionId: string, selector: string): Promise<{ ok: true; navigated: boolean } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'click');
    if (!gate.ok) return gate;
    const result = await gate.adapter.click(sessionId, selector);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, navigated: result.data?.navigated ?? false };
  }

  async fillForm(sessionId: string, fields: BrowserField[], submitSelector?: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'fill');
    if (!gate.ok) return gate;
    return this.toLegacy(await gate.adapter.fill(sessionId, fields, submitSelector)) as { ok: true } | { ok: false; message: string };
  }

  async setFileInput(sessionId: string, selector: string, filePath: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'upload');
    if (!gate.ok) return gate;
    return this.toLegacy(await gate.adapter.upload(sessionId, selector, filePath)) as { ok: true } | { ok: false; message: string };
  }

  async extract(sessionId: string, selectors?: string[]): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'extract');
    if (!gate.ok) return gate;
    const result = await gate.adapter.extract(sessionId, selectors);
    return result.ok ? { ok: true, value: result.data } : { ok: false, message: result.message };
  }

  async scroll(sessionId: string, opts: { selector?: string; direction?: 'up' | 'down'; amount?: number }): Promise<{ ok: true } | { ok: false; message: string }> {
    const adapter = this.adapterFor(sessionId);
    if (!adapter) return { ok: false, message: 'No open browser session with that id.' };
    return this.toLegacy(await adapter.scroll(sessionId, opts)) as { ok: true } | { ok: false; message: string };
  }

  prepareDownload(sessionId: string, savePath: string): void {
    this.adapterFor(sessionId)?.prepareDownload(sessionId, savePath);
  }

  async triggerDownload(sessionId: string, url: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'download');
    if (!gate.ok) return gate;
    return this.toLegacy(await gate.adapter.triggerDownload(sessionId, url)) as { ok: true } | { ok: false; message: string };
  }

  getDownloadState(sessionId: string): BrowserDownloadState | undefined {
    return this.adapterFor(sessionId)?.getDownloadState(sessionId);
  }

  async captureScreenshot(sessionId: string): Promise<{ ok: true; base64Png: string } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'screenshot');
    if (!gate.ok) return gate;
    const result = await gate.adapter.screenshot(sessionId);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, base64Png: result.data?.base64Png ?? '' };
  }

  async print(sessionId: string, savePath: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'print');
    if (!gate.ok) return gate;
    return this.toLegacy(await gate.adapter.print(sessionId, savePath)) as { ok: true } | { ok: false; message: string };
  }

  async cookies(sessionId: string): Promise<{ ok: true; cookies: { name: string; domain: string; value: string }[] } | { ok: false; message: string }> {
    const gate = this.capabilityGate(sessionId, 'cookies');
    if (!gate.ok) return gate;
    const result = await gate.adapter.cookies(sessionId);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, cookies: result.data ?? [] };
  }

  getConsoleLog(sessionId: string, maxEntries?: number): BrowserConsoleEntry[] | null {
    return this.adapterFor(sessionId)?.getConsoleLog(sessionId, maxEntries) ?? null;
  }

  getNetworkErrors(sessionId: string): BrowserNetworkEntry[] | null {
    return this.adapterFor(sessionId)?.getNetworkErrors(sessionId) ?? null;
  }

  /** Which real browser is driving a given session — used by plugins to phrase honest progress text ("Reading the page in Chrome…") and by the Memory Graph to record real provenance. */
  browserFor(sessionId: string): BrowserId | undefined {
    return this.adapterFor(sessionId)?.id;
  }
}

export const browserRuntime = new BrowserRuntime();
