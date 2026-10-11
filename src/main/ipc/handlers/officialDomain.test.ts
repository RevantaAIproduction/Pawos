import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';

/**
 * Where PawOS Desktop sends a phone to pair.
 *
 * There is one pairing link: the one in the QR code, to PawOS's official website
 * (https://pawos.revantaai.com/pair/<session>?token=…). That page is where the phone authorizes —
 * it requires sign-in to the same account and an explicit confirmation. pawos.app is not PawOS's
 * domain and must appear nowhere in the app.
 *
 * Desktop once also built a second, "web authorization" link to /auth/mobile-pairing — a page that
 * does not exist on the website. Nothing ever opened it. It is gone, with the channel that served
 * it, and these tests keep it from coming back as a link to nowhere.
 */
const handlers = vi.hoisted(() => ({ registered: [] as string[] }));
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string) => void handlers.registered.push(channel) } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import * as mobileAuth from './mobileAuthHandler';

const source = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8');
/** Every source file of the desktop app, except tests. */
function appFiles(): { file: string; text: string }[] {
  const base = path.join(__dirname, '..', '..', '..');
  const found: { file: string; text: string }[] = [];
  for (const entry of fs.readdirSync(base, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(ts|tsx|js|json|html|css)$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    found.push({ file: path.relative(base, file).split(path.sep).join('/'), text: fs.readFileSync(file, 'utf8') });
  }
  return found;
}

describe('the pairing link points at the official PawOS website', () => {
  it('the QR pairing link is built from the official address, and from nothing configurable', () => {
    const service = source('renderer', 'mobilePresence', 'PairingService.ts');
    expect(service).toContain("export const PAIRING_SITE_URL = 'https://pawos.revantaai.com';");
    expect(service).toContain('const pairingUrl = `${SITE_URL}/pair/${data.session_id}?token=${data.token}`;');
    // No environment variable or setting can move it to another site.
    expect(service).not.toMatch(/process\.env|PAWOS_WEB_URL|localStorage|getItem/);
  });

  it('pawos.app appears nowhere in the desktop app', () => {
    // The domain is always written in lower case; "PawOS.app" is the macOS application bundle's name.
    const offenders = appFiles().filter(({ file, text }) => !file.endsWith('officialDomain.test.ts') && /pawos\.app\b/.test(text)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});

describe('there is no second "web authorization" link', () => {
  it('the main process registers only the two security-key channels', () => {
    handlers.registered.length = 0;
    mobileAuth.registerMobileAuthHandlers();
    expect(handlers.registered).toEqual(['mobileAuth:generateSecurityKey', 'mobileAuth:verifySecurityKey']);
    expect(Object.keys(mobileAuth)).not.toContain('getWebAuthorizationUrl');
  });

  it('nothing in the app builds or asks for a link to /auth/mobile-pairing', () => {
    const offenders = appFiles().filter(({ file, text }) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx') && /auth\/mobile-pairing|getWebAuthorizationUrl|mobileAuth:getWebAuthorizationUrl/.test(text)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the pairing screen goes straight to the QR code, and never claims a browser window was opened for a step that does not exist', () => {
    const screen = source('renderer', 'ui', 'Dashboard', 'sections', 'ConnectMobileUI.tsx');
    // The only state the start button moves to is the QR code (or an error).
    const start = screen.slice(screen.indexOf('const startAuthorization = async'), screen.indexOf('Step 2: Wait for mobile'));
    expect(start).toContain('await pairingService.beginPairing()');
    expect(start).toContain("setState('qr')");
    expect(start).not.toMatch(/setState\('auth'\)|shell\.openExternal|window\.open|BrowserWindow/);
    expect(screen).not.toMatch(/setState\('auth'\)/);
  });

});
