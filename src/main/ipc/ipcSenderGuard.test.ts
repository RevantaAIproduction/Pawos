import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    listeners,
    app: { isPackaged: true },
    ipcMain: {
      handle: (channel: string, listener: (...args: unknown[]) => unknown) => void handlers.set(channel, listener),
      on: (channel: string, listener: (...args: unknown[]) => unknown) => void listeners.set(channel, listener),
      once: (channel: string, listener: (...args: unknown[]) => unknown) => void listeners.set(channel, listener),
    },
  };
});
vi.mock('electron', () => ({ app: electron.app, ipcMain: electron.ipcMain }));

import { ipcMain } from 'electron';
import { ipcSenderUrl, isTrustedIpcSenderUrl } from './ipcSenderGuard';

const APP_PAGE = 'file:///C:/Program%20Files/WindowsApps/PawosAI.PawOS_1.0.3.0_x64__y5w6824kw3wcj/app/resources/app.asar/dist/renderer/index.html?window=main';
const from = (url: string | undefined, frameUrl?: string) => ({ senderFrame: frameUrl === undefined ? null : { url: frameUrl }, sender: { getURL: () => url ?? '' } });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('isTrustedIpcSenderUrl', () => {
  it("accepts the app's own bundled page, installed or run from a folder", () => {
    expect(isTrustedIpcSenderUrl(APP_PAGE, true)).toBe(true);
    expect(isTrustedIpcSenderUrl('file:///C:/Users/me/PawOS/dist/renderer/index.html?window=companion', true)).toBe(true);
    expect(isTrustedIpcSenderUrl('file:///Applications/PawOS.app/Contents/Resources/app.asar/dist/renderer/index.html', true)).toBe(true);
  });

  it('refuses every web origin, even ones that look like PawOS', () => {
    for (const url of [
      'https://pawos.revantaai.com/app',
      'https://evil.example/',
      'http://localhost:3000/',
      'http://127.0.0.1:51900/callback',
      'data:text/html,<script>1</script>',
      'blob:https://evil.example/1234',
      'about:blank',
      'about:srcdoc',
      'javascript:alert(1)',
      'pawos://jump/new-chat',
      'not a url',
      '',
    ]) {
      expect(isTrustedIpcSenderUrl(url, true), url).toBe(false);
    }
    expect(isTrustedIpcSenderUrl(undefined, true)).toBe(false);
    expect(isTrustedIpcSenderUrl(null, true)).toBe(false);
  });

  it('accepts the local dev server only in a development run', () => {
    expect(isTrustedIpcSenderUrl('http://localhost:8080/', false)).toBe(true);
    expect(isTrustedIpcSenderUrl('http://127.0.0.1:8080/index.html', false)).toBe(true);
    expect(isTrustedIpcSenderUrl('http://localhost.evil.example/', false)).toBe(false);
    expect(isTrustedIpcSenderUrl('https://evil.example/', false)).toBe(false);
    expect(isTrustedIpcSenderUrl('http://localhost:8080/', true)).toBe(false);
  });
});

describe('ipcSenderUrl', () => {
  it("uses the sending frame, so a remote frame inside the app's window is seen for what it is", () => {
    expect(ipcSenderUrl(from(APP_PAGE, 'https://evil.example/frame'))).toBe('https://evil.example/frame');
    expect(ipcSenderUrl(from(APP_PAGE))).toBe(APP_PAGE);
  });

  it('gives nothing when the frame is gone', () => {
    const destroyed = {
      get senderFrame(): never {
        throw new Error('Render frame was disposed');
      },
    };
    expect(ipcSenderUrl(destroyed)).toBeUndefined();
  });
});

describe('the installed guard (ipcMain is wrapped when the module loads)', () => {
  const invoke = (channel: string, event: unknown, ...args: unknown[]) => electron.handlers.get(channel)!(event, ...args);

  it('runs a handler for the app page and passes its arguments through', async () => {
    const handler = vi.fn((_event: unknown, a: number, b: number) => a + b);
    ipcMain.handle('test:add', handler as never);
    expect(await invoke('test:add', from(APP_PAGE, APP_PAGE), 2, 3)).toBe(5);
  });

  it('refuses a handler call from a web page — a navigated window or a popup carrying the preload', () => {
    const handler = vi.fn(() => 'secret');
    ipcMain.handle('test:secret', handler as never);
    expect(() => invoke('test:secret', from('https://evil.example/'))).toThrow('not allowed');
    expect(() => invoke('test:secret', from(APP_PAGE, 'https://evil.example/frame'))).toThrow('not allowed');
    expect(handler).not.toHaveBeenCalled();
  });

  it('never logs the arguments of a refused call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ipcMain.handle('test:creds', (() => null) as never);
    expect(() => invoke('test:creds', from('https://evil.example/'), 'super-secret-token')).toThrow();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('super-secret-token');
    expect(warn.mock.calls.flat().join(' ')).toContain('test:creds');
  });

  it('drops one-way messages from a web page and delivers them from the app page', () => {
    const listener = vi.fn();
    ipcMain.on('test:event', listener as never);
    electron.listeners.get('test:event')!(from('https://evil.example/'), 'x');
    expect(listener).not.toHaveBeenCalled();
    electron.listeners.get('test:event')!(from(APP_PAGE, APP_PAGE), 'x');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
