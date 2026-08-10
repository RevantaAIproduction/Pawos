import { describe, expect, it, vi } from 'vitest';
import { platformEventBus } from './PlatformEventBus';
import type { RuntimeEvent, RuntimeEventInput, RuntimeHealthEvent } from './PlatformEventTypes';

type HealthInputOverrides = Partial<Omit<RuntimeHealthEvent, 'id' | 'timestamp'>>;

function healthInput(overrides: HealthInputOverrides = {}): RuntimeEventInput {
  return {
    kind: 'health',
    runtime: 'coding',
    severity: 'info',
    status: 'ok',
    ...overrides,
  };
}

describe('PlatformEventBus', () => {
  it('delivers a reported event to a subscribed listener', () => {
    const received: RuntimeEvent[] = [];
    const unsubscribe = platformEventBus.onRuntimeEvent((event) => received.push(event));

    platformEventBus.reportRuntimeEvent(healthInput({ detail: 'ok' }));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'health', runtime: 'coding', status: 'ok', detail: 'ok' });

    unsubscribe();
  });

  it('assigns a unique id and a timestamp the caller never supplies', () => {
    const received: RuntimeEvent[] = [];
    const unsubscribe = platformEventBus.onRuntimeEvent((event) => received.push(event));

    const before = Date.now();
    const returned = platformEventBus.reportRuntimeEvent(healthInput());
    const after = Date.now();

    expect(typeof returned.id).toBe('string');
    expect(returned.id.length).toBeGreaterThan(0);
    expect(returned.timestamp).toBeGreaterThanOrEqual(before);
    expect(returned.timestamp).toBeLessThanOrEqual(after);
    expect(received[0]).toBe(returned);

    unsubscribe();
  });

  it('generates a different id for every reported event', () => {
    const first = platformEventBus.reportRuntimeEvent(healthInput());
    const second = platformEventBus.reportRuntimeEvent(healthInput());
    expect(first.id).not.toBe(second.id);
  });

  it('delivers one event to every currently-subscribed listener', () => {
    const a: RuntimeEvent[] = [];
    const b: RuntimeEvent[] = [];
    const unsubA = platformEventBus.onRuntimeEvent((e) => a.push(e));
    const unsubB = platformEventBus.onRuntimeEvent((e) => b.push(e));

    platformEventBus.reportRuntimeEvent(healthInput());

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).toBe(b[0]);

    unsubA();
    unsubB();
  });

  it('stops delivering to a listener once unsubscribed', () => {
    const received: RuntimeEvent[] = [];
    const unsubscribe = platformEventBus.onRuntimeEvent((e) => received.push(e));
    unsubscribe();

    platformEventBus.reportRuntimeEvent(healthInput());

    expect(received).toHaveLength(0);
  });

  it('never lets one listener throwing stop delivery to other listeners, or escape to the caller', () => {
    const received: RuntimeEvent[] = [];
    const unsubThrower = platformEventBus.onRuntimeEvent(() => {
      throw new Error('listener boom');
    });
    const unsubGood = platformEventBus.onRuntimeEvent((e) => received.push(e));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let returned: RuntimeEvent | undefined;
    expect(() => {
      returned = platformEventBus.reportRuntimeEvent(healthInput());
    }).not.toThrow();

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(returned);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
    unsubThrower();
    unsubGood();
  });

  it('logs a listener failure with the runtime, event kind, and event id for diagnosis', () => {
    const unsubThrower = platformEventBus.onRuntimeEvent(() => {
      throw new Error('listener boom');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const returned = platformEventBus.reportRuntimeEvent(healthInput({ runtime: 'billing' }));

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logMessage, loggedError] = consoleErrorSpy.mock.calls[0]!;
    expect(logMessage).toContain('health');
    expect(logMessage).toContain('billing');
    expect(logMessage).toContain(returned.id);
    expect(loggedError).toBeInstanceOf(Error);
    expect((loggedError as Error).message).toBe('listener boom');
    expect((loggedError as Error).stack).toBeTruthy();

    consoleErrorSpy.mockRestore();
    unsubThrower();
  });

  it('dispatches to listeners in deterministic subscription order', () => {
    const order: string[] = [];
    const unsubA = platformEventBus.onRuntimeEvent(() => order.push('a'));
    const unsubB = platformEventBus.onRuntimeEvent(() => order.push('b'));
    const unsubC = platformEventBus.onRuntimeEvent(() => order.push('c'));

    platformEventBus.reportRuntimeEvent(healthInput());
    platformEventBus.reportRuntimeEvent(healthInput());

    expect(order).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);

    unsubA();
    unsubB();
    unsubC();
  });

  it('freezes the dispatched event so a listener cannot mutate what later listeners or the caller observe', () => {
    const receivedByB: RuntimeEvent[] = [];
    const unsubA = platformEventBus.onRuntimeEvent((event) => {
      expect(() => {
        (event as { severity: string }).severity = 'critical';
      }).toThrow();
    });
    const unsubB = platformEventBus.onRuntimeEvent((event) => receivedByB.push(event));

    const returned = platformEventBus.reportRuntimeEvent(healthInput({ severity: 'info' }));

    expect(receivedByB[0]!.severity).toBe('info');
    expect(returned.severity).toBe('info');
    expect(Object.isFrozen(returned)).toBe(true);

    unsubA();
    unsubB();
  });

  it('does not let a listener unsubscribing another not-yet-called listener skip it for the in-flight event', () => {
    const received: string[] = [];
    let unsubB: () => void;
    const unsubA = platformEventBus.onRuntimeEvent(() => {
      received.push('a');
      unsubB();
    });
    unsubB = platformEventBus.onRuntimeEvent(() => received.push('b'));

    platformEventBus.reportRuntimeEvent(healthInput());
    expect(received).toEqual(['a', 'b']);

    received.length = 0;
    platformEventBus.reportRuntimeEvent(healthInput());
    expect(received).toEqual(['a']);

    unsubA();
  });

  it('does not deliver the in-flight event to a listener subscribed mid-dispatch — only future events', () => {
    const received: string[] = [];
    const unsubA = platformEventBus.onRuntimeEvent(() => {
      received.push('a');
      platformEventBus.onRuntimeEvent(() => received.push('late'));
    });

    platformEventBus.reportRuntimeEvent(healthInput());
    expect(received).toEqual(['a']);

    received.length = 0;
    platformEventBus.reportRuntimeEvent(healthInput());
    expect(received).toEqual(['a', 'late']);

    unsubA();
    platformEventBus.removeAllListeners();
  });

  it('supports nested (re-entrant) reportRuntimeEvent calls without corrupting either dispatch', () => {
    const received: Array<{ who: string; kind: string }> = [];
    const unsub = platformEventBus.onRuntimeEvent((event) => {
      received.push({ who: 'outer', kind: event.kind });
      if (event.kind === 'health') {
        platformEventBus.reportRuntimeEvent({
          kind: 'warning',
          runtime: 'platform',
          severity: 'warning',
          message: 'nested',
        });
      }
    });

    platformEventBus.reportRuntimeEvent(healthInput());

    expect(received).toEqual([
      { who: 'outer', kind: 'health' },
      { who: 'outer', kind: 'warning' },
    ]);

    unsub();
  });

  it('removeAllListeners leaves no dangling listeners and is safe to call repeatedly', () => {
    const received: RuntimeEvent[] = [];
    platformEventBus.onRuntimeEvent((e) => received.push(e));
    platformEventBus.onRuntimeEvent((e) => received.push(e));
    expect(platformEventBus.listenerCount()).toBeGreaterThan(0);

    platformEventBus.removeAllListeners();
    expect(platformEventBus.listenerCount()).toBe(0);

    expect(() => platformEventBus.removeAllListeners()).not.toThrow();
    expect(platformEventBus.listenerCount()).toBe(0);

    platformEventBus.reportRuntimeEvent(healthInput());
    expect(received).toHaveLength(0);
  });

  it('discriminates every event kind in the taxonomy correctly', () => {
    const kinds: RuntimeEventInput[] = [
      { kind: 'health', runtime: 'desktop', severity: 'info', status: 'ok' },
      { kind: 'error', runtime: 'execution', severity: 'error', message: 'boom' },
      { kind: 'warning', runtime: 'billing', severity: 'warning', message: 'careful' },
      { kind: 'performance', runtime: 'browser', severity: 'info', metric: 'cpu', value: 42, unit: '%' },
      { kind: 'recovery', runtime: 'coding', severity: 'info', action: 'retry', outcome: 'succeeded', attempt: 1 },
      { kind: 'validation', runtime: 'coding', severity: 'info', step: 'typecheck', outcome: 'passed' },
      { kind: 'crash', runtime: 'platform', severity: 'critical', processType: 'renderer', message: 'gone' },
    ];

    const received: RuntimeEvent[] = [];
    const unsubscribe = platformEventBus.onRuntimeEvent((e) => received.push(e));

    for (const input of kinds) {
      platformEventBus.reportRuntimeEvent(input);
    }

    expect(received.map((e) => e.kind)).toEqual([
      'health',
      'error',
      'warning',
      'performance',
      'recovery',
      'validation',
      'crash',
    ]);

    unsubscribe();
  });

  it('listenerCount reflects subscribe/unsubscribe accurately', () => {
    const before = platformEventBus.listenerCount();
    const unsub1 = platformEventBus.onRuntimeEvent(() => {});
    const unsub2 = platformEventBus.onRuntimeEvent(() => {});
    expect(platformEventBus.listenerCount()).toBe(before + 2);
    unsub1();
    expect(platformEventBus.listenerCount()).toBe(before + 1);
    unsub2();
    expect(platformEventBus.listenerCount()).toBe(before);
  });
});
