import { app } from 'electron';
import { platformEventBus } from '../events/PlatformEventBus';

// Matches the existing 4-second poll precedent already established in
// src/main/communication/adapters/DesktopMeetingProviderAdapter.ts.
const SAMPLE_INTERVAL_MS = 4000;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * The performance/resource monitoring the frozen architecture (§2) confirmed
 * entirely missing: no CPU/memory tracking of any kind existed anywhere.
 * Uses `app.getAppMetrics()` — one call covers every process PawOS runs
 * (main + every renderer + GPU/utility children) rather than needing a
 * separate renderer-side sampler and an IPC round trip per sample.
 */
function sampleOnce(): void {
  const metrics = app.getAppMetrics();
  const mainProcess = metrics.find((m) => m.type === 'Browser');

  if (mainProcess) {
    platformEventBus.reportRuntimeEvent({
      kind: 'performance',
      runtime: 'desktop',
      severity: 'info',
      metric: 'mainProcessCpuPercent',
      value: mainProcess.cpu.percentCPUUsage,
      unit: '%',
    });
    platformEventBus.reportRuntimeEvent({
      kind: 'performance',
      runtime: 'desktop',
      severity: 'info',
      metric: 'mainProcessMemoryMb',
      value: Math.round(mainProcess.memory.workingSetSize / 1024),
      unit: 'MB',
    });
  }

  const totalMemoryMb = metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024;
  platformEventBus.reportRuntimeEvent({
    kind: 'performance',
    runtime: 'desktop',
    severity: 'info',
    metric: 'totalMemoryMb',
    value: Math.round(totalMemoryMb),
    unit: 'MB',
  });
}

/** Idempotent — a second call while already running is a no-op. */
export function startPlatformResourceSampler(): void {
  if (timer) return;
  timer = setInterval(sampleOnce, SAMPLE_INTERVAL_MS);
}

/**
 * Stops the sampler. Called from `main.ts`'s existing `app.on('will-quit')`
 * handler so this phase's one new timer never outlives the app — the
 * concrete, minimal fix for the "no dangling timers" guarantee the Phase 1
 * final verification established as a standard for this codebase's Platform
 * Runtime code going forward.
 */
export function stopPlatformResourceSampler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Exposed for tests only — samples immediately, bypassing the interval. */
export function samplePlatformResourcesOnceForTesting(): void {
  sampleOnce();
}
