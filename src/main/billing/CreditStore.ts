import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { CreditBalance, CreditConsumptionRecord } from '../../shared/billing/BillingTypes';
import type { AiUsageCategory } from '../../shared/billing/AiUsageCategories';

const FILE_NAME = 'credits.json';
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 200;

type State = {
  usedThisPeriod: number;
  bonusThisPeriod: number;
  periodResetsAt: number;
  /** Weekly-cadence counter, tracked and reset entirely independently of the monthly fields above — see BillingTypes.ts's CreditBalance doc comment. */
  usedThisWeek: number;
  weekResetsAt: number;
  /** Paw Fable's own consumption, drawn against bonusThisPeriod only — see BillingTypes.ts's CreditBalance.fableUsedThisPeriod doc comment. Resets alongside bonusThisPeriod (same monthly boundary), never independently. */
  fableUsedThisPeriod: number;
  history: CreditConsumptionRecord[];
};

function freshPeriod(): Pick<State, 'usedThisPeriod' | 'bonusThisPeriod' | 'periodResetsAt' | 'fableUsedThisPeriod' | 'history'> {
  return { usedThisPeriod: 0, bonusThisPeriod: 0, periodResetsAt: Date.now() + PERIOD_MS, fableUsedThisPeriod: 0, history: [] };
}

function freshWeek(): Pick<State, 'usedThisWeek' | 'weekResetsAt'> {
  return { usedThisWeek: 0, weekResetsAt: Date.now() + WEEK_MS };
}

/**
 * AI credit usage tracking — records consumption against the tier's real
 * monthly limit (resolved by EntitlementService from UsageQuotaConfigStore,
 * never stored here). `bonusThisPeriod` is extra headroom stacked on top of
 * that limit for the current period only, granted by redeeming Referral
 * Credits ("Paw Credits") for more Paw Compute — see grantBonus() and
 * useConversationController.ts's exhaustion flow. It resets to 0 at the
 * same monthly boundary as usedThisPeriod, exactly like a real top-up would
 * — bonus compute doesn't roll over indefinitely.
 */
class CreditStore {
  private file = '';
  private state: State = { ...freshPeriod(), ...freshWeek() };

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      this.state = { ...freshPeriod(), ...freshWeek(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) };
      this.rolloverIfNeeded();
    } catch {
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  /** Monthly and weekly boundaries are independent — either, both, or neither can roll over on a given check. */
  private rolloverIfNeeded(): void {
    if (Date.now() > this.state.periodResetsAt) this.state = { ...this.state, ...freshPeriod() };
    if (Date.now() > this.state.weekResetsAt) this.state = { ...this.state, ...freshWeek() };
  }

  /**
   * `isFable` diverts consumption onto the independent fableUsedThisPeriod counter instead of the
   * tier's own usedThisPeriod/usedThisWeek — Paw Fable turns must never advance, or be blocked by,
   * the included Paw Compute allowance in either direction. Every other model call passes `false`
   * (or omits the argument) and behaves exactly as before this counter existed.
   */
  consume(amount: number, reason: string, category?: AiUsageCategory, isFable = false): void {
    this.rolloverIfNeeded();
    if (isFable) {
      this.state.fableUsedThisPeriod += amount;
    } else {
      this.state.usedThisPeriod += amount;
      this.state.usedThisWeek += amount;
    }
    this.state.history.push({ amount, reason, at: Date.now(), category });
    if (this.state.history.length > MAX_HISTORY) this.state.history = this.state.history.slice(-MAX_HISTORY);
    this.save();
  }

  /** Adds bonus Paw Compute headroom for the current period only — never touches the tier's own configured limit. Amount must already be a real, positive number of compute units; this store has no opinion on where they came from. */
  grantBonus(amount: number): void {
    this.rolloverIfNeeded();
    this.state.bonusThisPeriod += amount;
    this.save();
  }

  getBalance(): CreditBalance {
    this.rolloverIfNeeded();
    return {
      limit: null,
      usedThisPeriod: this.state.usedThisPeriod,
      bonusThisPeriod: this.state.bonusThisPeriod,
      periodResetsAt: this.state.periodResetsAt,
      usedThisWeek: this.state.usedThisWeek,
      weekResetsAt: this.state.weekResetsAt,
      fableUsedThisPeriod: this.state.fableUsedThisPeriod,
    };
  }

  getHistory(): CreditConsumptionRecord[] {
    return [...this.state.history];
  }
}

export const creditStore = new CreditStore();
