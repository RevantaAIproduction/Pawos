import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { BrowserId } from '../../../shared/actions/ActionTypes';

const FILE_NAME = 'browser-capability-status.json';

/** The store only ever persists these two observed outcomes — 'untested'/'unsupported' are computed defaults, never written. */
type ObservedStatus = 'working' | 'blocked';

type Observation = {
  status: ObservedStatus;
  reason?: string;
  observedAt: number;
};

/**
 * Whether "reuse my real login" actually works is not something we can
 * know without trying it — it depends on the user's specific profile
 * (extensions, enterprise hardening), not just the browser vendor. Rather
 * than guess or hardcode a status per browser, this store remembers the
 * outcome of the last real attempt (ChromiumCdpAdapter.reuseSession, real-
 * profile launch path only — never the attach path, since attaching can
 * land on an isolated automation instance and would misreport real-profile
 * capability). The Browser Capabilities panel reads this to show honest,
 * evidence-backed status instead of a static assumption.
 */
class BrowserCapabilityStatus {
  private filePath = '';
  private observations = new Map<BrowserId, Observation>();

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, Observation>;
      for (const [id, obs] of Object.entries(parsed)) this.observations.set(id as BrowserId, obs);
    } catch {
      // no prior observations — every browser starts as 'untested'
    }
  }

  record(browser: BrowserId, status: ObservedStatus, reason?: string): void {
    this.observations.set(browser, { status, reason, observedAt: Date.now() });
    this.persist();
  }

  get(browser: BrowserId): Observation | undefined {
    return this.observations.get(browser);
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const out: Record<string, Observation> = {};
    for (const [id, obs] of this.observations) out[id] = obs;
    fs.writeFileSync(this.filePath, JSON.stringify(out, null, 2), 'utf-8');
  }
}

export const browserCapabilityStatus = new BrowserCapabilityStatus();
