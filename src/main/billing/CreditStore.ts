import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { CreditBalance, CreditConsumptionRecord } from '../../shared/billing/BillingTypes';
import type { AiUsageCategory } from '../../shared/billing/AiUsageCategories';

const FILE_NAME = 'credits.json';
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 200;

type State = { usedThisPeriod: number; bonusThisPeriod: number; periodResetsAt: number; history: CreditConsumptionRecord[] };

function freshPeriod(): State {
  return { usedThisPeriod: 0, bonusThisPeriod: 0, periodResetsAt: Date.now() + PERIOD_MS, history: [] };
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
  private state: State = freshPeriod();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      this.state = { ...freshPeriod(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) };
      if (Date.now() > this.state.periodResetsAt) this.state = freshPeriod();
    } catch {
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  consume(amount: number, reason: string, category?: AiUsageCategory): void {
    if (Date.now() > this.state.periodResetsAt) this.state = freshPeriod();
    this.state.usedThisPeriod += amount;
    this.state.history.push({ amount, reason, at: Date.now(), category });
    if (this.state.history.length > MAX_HISTORY) this.state.history = this.state.history.slice(-MAX_HISTORY);
    this.save();
  }

  /** Adds bonus Paw Compute headroom for the current period only — never touches the tier's own configured limit. Amount must already be a real, positive number of compute units; this store has no opinion on where they came from. */
  grantBonus(amount: number): void {
    if (Date.now() > this.state.periodResetsAt) this.state = freshPeriod();
    this.state.bonusThisPeriod += amount;
    this.save();
  }

  getBalance(): CreditBalance {
    if (Date.now() > this.state.periodResetsAt) this.state = freshPeriod();
    return {
      limit: null,
      usedThisPeriod: this.state.usedThisPeriod,
      bonusThisPeriod: this.state.bonusThisPeriod,
      periodResetsAt: this.state.periodResetsAt,
    };
  }

  getHistory(): CreditConsumptionRecord[] {
    return [...this.state.history];
  }
}

export const creditStore = new CreditStore();
