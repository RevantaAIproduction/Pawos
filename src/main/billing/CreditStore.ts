import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { CreditBalance, CreditConsumptionRecord } from '../../shared/billing/BillingTypes';

const FILE_NAME = 'credits.json';
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 200;

type State = { usedThisPeriod: number; periodResetsAt: number; history: CreditConsumptionRecord[] };

function freshPeriod(): State {
  return { usedThisPeriod: 0, periodResetsAt: Date.now() + PERIOD_MS, history: [] };
}

/**
 * AI credit usage tracking — records consumption for future billing/limit
 * enforcement, but enforces nothing yet: `limit` is null (no real cap has
 * been decided — "Business Configuration Required"). A real limit, once
 * configured, plugs into `getBalance()` without changing this store's
 * shape or call sites.
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

  consume(amount: number, reason: string): void {
    if (Date.now() > this.state.periodResetsAt) this.state = freshPeriod();
    this.state.usedThisPeriod += amount;
    this.state.history.push({ amount, reason, at: Date.now() });
    if (this.state.history.length > MAX_HISTORY) this.state.history = this.state.history.slice(-MAX_HISTORY);
    this.save();
  }

  getBalance(): CreditBalance {
    if (Date.now() > this.state.periodResetsAt) this.state = freshPeriod();
    return { limit: null, usedThisPeriod: this.state.usedThisPeriod, periodResetsAt: this.state.periodResetsAt };
  }

  getHistory(): CreditConsumptionRecord[] {
    return [...this.state.history];
  }
}

export const creditStore = new CreditStore();
