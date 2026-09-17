# Billing Audit Defect Report

## Defect 1: Missing Idempotency in `deduct_usage_credits` (Audit #4, #17)
- **Exact File**: `src/main/ipc/ipc.ts` (handler for `billing:recordTurnUsage`) and `supabase/migrations/20260917000000_usage_credits_and_referral_cleanup.sql`.
- **Why it is incorrect**: Post-turn usage recording can be retried by the renderer or fail network transit. The current `deduct_usage_credits` RPC lacks an idempotency key.
- **Concrete Failure Scenario**: A 30-second generation completes. The renderer calls `billing:recordTurnUsage`. The IPC takes too long or fails to return the ACK, so the renderer retries the IPC call. The main process executes `recordTurnUsage` twice for the same `runId`. The local cache is deducted twice, and the remote RPC is called twice, resulting in a double-charge.
- **Severity**: Critical (Double Charge).
- **Minimal Correction**: 
  1. Add a `usage_credit_deductions` table to Supabase with `run_id` as the primary key.
  2. Update the `deduct_usage_credits` RPC to accept `p_run_id text` and insert into the deductions table. If a duplicate `run_id` is detected, it should return the current balance without deducting.
  3. Pass `submission.runId` from `ipc.ts`.

## Defect 2: Account Isolation Leak on Logout (Audit #8, #9)
- **Exact File**: `src/main/billing/CreditStore.ts` and `src/main/ipc/ipc.ts`.
- **Why it is incorrect**: `CreditStore` is a singleton with no `reset()` method. `subscriptionStore.reset()` is called on logout, but `creditStore` retains its `purchasedUsageCreditsUsd` state.
- **Concrete Failure Scenario**: Account A logs in, has $50 in purchased credits, and the cache is populated. Account A logs out. Account B logs in. Account B instantly sees a $50 balance and can bypass `hasCreditsRemaining()` checks because the local cache was not cleared.
- **Severity**: Critical (Account Bleed / Free Usage).
- **Minimal Correction**: Add `reset()` to `CreditStore` to zero out the local state. Call `creditStore.reset()` alongside `subscriptionStore.reset()` in `ipc.ts` inside `billing:resetSubscription`.

## Defect 3: Silent Fail-Open on Remote Deduction (Audit #4, #6)
- **Exact File**: `src/main/ipc/ipc.ts` (`billing:recordTurnUsage`).
- **Why it is incorrect**: If `deduct_usage_credits` fails (e.g. network failure or insufficient funds), the error is logged, but the application continues. The local cache was already locally decremented, but if the app restarts, the remote balance (which never successfully decremented) is restored, granting free usage.
- **Concrete Failure Scenario**: User modifies their internet connection to drop requests to Supabase but allow requests to Gemini. They can generate infinitely because the local cache is only enforced per-session, and upon restart, the remote balance is fetched fully intact.
- **Severity**: High (Free Usage).
- **Minimal Correction**: Since generation is post-paid, we cannot un-generate the text. However, if the RPC fails due to insufficient balance, we should sync the local cache to $0 immediately to lock the gate. If it fails due to network, the durable `UsageEventStore` must eventually sync it (which is a larger architectural issue, but we can at least return the exact error from the RPC and sync the cache).

I will now apply these minimal transaction-safe corrections.
