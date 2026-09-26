import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => void;

const { FakeWindow, windows } = vi.hoisted(() => {
  const windows: InstanceType<typeof FakeWindow>[] = [];
  class FakeWindow {
    options: Record<string, unknown>;
    debuggerHandlers: Handler[] = [];
    wcHandlers = new Map<string, Handler>();
    sendCommand = vi.fn(async () => ({}));
    sendInputEvent = vi.fn();
    webContents = {
      debugger: {
        attach: () => {},
        sendCommand: this.sendCommand,
        on: (_event: string, handler: Handler) => this.debuggerHandlers.push(handler),
      },
      on: (event: string, handler: Handler) => this.wcHandlers.set(event, handler),
      getURL: () => 'http://localhost:5173/',
      sendInputEvent: this.sendInputEvent,
      session: { on: () => {} },
    };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      windows.push(this);
    }
    loadURL = vi.fn(async () => {});
    isDestroyed = () => false;
    on = () => {};
    close = () => {};
    /** Simulates one CDP event arriving from the page. */
    cdp(method: string, params: Record<string, unknown>) {
      for (const handler of this.debuggerHandlers) handler({}, method, params);
    }
  }
  return { FakeWindow, windows };
});
type FakeWindow = InstanceType<typeof FakeWindow>;

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\Users\\me\\Downloads' },
  BrowserWindow: FakeWindow,
}));

import { devBrowserManager, toSafeInputEvent } from './DevBrowserManager';

