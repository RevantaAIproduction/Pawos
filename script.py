
import re

with open("src/main/ipc/ipc.ts", "r", encoding="utf-8") as f:
    content = f.read()

old_consume = """  ipcMain.handle('billing:consumeCredit', (_evt, amount: number, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId) => {
    creditStore.consume(amount, reason, category, pawModelId === 'paw-fable');
    const balance = creditStore.getBalance();

    // Check if auto-reload should be triggered (when balance runs out)
    // This will be implemented in triggerAutoReloadIfNeeded()
    if (balance.balanceUsd <= 0) {
      // Trigger auto-reload asynchronously - will check config and payment methods
      setImmediate(() => {
        // TODO: Implement auto-reload payment triggering
        // This should:
        // 1. Get user's auto-reload configuration
        // 2. Get user's saved payment method
        // 3. Create Razorpay order for auto-reload amount
        // 4. Process payment automatically using saved card
      });
    }

    return { ...balance, limit: entitlementService.getCreditLimit() };
  });"""

new_consume = """  ipcMain.handle('billing:consumeCredit', (_evt, amount: number, reason: string, category?: AiUsageCategory, pawModelId?: PawModelId) => {
    creditStore.consume(amount, reason, category, pawModelId === 'paw-fable');
    const balance = creditStore.getBalance();

    return { ...balance, limit: entitlementService.getCreditLimit() };
  });"""

content = content.replace(old_consume, new_consume)

old_turn = """      const aggregated = recordTurnUsage(submission.requests, { sessionId: submission.sessionId, runId: submission.runId }, isFable);
      creditStore.consume(aggregated.totalNormalizedCompute, reason, category, isFable, isPurchased);
      
      // Enterprise Server-Authoritative Update
      if (entitlementService.isComputePooled() && submission.organizationId && submission.accessToken) {"""

new_turn = """      const aggregated = recordTurnUsage(submission.requests, { sessionId: submission.sessionId, runId: submission.runId }, isFable);
      const customerPc = normalizedComputeToCustomerPc(aggregated.totalNormalizedCompute);
      creditStore.consume(customerPc, reason, category, isFable, isPurchased);
      
      const supabaseUrl = process.env.SUPABASE_URL;
      const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

      if ((isFable || isPurchased) && submission.accessToken && supabaseUrl && anonKey) {
        const usdCost = customerPcToPurchaseUsd(customerPc);
        if (usdCost > 0) {
          try {
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/deduct_usage_credits`, {
              method: "POST",
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${submission.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ p_amount_usd: usdCost }),
            });
            if (response.ok) {
              const newBalanceUsd = await response.json();
              creditStore.setPurchasedUsageCreditsUsd(newBalanceUsd);
            } else {
              console.error("Failed to deduct usage credits:", await response.text());
            }
          } catch (e) {
            console.error("Failed to deduct usage credits:", e);
          }
        }
      }

      // Enterprise Server-Authoritative Update
      if (entitlementService.isComputePooled() && submission.organizationId && submission.accessToken) {"""

content = content.replace(old_turn, new_turn)

with open("src/main/ipc/ipc.ts", "w", encoding="utf-8") as f:
    f.write(content)

