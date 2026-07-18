import { devBrowserManager } from '../DevBrowserManager';
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

const ELECTRON_CAPABILITIES: BrowserCapability[] = [
  'launch',
  'navigate',
  'read',
  'click',
  'fill',
  'upload',
  'download',
  'extract',
  'screenshot',
  'consoleLog',
  'networkLog',
];

/**
 * Adapts the pre-existing DevBrowserManager (Electron's own embedded
 * Chromium, driven via webContents.debugger) to the generic
 * BrowserAdapter interface — zero duplicated automation logic, this is
 * purely a method-shape translation. Always available (no install/detect
 * needed since it IS this app), so it's the universal fallback when no
 * real external browser is installed.
 */
export class ElectronAdapter extends BaseBrowserAdapter {
  readonly id: BrowserId = 'electron';
  readonly displayName = "Paw's own browser";
  readonly capabilities = new Set(ELECTRON_CAPABILITIES);

  async detect(): Promise<boolean> {
    return true;
  }

  async launch(sessionId: string, url: string): Promise<AdapterResult> {
    const result = await devBrowserManager.navigateUnrestricted(sessionId, url);
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  }

  async navigate(sessionId: string, url: string): Promise<AdapterResult> {
    return this.launch(sessionId, url);
  }

  async closeTab(sessionId: string): Promise<AdapterResult> {
    const closed = devBrowserManager.close(sessionId);
    return closed ? { ok: true } : { ok: false, message: 'No open session with that id.' };
  }

  isOpen(sessionId: string): boolean {
    return devBrowserManager.isOpen(sessionId);
  }

  listSessions(): string[] {
    return devBrowserManager.listSessions();
  }

  getCurrentUrl(sessionId: string): string | null {
    return devBrowserManager.getCurrentUrl(sessionId);
  }

  async evaluate(sessionId: string, expression: string): Promise<AdapterResult<unknown>> {
    const result = await devBrowserManager.evaluate(sessionId, expression);
    return result.ok ? { ok: true, data: result.value } : { ok: false, message: result.message };
  }

  async read(sessionId: string, maxChars = 20_000): Promise<AdapterResult<{ content: string; truncated: boolean }>> {
    const result = await devBrowserManager.evaluate(sessionId, 'document.body.innerText');
    if (!result.ok) return { ok: false, message: result.message };
    const text = String(result.value ?? '');
    const truncated = text.length > maxChars;
    return { ok: true, data: { content: truncated ? text.slice(0, maxChars) : text, truncated } };
  }

  async click(sessionId: string, selector: string): Promise<AdapterResult<{ navigated: boolean }>> {
    const before = devBrowserManager.getCurrentUrl(sessionId);
    const script = `(function() { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; el.click(); return 'ok'; })()`;
    const result = await devBrowserManager.evaluate(sessionId, script);
    if (!result.ok) return { ok: false, message: result.message };
    if (result.value === 'missing') return { ok: false, message: `Could not find an element matching "${selector}".` };
    await new Promise((r) => setTimeout(r, 300));
    const after = devBrowserManager.getCurrentUrl(sessionId);
    return { ok: true, data: { navigated: before !== after } };
  }

  async fill(sessionId: string, fields: BrowserField[], submitSelector?: string): Promise<AdapterResult> {
    const result = await devBrowserManager.fillForm(sessionId, fields, submitSelector);
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  }

  async upload(sessionId: string, selector: string, filePath: string): Promise<AdapterResult> {
    const result = await devBrowserManager.setFileInput(sessionId, selector, filePath);
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  }

  async extract(sessionId: string, selectors?: string[]): Promise<AdapterResult<unknown>> {
    const script = selectors?.length
      ? `(function() { const selectors = ${JSON.stringify(selectors)}; const out = {}; for (const sel of selectors) { out[sel] = Array.from(document.querySelectorAll(sel)).map(el => el.textContent.trim()); } return out; })()`
      : `(function() { return { links: Array.from(document.querySelectorAll('a[href]')).slice(0,50).map(a => ({text: a.textContent.trim(), href: a.href})), headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0,50).map(h => h.textContent.trim()) }; })()`;
    return this.evaluate(sessionId, script);
  }

  async scroll(sessionId: string, opts: { selector?: string; direction?: 'up' | 'down'; amount?: number }): Promise<AdapterResult> {
    const script = opts.selector
      ? `document.querySelector(${JSON.stringify(opts.selector)})?.scrollIntoView({behavior:'smooth'}); 'ok'`
      : `window.scrollBy(0, ${(opts.direction === 'up' ? -1 : 1) * (opts.amount ?? 600)}); 'ok'`;
    const result = await this.evaluate(sessionId, script);
    return result.ok ? { ok: true } : result;
  }

  prepareDownload(sessionId: string, savePath: string): void {
    devBrowserManager.prepareDownload(sessionId, savePath);
  }

  async triggerDownload(sessionId: string, url: string): Promise<AdapterResult> {
    const result = await devBrowserManager.triggerDownload(sessionId, url);
    return result.ok ? { ok: true } : { ok: false, message: result.message };
  }

  getDownloadState(sessionId: string): BrowserDownloadState | undefined {
    return devBrowserManager.getDownloadState(sessionId);
  }

  async screenshot(sessionId: string): Promise<AdapterResult<{ base64Png: string }>> {
    const result = await devBrowserManager.captureScreenshot(sessionId);
    return result.ok ? { ok: true, data: { base64Png: result.base64Png } } : { ok: false, message: result.message };
  }

  getConsoleLog(sessionId: string, maxEntries = 100): BrowserConsoleEntry[] | null {
    return devBrowserManager.getConsoleLog(sessionId, maxEntries);
  }

  getNetworkErrors(sessionId: string): BrowserNetworkEntry[] | null {
    return devBrowserManager.getNetworkErrors(sessionId);
  }
}

export const electronAdapter = new ElectronAdapter();
