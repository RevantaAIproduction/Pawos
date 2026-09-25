import { app } from 'electron';
import { buildAccessStore } from './BuildAccessStore';
import { entitlementService } from './EntitlementService';
import { rollingUsageGate } from './RollingUsageGate';
import { callRpcAsUser } from '../auth/ServerSessionToken';

/** Quiet period after activity before a report is sent, so a busy turn sends one report, not dozens. */
const DEBOUNCE_MS = 30_000;

export type BuildUsageReport = {
  weekPcUsed: number;
  weekPcLimit: number | null;
  windowPcUsed: number;
  windowPcLimit: number | null;
  weekHoursUsed: number;
  weekHoursLimit: number | null;
  windowHoursUsed: number;
  windowHoursLimit: number | null;
  fileChangesUsed: number;
  fileChangesCap: number | null;
  weekResetsAt: number;
  windowResetsAt: number | null;
  noFurtherReset: boolean;
  appVersion: string;
};

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** This device's current PawOS Build usage, or null when Build isn't the active tier. */
export function buildUsageReport(now = Date.now()): BuildUsageReport | null {
  if (!buildAccessStore.isActive() || entitlementService.effectiveTier() !== 'build') return null;
  const usage = rollingUsageGate.getRollingUsage('build', undefined, now);
  const files = rollingUsageGate.getFileCapUsage('build', now);
  const endsAt = buildAccessStore.getEndsAt();
  return {
    weekPcUsed: round(usage.usage7d, 2),
    weekPcLimit: usage.limit7d,
    windowPcUsed: round(usage.usage5h, 2),
    windowPcLimit: usage.limit5h,
    weekHoursUsed: round(usage.activeHoursUsed7d, 2),
    weekHoursLimit: usage.activeHours7d,
    windowHoursUsed: round(usage.activeHoursUsed5h, 2),
    windowHoursLimit: usage.activeHours5h,
    fileChangesUsed: files.used,
    fileChangesCap: files.cap,
    weekResetsAt: usage.weekResetsAt,
    windowResetsAt: usage.windowResetsAt,
    noFurtherReset: endsAt !== null && usage.weekResetsAt >= endsAt,
    appVersion: app.getVersion(),
  };
}

/**
 * Sends the signed-in Build student's usage to Supabase (report_my_build_usage) so admins can see
 * how much of each limit is left. Visibility only — enforcement stays on the device. Best-effort:
 * failures are logged, never surfaced; the server ignores reports from anyone without active Build.
 */
class BuildUsageReporter {
  private timer: NodeJS.Timeout | null = null;
  private lastSent = '';

  /** Queue a report after the debounce period (or `delayMs`). Cheap to call after every turn. */
  schedule(delayMs = DEBOUNCE_MS): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
    this.timer.unref?.();
  }

  async flush(): Promise<boolean> {
    let report: BuildUsageReport | null;
    try {
      report = buildUsageReport();
    } catch (err) {
      console.error('[PawOS Build] Could not compute usage report:', err);
      return false;
    }
    if (!report) return false;
    const payload = JSON.stringify(report);
    if (payload === this.lastSent) return true;
    try {
      await callRpcAsUser('report_my_build_usage', { p_report: report });
      this.lastSent = payload;
      return true;
    } catch (err) {
      console.error('[PawOS Build] Usage report failed:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.lastSent = '';
  }
}

export const buildUsageReporter = new BuildUsageReporter();
