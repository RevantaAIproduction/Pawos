import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportPlatformRendererEvent = vi.fn();

vi.mock('../services/ipc/ipcBridge', () => ({
  getIpcBridge: () => ({ reportPlatformRendererEvent }),
}));

import { installRendererCrashGuard, resetRendererCrashGuardForTesting } from './RendererCrashGuard';

type FakeEvent = Record<string, unknown>;

describe('RendererCrashGuard', () => {
  const listeners: Record<string, Array<(event: FakeEvent) => void>> = {};

  beforeEach(() => {
    resetRendererCrashGuardForTesting();
    reportPlatformRendererEvent.mockClear().mockReset();
    for (const key of Object.keys(listeners)) delete listeners[key];
    vi.stubGlobal('window', {
      addEventListener: (type: string, handler: (event: FakeEvent) => void) => {
        (listeners[type] ??= []).push(handler);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers exactly one listener each for error and unhandledrejection', () => {
    installRendererCrashGuard();
    expect(listeners['error']).toHaveLength(1);
    expect(listeners['unhandledrejection']).toHaveLength(1);
  });

  it('is idempotent — calling it twice does not double-register', () => {
    installRendererCrashGuard();
    installRendererCrashGuard();
    expect(listeners['error']).toHaveLength(1);
    expect(listeners['unhandledrejection']).toHaveLength(1);
  });

  it('reports a window error event via the IPC bridge, using the wrapped Error when present', () => {
    installRendererCrashGuard();
    const error = new Error('boom');
    listeners['error']![0]!({ error, message: 'boom' });

    expect(reportPlatformRendererEvent).toHaveBeenCalledWith({ message: 'boom', stack: error.stack });
  });

  it('falls back to the raw message when no Error object is attached to the error event', () => {
    installRendererCrashGuard();
    listeners['error']![0]!({ error: undefined, message: 'script error' });

    expect(reportPlatformRendererEvent).toHaveBeenCalledWith({ message: 'script error', stack: undefined });
  });

  it('reports an unhandled promise rejection, wrapping a non-Error reason', () => {
    installRendererCrashGuard();
    listeners['unhandledrejection']![0]!({ reason: 'plain string reason' });

    expect(reportPlatformRendererEvent).toHaveBeenCalledWith({
      message: 'plain string reason',
      stack: expect.any(String),
    });
  });

  it('reports an unhandled promise rejection unchanged when the reason is already an Error', () => {
    installRendererCrashGuard();
    const error = new Error('rejected');
    listeners['unhandledrejection']![0]!({ reason: error });

    expect(reportPlatformRendererEvent).toHaveBeenCalledWith({ message: 'rejected', stack: error.stack });
  });

  it('never throws even if the IPC bridge itself throws', () => {
    reportPlatformRendererEvent.mockImplementation(() => {
      throw new Error('bridge down');
    });
    installRendererCrashGuard();

    expect(() => listeners['error']![0]!({ error: new Error('boom'), message: 'boom' })).not.toThrow();
  });
});
