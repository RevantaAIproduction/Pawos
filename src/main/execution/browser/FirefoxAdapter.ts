import * as fs from 'fs';
import { spawn } from 'child_process';
import { app } from 'electron';
import { BaseBrowserAdapter, type AdapterResult, type BrowserCapability, type BrowserId } from './BrowserAdapter';
import { resolveBrowserExecutable } from './browserDetect';

const FIREFOX_CAPABILITIES: BrowserCapability[] = ['launch', 'navigate', 'download'];

type FirefoxSession = { url: string; openedAt: number };

/**
 * Real Firefox has no CDP support by default (it speaks WebDriver BiDi/
 * Marionette instead, a genuinely different protocol requiring its own
 * bridge), so this adapter is deliberately honest about what it can't do:
 * open Paw's own browser or a Chromium browser instead if the user wants
 * automation, or use Firefox for its actual strength here — opening pages
 * for the user to work in themselves. Every method beyond launch/navigate/
 * download inherits BaseBrowserAdapter's not-implemented default, which
 * surfaces a clear, honest message rather than silently no-op-ing.
 */
export class FirefoxAdapter extends BaseBrowserAdapter {
  readonly id: BrowserId = 'firefox';
  readonly displayName = 'Firefox';
  readonly capabilities = new Set(FIREFOX_CAPABILITIES);

  private sessions = new Map<string, FirefoxSession>();

  async detect(): Promise<boolean> {
    return Boolean(await resolveBrowserExecutable('firefox'));
  }

  async launch(sessionId: string, url: string): Promise<AdapterResult> {
    const exe = await resolveBrowserExecutable('firefox');
    if (!exe) return { ok: false, message: 'Firefox isn\'t installed on this machine.' };
    try {
      spawn(exe, ['-new-tab', url], { detached: true, stdio: 'ignore' }).unref();
      this.sessions.set(sessionId, { url, openedAt: Date.now() });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  async navigate(sessionId: string, url: string): Promise<AdapterResult> {
    return this.launch(sessionId, url);
  }

  async closeTab(sessionId: string): Promise<AdapterResult> {
    // No way to close a specific Firefox tab without CDP/WebDriver — this
    // only forgets Paw's own bookkeeping for the session, it doesn't
    // actually close anything in the real browser window.
    const existed = this.sessions.delete(sessionId);
    return existed
      ? { ok: true }
      : { ok: false, message: 'No tracked Firefox session with that id (Firefox automation can\'t close a specific tab).' };
  }

  isOpen(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  listSessions(): string[] {
    return [...this.sessions.keys()];
  }

  getCurrentUrl(sessionId: string): string | null {
    // Best-effort: the URL Paw last told Firefox to open, not a live read
    // of what's actually showing (the user may have navigated since) —
    // there's no CDP/WebDriver channel to ask Firefox directly.
    return this.sessions.get(sessionId)?.url ?? null;
  }

  /** Best-effort only: watches the real Downloads folder for a new file rather than intercepting the download directly (no CDP channel to do that). Honest about the limitation in the returned message. */
  async triggerDownload(sessionId: string, url: string): Promise<AdapterResult> {
    const downloadsDir = app.getPath('downloads');
    const before = new Set(fs.existsSync(downloadsDir) ? fs.readdirSync(downloadsDir) : []);
    const navResult = await this.navigate(sessionId, url);
    if (!navResult.ok) return navResult;

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      const after = fs.existsSync(downloadsDir) ? fs.readdirSync(downloadsDir) : [];
      const newFile = after.find((f) => !before.has(f) && !f.endsWith('.part'));
      if (newFile) return { ok: true };
    }
    return { ok: false, message: "I opened the download in Firefox, but couldn't confirm a new file landed in Downloads within 15 seconds." };
  }
}

export const firefoxAdapter = new FirefoxAdapter();