describe('DevBrowserManager — Live Preview additions', () => {
  beforeEach(() => {
    windows.length = 0;
  });

  it('opens a hidden, unthrottled session on request; visible by default as before', async () => {
    await devBrowserManager.open('lp-hidden', 'http://localhost:5173', [], { hidden: true });
    await devBrowserManager.open('lp-visible', 'http://localhost:5173');
    expect(windows[0].options).toMatchObject({ show: false, webPreferences: { backgroundThrottling: false } });
    expect(windows[1].options).toMatchObject({ show: true });
    expect((windows[1].options.webPreferences as Record<string, unknown>).backgroundThrottling).toBeUndefined();
  });

  it('still refuses non-localhost URLs, hidden or not', async () => {
    const result = await devBrowserManager.open('lp-bad', 'https://example.com', [], { hidden: true });
    expect(result.ok).toBe(false);
    expect(windows).toHaveLength(0);
  });

  it('records method + resource type on requests, and why a request failed', async () => {
    await devBrowserManager.open('lp-net', 'http://localhost:5173', [], { hidden: true });
    const w = windows[0];
    w.cdp('Network.requestWillBeSent', { requestId: '1', type: 'Fetch', request: { url: 'http://localhost:5173/api/orders', method: 'POST' } });
    w.cdp('Network.responseReceived', { requestId: '1', type: 'Fetch', response: { url: 'http://localhost:5173/api/orders', status: 500 } });
    w.cdp('Network.requestWillBeSent', { requestId: '2', type: 'Script', request: { url: 'http://localhost:5173/src/x.js', method: 'GET' } });
    w.cdp('Network.loadingFailed', { requestId: '2', type: 'Script', errorText: 'net::ERR_CONNECTION_REFUSED', canceled: false });
    w.cdp('Network.responseReceived', { requestId: '3', type: 'Document', response: { url: 'http://localhost:5173/', status: 200 } });

    expect(devBrowserManager.getNetworkLog('lp-net')).toEqual([
      expect.objectContaining({ url: 'http://localhost:5173/api/orders', status: 500, failed: true, resourceType: 'Fetch', method: 'POST' }),
      expect.objectContaining({ url: 'http://localhost:5173/src/x.js', status: null, failed: true, resourceType: 'Script', method: 'GET', errorText: 'net::ERR_CONNECTION_REFUSED', canceled: false }),
      expect.objectContaining({ url: 'http://localhost:5173/', status: 200, failed: false, resourceType: 'Document' }),
    ]);
    // The existing failures-only view is unchanged.
    expect(devBrowserManager.getNetworkErrors('lp-net')).toHaveLength(2);
  });

  it('keeps where console errors and uncaught exceptions came from', async () => {
    await devBrowserManager.open('lp-console', 'http://localhost:5173', [], { hidden: true });
    const w = windows[0];
    w.cdp('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'Save failed' }], stackTrace: { callFrames: [{ url: 'http://localhost:5173/src/api.ts', lineNumber: 8, columnNumber: 2 }] } });
    w.cdp('Runtime.exceptionThrown', { exceptionDetails: { text: 'Uncaught', exception: { description: 'TypeError: x is undefined' }, url: 'http://localhost:5173/src/App.tsx', lineNumber: 11, columnNumber: 4 } });
    expect(devBrowserManager.getConsoleLog('lp-console')).toEqual([
      expect.objectContaining({ level: 'error', text: 'Save failed', source: 'console', location: { url: 'http://localhost:5173/src/api.ts', line: 9, column: 3 } }),
      expect.objectContaining({ level: 'error', text: 'TypeError: x is undefined', source: 'exception', location: { url: 'http://localhost:5173/src/App.tsx', line: 12, column: 5 } }),
    ]);
  });

  it('records renderer crashes and failed main-page loads, but not aborted navigations', async () => {
    await devBrowserManager.open('lp-crash', 'http://localhost:5173', [], { hidden: true });
    const w = windows[0];
    w.wcHandlers.get('did-fail-load')!({}, -3, 'ERR_ABORTED', 'http://localhost:5173/a', true);
    w.wcHandlers.get('did-fail-load')!({}, -102, 'ERR_CONNECTION_REFUSED', 'http://localhost:5173/', true);
    w.wcHandlers.get('did-fail-load')!({}, -102, 'ERR_CONNECTION_REFUSED', 'http://localhost:5173/frame', false);
    w.wcHandlers.get('render-process-gone')!({}, { reason: 'crashed', exitCode: 1 });
    expect(devBrowserManager.getCrashLog('lp-crash')?.map((c) => c.kind)).toEqual(['load-failed', 'renderer-gone']);
  });

  it('clearLogs empties console, network and crash logs for a retest round', async () => {
    await devBrowserManager.open('lp-clear', 'http://localhost:5173', [], { hidden: true });
    const w = windows[0];
    w.cdp('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'x' }] });
    w.cdp('Network.responseReceived', { requestId: '9', response: { url: 'http://localhost:5173/', status: 500 } });
    w.wcHandlers.get('render-process-gone')!({}, { reason: 'crashed', exitCode: 1 });
    expect(devBrowserManager.clearLogs('lp-clear')).toBe(true);
    expect(devBrowserManager.getConsoleLog('lp-clear')).toEqual([]);
    expect(devBrowserManager.getNetworkLog('lp-clear')).toEqual([]);
    expect(devBrowserManager.getCrashLog('lp-clear')).toEqual([]);
  });

  it('screencast: starts via CDP, delivers frames, acks every frame, stops cleanly', async () => {
    await devBrowserManager.open('lp-cast', 'http://localhost:5173', [], { hidden: true });
    const w = windows[0];
    const frames: unknown[] = [];
    expect(await devBrowserManager.startScreencast('lp-cast', (f) => frames.push(f), { maxWidth: 800 })).toEqual({ ok: true });
    expect(w.sendCommand).toHaveBeenCalledWith('Page.startScreencast', expect.objectContaining({ format: 'jpeg', maxWidth: 800 }));

    w.cdp('Page.screencastFrame', { data: 'AAAA', sessionId: 7, metadata: { deviceWidth: 1000, deviceHeight: 700 } });
    expect(frames).toEqual([expect.objectContaining({ data: 'AAAA', deviceWidth: 1000, deviceHeight: 700 })]);
    expect(w.sendCommand).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 7 });

    await devBrowserManager.stopScreencast('lp-cast');
    expect(w.sendCommand).toHaveBeenCalledWith('Page.stopScreencast');
    w.cdp('Page.screencastFrame', { data: 'BBBB', sessionId: 8, metadata: {} });
    expect(frames).toHaveLength(1); // no sink after stop
    expect(w.sendCommand).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 8 }); // still acked
  });

  it('forwards only well-formed user input', async () => {
    await devBrowserManager.open('lp-input', 'http://localhost:5173', [], { hidden: true });
    const w = windows[0];
    expect(devBrowserManager.sendInput('lp-input', { type: 'mouseDown', x: 10, y: 20, button: 'left', clickCount: 1 })).toEqual({ ok: true });
    expect(devBrowserManager.sendInput('lp-input', { type: 'keyDown', keyCode: 'Enter' })).toEqual({ ok: true });
    expect(devBrowserManager.sendInput('lp-input', { type: 'mouseDown', x: 'x', y: 1 }).ok).toBe(false);
    expect(devBrowserManager.sendInput('lp-input', { type: 'executeJavaScript', code: 'x' }).ok).toBe(false);
    expect(devBrowserManager.sendInput('missing', { type: 'mouseMove', x: 1, y: 1 }).ok).toBe(false);
    expect(w.sendInputEvent.mock.calls.map(([e]) => (e as { type: string }).type)).toEqual(['mouseDown', 'keyDown']);
  });
});

describe('toSafeInputEvent', () => {
  it.each([
    [{ type: 'mouseWheel', x: 1, y: 2, deltaX: 0, deltaY: -120 }, { type: 'mouseWheel', x: 1, y: 2, deltaX: 0, deltaY: -120 }],
    [{ type: 'mouseUp', x: 1, y: 2, button: 'weird', clickCount: 99 }, { type: 'mouseUp', x: 1, y: 2, button: 'left', clickCount: 3 }],
    [{ type: 'char', keyCode: 'a' }, { type: 'char', keyCode: 'a' }],
    [{ type: 'keyDown', keyCode: 'x'.repeat(40) }, null],
    [{ type: 'mouseMove', x: Infinity, y: 0 }, null],
    [null, null],
  ])('%j', (input, expected) => expect(toSafeInputEvent(input)).toEqual(expected));
});
