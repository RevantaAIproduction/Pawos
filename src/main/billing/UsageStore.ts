import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { TRACKED_USAGE_CAPABILITIES } from '../../shared/billing/UsageEngineTypes';
import type { UsageCapability } from '../../shared/billing/UsageEngineTypes';

const FILE_NAME = 'usage.json';
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

type CapabilityPeriodState = { usedThisPeriod: number; periodResetsAt: number };
type State = Record<Exclude<UsageCapability, 'aiReasoning'>, CapabilityPeriodState>;

function freshPeriodState(): CapabilityPeriodState {
  return { usedThisPeriod: 0, periodResetsAt: Date.now() + PERIOD_MS };
}

function freshState(): State {
  const state = {} as State;
  for (const capability of TRACKED_USAGE_CAPABILITIES) state[capability] = freshPeriodState();
  return state;
}

/**
 * Local, per-account usage counters for the 7 execution-class capabilities
 * (everything except 'aiReasoning', which CreditStore already tracks — see
 * UsageEngineTypes.ts's doc comment). Same monthly-reset discipline as
 * CreditStore.ts, generalized from one counter to one-per-capability.
 *
 * Used for every NON-POOLED tier (Go, Pro, Pro Max, Team Standard, Team
 * Premium) — "per-user quota" per the product spec means exactly this: each
 * account's own local counter, never summed across other accounts. Pooled
 * Enterprise usage is tracked server-side instead (see
 * organization_usage_counters / OrganizationUsageService.ts), since pooling
 * across an org's many separate desktop installs requires a shared backend
 * this local, per-device JSON file cannot provide.
 */
class UsageStore {
  private file = '';
  private state: State = freshState();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const persisted = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<State>;
      this.state = { ...freshState(), ...persisted };
      this.resetExpiredPeriods();
    } catch {
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  private resetExpiredPeriods(): void {
    let changed = false;
    for (const capability of TRACKED_USAGE_CAPABILITIES) {
      if (Date.now() > this.state[capability].periodResetsAt) {
        this.state[capability] = freshPeriodState();
        changed = true;
      }
    }
    if (changed) this.save();
  }

  record(capability: Exclude<UsageCapability, 'aiReasoning'>, amount = 1): void {
    this.resetExpiredPeriods();
    this.state[capability].usedThisPeriod += amount;
    this.save();
  }

  getUsage(capability: Exclude<UsageCapability, 'aiReasoning'>): CapabilityPeriodState {
    this.resetExpiredPeriods();
    return { ...this.state[capability] };
  }
}

export const usageStore = new UsageStore();
