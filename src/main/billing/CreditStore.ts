import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import type { CreditBalance, CreditConsumptionRecord } from "../../shared/billing/BillingTypes";
import type { AiUsageCategory } from "../../shared/billing/AiUsageCategories";
import { customerPcToPurchaseUsd } from "../../shared/billing/CustomerPcCommercialModel";
import { usageEventStore } from "./UsageEventStore";

const FILE_NAME = "credits.json";
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 200;

export type PendingDeduction = {
  usageEventId: string;
  amountUsd: number;
  timestamp: number;
};

type State = {
  userId: string | null;
  usedThisPeriod: number;
  periodResetsAt: number;
  usedThisWeek: number;
  weekResetsAt: number;
  history: CreditConsumptionRecord[];
  purchasedUsageCreditsUsd: number;
  pendingDeductions: PendingDeduction[];
};

function freshPeriod(): Pick<State, "usedThisPeriod" | "periodResetsAt" | "history"> {
  return { usedThisPeriod: 0, periodResetsAt: Date.now() + PERIOD_MS, history: [] };
}

function freshWeek(): Pick<State, "usedThisWeek" | "weekResetsAt"> {
  return { usedThisWeek: 0, weekResetsAt: Date.now() + WEEK_MS };
}

class CreditStore {
  private file = "";
  private state: State = { ...freshPeriod(), ...freshWeek(), purchasedUsageCreditsUsd: 0, userId: null, pendingDeductions: [] };

  init(): void {
    if (!app || !app.getPath) return;
    this.file = path.join(app.getPath("userData"), "billing", FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf-8"));
      this.state = {
        ...this.state,
        ...parsed,
        purchasedUsageCreditsUsd: parsed.purchasedUsageCreditsUsd ?? 0,
        pendingDeductions: parsed.pendingDeductions ?? [],
      };
      this.rolloverIfNeeded();
    } catch {
      this.state = { ...freshPeriod(), ...freshWeek(), purchasedUsageCreditsUsd: 0, userId: null, pendingDeductions: [] };
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

  consume(amount: number, reason: string, category?: AiUsageCategory, isFable = false, isPurchased = false, usageEventId?: string): void {
    if (!this.state.userId) return; // Anonymous/unauthenticated safety
    this.rolloverIfNeeded();
    if (isFable || isPurchased) {
      const usdAmount = customerPcToPurchaseUsd(amount);
      this.state.purchasedUsageCreditsUsd = Math.max(0, this.state.purchasedUsageCreditsUsd - usdAmount);
      if (usageEventId && usdAmount > 0) {
        this.state.pendingDeductions.push({ usageEventId, amountUsd: usdAmount, timestamp: Date.now() });
      }
    } else {
      this.state.usedThisPeriod += amount;
      this.state.usedThisWeek += amount;
    }
    this.state.history.push({ amount, reason, at: Date.now(), category });
    if (this.state.history.length > MAX_HISTORY) this.state.history = this.state.history.slice(-MAX_HISTORY);
    this.save();
  }

  resolvePendingDeduction(usageEventId: string): void {
    this.state.pendingDeductions = this.state.pendingDeductions.filter(p => p.usageEventId !== usageEventId);
    this.save();
  }

  getPendingDeductions(): PendingDeduction[] {
    return [...this.state.pendingDeductions];
  }

  setPurchasedUsageCreditsUsd(amountUsd: number): void {
    // The server is authoritative. We update the local cache, then re-apply any STILL-pending local usage
    // so we dont accidentally grant free usage before those pending ones sync.
    let effectiveUsd = amountUsd;
    for (const pending of this.state.pendingDeductions) {
      effectiveUsd -= pending.amountUsd;
    }
    this.state.purchasedUsageCreditsUsd = Math.max(0, effectiveUsd);
    this.save();
  }

  reset(): void {
    this.state = {
      ...freshPeriod(),
      ...freshWeek(),
      userId: null,
      purchasedUsageCreditsUsd: 0,
      pendingDeductions: [],
    };
    this.save();
  }

  async syncUsageCredits(accessToken: string, userId: string): Promise<{ ok: boolean; reason?: string }> {
    this.state.userId = userId;
    this.save();
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !anonKey) return { ok: false, reason: "Supabase is not configured" };
    
    // 1. Flush any pending deductions FIRST
    for (const pending of [...this.state.pendingDeductions]) {
       try {
         const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/deduct_usage_credits`, {
           method: "POST",
           headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
           body: JSON.stringify({ p_amount_usd: pending.amountUsd, p_usage_event_id: pending.usageEventId })
         });
         if (resp.ok) {
           this.resolvePendingDeduction(pending.usageEventId);
         }
       } catch (e) {
         console.error("Failed to flush pending deduction", e);
       }
    }

    // 2. Fetch authoritative balance
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/user_usage_credits?select=balance_usd`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          this.setPurchasedUsageCreditsUsd(data[0].balance_usd);
        } else {
          this.setPurchasedUsageCreditsUsd(0);
        }
        return { ok: true };
      }
      return { ok: false, reason: "Fetch failed" };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }

  getBalance(): CreditBalance {
    this.rolloverIfNeeded();
    return {
      limit: null,
      usedThisPeriod: this.state.usedThisPeriod,
      periodResetsAt: this.state.periodResetsAt,
      usedThisWeek: this.state.usedThisWeek,
      weekResetsAt: this.state.weekResetsAt,
      purchasedUsageCreditsUsd: this.state.purchasedUsageCreditsUsd,
    };
  }

  getHistory(): CreditConsumptionRecord[] {
    return [...this.state.history];
  }
}

export const creditStore = new CreditStore();
