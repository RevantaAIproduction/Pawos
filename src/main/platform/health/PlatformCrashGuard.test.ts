import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appExit = vi.fn();
const appOnHandlers: Record<string, (...args: unknown[]) => void> = {};

vi.mock('electron', () => ({
  app: {
    exit: (...args: unknown[]) => appExit(...args),
    on: (event: string, handler: (...args: unknown[]) => void) => {
      appOnHandlers[event] = handler;
    },
  },
}));

import { installPlatformCrashGuard, resetPlatformCrashGuardForTesting } from './PlatformCrashGuard';
import { platformEventBus } from '../events/PlatformEventBus';
import type { RuntimeEvent } from '../events/PlatformEventTypes';

describe('PlatformCrashGuard', () => {
  const processOnHandlers: Record<string, (...args: unknown[]) => void> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processOnSpy: any;

  beforeEach(() => {
    resetPlatformCrashGuardForTesting();
    appExit.mockClear();
    for (const key of Object.keys(appOnHandlers)) delete appOnHandlers[key];
    for (const key of Object.keys(processOnHandlers)) delete processOnHandlers[key];
    // Spied and never delegated to the real EventEmitter — this test never
    // registers a real global process listener, so it can't leak into (or
    // be affected by) any other test file's uncaught exceptions.
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: (...args: unknown[]) => void) => {
      processOnHandlers[event] = handler;
      return process;
    }) as typeof process.on);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
  });

  it('registers exactly one handler each for uncaughtException, unhandledRejection, and child-process-gone', () => {
    installPlatformCrashGuard();
    expect(processOnHandlers['uncaughtException']).toBeTypeOf('function');
    expect(processOnHandlers['unhandledRejection']).toBeTypeOf('function');
    expect(appOnHandlers['child-process-gone']).toBeTypeOf('function');
  });

  it('is idempotent — calling it twice does not double-register', () => {
    installPlatformCrashGuard();
    const callCountAfterFirst = processOnSpy.mock.calls.length;
    installPlatformCrashGuard();
    expect(processOnSpy.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('reports a crash event and exits with code 1 on uncaughtException, preserving the default fatal behavior', () => {
    installPlatformCrashGuard();
    const received: RuntimeEvent[] = [];
    const unsub = platformEventBus.onRuntimeEvent((e) => received.push(e));

    const error = new Error('boom');
    processOnHandlers['uncaughtException']!(error);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'crash', runtime: 'desktop', processType: 'main', message: 'boom' });
    expect((received[0] as { stack?: string }).stack).toBe(error.stack);
    expect(appExit).toHaveBeenCalledWith(1);

    unsub();
  });

  it('reports a crash event and exits with code 1 on unhandledRejection, even for a non-Error rejection reason', () => {
    installPlatformCrashGuard();
    const received: RuntimeEvent[] = [];
    const unsub = platformEventBus.onRuntimeEvent((e) => received.push(e));

    processOnHandlers['unhandledRejection']!('a plain string rejection');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      kind: 'crash',
      runtime: 'desktop',
      processType: 'main',
      message: 'a plain string rejection',
    });
    expect(appExit).toHaveBeenCalledWith(1);

    unsub();
  });

  it('reports a GPU child-process-gone as processType gpu, without exiting', () => {
    installPlatformCrashGuard();
    const received: RuntimeEvent[] = [];
    const unsub = platformEventBus.onRuntimeEvent((e) => received.push(e));

    appOnHandlers['child-process-gone']!(undefined, { type: 'GPU', reason: 'crashed' });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'crash', runtime: 'desktop', processType: 'gpu' });
    expect(appExit).not.toHaveBeenCalled();

    unsub();
  });

  it('reports a non-GPU child-process-gone as processType child, without exiting', () => {
    installPlatformCrashGuard();
    const received: RuntimeEvent[] = [];
    const unsub = platformEventBus.onRuntimeEvent((e) => received.push(e));

    appOnHandlers['child-process-gone']!(undefined, { type: 'Utility', reason: 'killed' });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'crash', runtime: 'desktop', processType: 'child' });
    expect(appExit).not.toHaveBeenCalled();

    unsub();
  });
});
