import { afterEach, describe, expect, it, vi } from 'vitest';

const getAppMetrics = vi.fn();

vi.mock('electron', () => ({
  app: { getAppMetrics: (...args: unknown[]) => getAppMetrics(...args) },
}));

import {
  startPlatformResourceSampler,
  stopPlatformResourceSampler,
  samplePlatformResourcesOnceForTesting,
} from './PlatformResourceSampler';
import { platformEventBus } from '../events/PlatformEventBus';
import type { RuntimeEvent, RuntimePerformanceEvent } from '../events/PlatformEventTypes';

function metrics(overrides: { browserMemoryKb?: number; browserCpu?: number; utilityMemoryKb?: number } = {}) {
  const { browserMemoryKb = 100_000, browserCpu = 5, utilityMemoryKb = 20_000 } = overrides;
  return [
    { type: 'Browser', cpu: { percentCPUUsage: browserCpu }, memory: { workingSetSize: browserMemoryKb } },
    { type: 'Utility', cpu: { percentCPUUsage: 1 }, memory: { workingSetSize: utilityMemoryKb } },
  ];
}

describe('PlatformResourceSampler', () => {
  afterEach(() => {
    stopPlatformResourceSampler();
    getAppMetrics.mockReset();
    vi.useRealTimers();
  });

  it('reports main-process CPU%, main-process memory, and total memory as three performance events', () => {
    getAppMetrics.mockReturnValue(metrics({ browserMemoryKb: 100_000, browserCpu: 12, utilityMemoryKb: 20_000 }));
    const received: RuntimeEvent[] = [];
    const unsub = platformEventBus.onRuntimeEvent((e) => received.push(e));

    samplePlatformResourcesOnceForTesting();

    expect(received).toHaveLength(3);
    expect(received.every((e) => e.kind === 'performance' && e.runtime === 'desktop')).toBe(true);
    const byMetric = Object.fromEntries(
      (received as RuntimePerformanceEvent[]).map((e) => [e.metric, e.value]),
    );
    expect(byMetric.mainProcessCpuPercent).toBe(12);
    expect(byMetric.mainProcessMemoryMb).toBe(Math.round(100_000 / 1024));
    expect(byMetric.totalMemoryMb).toBe(Math.round((100_000 + 20_000) / 1024));

    unsub();
  });

  it('reports only totalMemoryMb when no Browser (main) process entry exists — no fabricated data', () => {
    getAppMetrics.mockReturnValue([{ type: 'Utility', cpu: { percentCPUUsage: 1 }, memory: { workingSetSize: 5_000 } }]);
    const received: RuntimeEvent[] = [];
    const unsub = platformEventBus.onRuntimeEvent((e) => received.push(e));

    samplePlatformResourcesOnceForTesting();

    expect(received).toHaveLength(1);
    expect((received[0] as RuntimePerformanceEvent).metric).toBe('totalMemoryMb');

    unsub();
  });

  it('start() samples on the expected interval and stop() halts further sampling', () => {
    vi.useFakeTimers();
    getAppMetrics.mockReturnValue(metrics());

    startPlatformResourceSampler();
    expect(getAppMetrics).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4000);
    expect(getAppMetrics).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4000);
    expect(getAppMetrics).toHaveBeenCalledTimes(2);

    stopPlatformResourceSampler();
    vi.advanceTimersByTime(8000);
    expect(getAppMetrics).toHaveBeenCalledTimes(2);
  });

  it('start() is idempotent — calling it twice does not create two timers', () => {
    vi.useFakeTimers();
    getAppMetrics.mockReturnValue(metrics());

    startPlatformResourceSampler();
    startPlatformResourceSampler();
    vi.advanceTimersByTime(4000);

    expect(getAppMetrics).toHaveBeenCalledTimes(1);
  });

  it('stop() is safe to call when never started', () => {
    expect(() => stopPlatformResourceSampler()).not.toThrow();
  });
});
