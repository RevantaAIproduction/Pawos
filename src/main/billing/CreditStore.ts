import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import type { CreditBalance, CreditConsumptionRecord } from "../../shared/billing/BillingTypes";
import type { AiUsageCategory } from "../../shared/billing/AiUsageCategories";

const FILE_NAME = "credits.json";
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 200;

type State = {
  userId: string | null;
  usedThisPeriod: number;
  periodResetsAt: number;
  usedThisWeek: number;
  weekResetsAt: number;
  history: CreditConsumptionRecord[];
};

function freshPeriod(): Pick<State, "usedThisPeriod" | "periodResetsAt" | "history"> {
  return { usedThisPeriod: 0, periodResetsAt: Date.now() + PERIOD_MS, history: [] };
}

function freshWeek(): Pick<State, "usedThisWeek" | "weekResetsAt"> {
  return { usedThisWeek: 0, weekResetsAt: Date.now() + WEEK_MS };
}

/**
 * Local usage HISTORY only (the Analytics activity feed) — never a balance and never a charge.
 *
 * Purchased usage used to be a local cache of the server wallet (user_usage_credits) plus a queue of
 * unsent "pending deductions" flushed to deduct_usage_credits(). That path is retired: paid usage is
 * now reserved and settled per Gemini call against server usage buckets (UsageBucketClient.ts), and
 * deduct_usage_credits() is frozen on the server. Unsent legacy deductions found in an old
 * credits.json are dropped on load (logged) — they can no longer be delivered, and the legacy wallet
 * moves to a bucket with its full customer value.
 */
class CreditStore {
  private file = "";
  private state: State = { ...freshPeriod(), ...freshWeek(), userId: null };

  init(): void {
    if (!app || !app.getPath) return;
    this.file = path.join(app.getPath("userData"), "billing", FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf-8"));
      const legacyPending = Array.isArray(parsed.pendingDeductions) ? parsed.pendingDeductions : [];
      if (legacyPending.length > 0) {
        console.warn(`[Credits] Dropping ${legacyPending.length} unsent legacy credit deduction(s); purchased usage is now settled per call on the server.`);
      }
      this.state = {
        userId: null,
        usedThisPeriod: Number(parsed.usedThisPeriod) || 0,
        periodResetsAt: Number(parsed.periodResetsAt) || Date.now() + PERIOD_MS,
        usedThisWeek: Number(parsed.usedThisWeek) || 0,
        weekResetsAt: Number(parsed.weekResetsAt) || Date.now() + WEEK_MS,
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
      this.rolloverIfNeeded();
      if (legacyPending.length > 0 || "purchasedUsageCreditsUsd" in parsed) this.save();
    } catch {
      this.state = { ...freshPeriod(), ...freshWeek(), userId: null };
      this.save();
    }
  }

  private save(): void {
    if (!this.file) return;
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), "utf-8");
  }

  private rolloverIfNeeded(): void {
    if (Date.now() > this.state.periodResetsAt) this.state = { ...this.state, ...freshPeriod() };
    if (Date.now() > this.state.weekResetsAt) this.state = { ...this.state, ...freshWeek() };
  }

  /** The signed-in account this local history belongs to. */
  setUser(userId: string | null): void {
    this.state.userId = userId;
  }

  /** Adds one entry to the local usage history (display only). */
  consume(amount: number, reason: string, category?: AiUsageCategory): void {
    if (!this.state.userId) return; // Anonymous/unauthenticated safety
    this.rolloverIfNeeded();
    this.state.usedThisPeriod += amount;
    this.state.usedThisWeek += amount;
    this.state.history.push({ amount, reason, at: Date.now(), category });
    if (this.state.history.length > MAX_HISTORY) this.state.history = this.state.history.slice(-MAX_HISTORY);
    this.save();
  }

  reset(): void {
    this.state = { ...freshPeriod(), ...freshWeek(), userId: null };
    this.save();
  }

  getBalance(): CreditBalance {
    this.rolloverIfNeeded();
    return {
      limit: null,
      usedThisPeriod: this.state.usedThisPeriod,
      periodResetsAt: this.state.periodResetsAt,
      usedThisWeek: this.state.usedThisWeek,
      weekResetsAt: this.state.weekResetsAt,
      fableUsedThisPeriod: 0,
      standardPurchasedUsedThisPeriod: 0,
    };
  }

  getHistory(): CreditConsumptionRecord[] {
    return [...this.state.history];
  }
}

export const creditStore = new CreditStore();
