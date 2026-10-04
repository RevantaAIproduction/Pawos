import { entitlementService } from './EntitlementService';
import { rollingUsageGate } from './RollingUsageGate';
import { usageBucketClient, type UsageBucketClient } from './UsageBucketClient';
import { usageLimitMessage, type ModelCallReservation, type ModelCallReservationRequest } from '../../shared/billing/UsageBucketTypes';

/**
 * The per-call admission decision, made before EVERY Gemini request (chat turns and each of their
 * tool continuations, background calls, career/meeting tools). It never looks at tier names — the
 * server's product configuration decides, through the customer-safe summary:
 *
 *  - Organization-pooled usage (Enterprise only): no reservation here. Team members are metered on
 *    their own seat's buckets, like Pro.
 *  - A current plan bucket funds the account (summary.bucketFunded): a server reservation, scope
 *    'standard' (plan → extra usage → credits). Paw Fable uses credits only.
 *  - An active paid subscription without a current plan bucket: credits only. If the summary can't
 *    be loaded at all, the call is refused (fail closed) rather than treated as free.
 *  - No paid subscription (Paw Go / PawOS Build): unchanged free allowance (local rolling gate) with
 *    no reservation while it lasts; past it, credits only (Build: not in its final week).
 *
 * The requested output ceiling is passed through; the server clamps it to its engine settings.
 */
export async function authorizeModelCall(
  request: ModelCallReservationRequest,
  deps: { client?: UsageBucketClient; now?: number } = {},
): Promise<ModelCallReservation> {
  const client = deps.client ?? usageBucketClient;
  const now = deps.now ?? Date.now();
  const requested = Number(request.maxOutputTokens);
  const requestedOutput = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : null;
  const call = { ...request, maxOutputTokens: requestedOutput ?? undefined };
  const isFable = request.pawModelId === 'paw-fable';

  if (entitlementService.isPooledUsage()) {
    return { ok: true, reservationId: null, maxOutputTokens: requestedOutput };
  }

  const summary = client.getCachedSummary() ?? (await client.refreshSummary());
  if (summary?.bucketFunded) {
    return client.reserve(call, isFable ? 'credits_only' : 'standard');
  }
  if (entitlementService.hasPaidSubscription()) {
    if (!summary) return { ok: false, reason: 'service_unavailable', message: usageLimitMessage('service_unavailable') };
    return client.reserve(call, 'credits_only');
  }

  // No paid subscription: Paw Go / PawOS Build free-tier rules (unchanged).
  if (isFable) {
    if (!entitlementService.isModelAvailable('paw-fable')) {
      return { ok: false, reason: 'no_allowance', message: usageLimitMessage('no_allowance') };
    }
    return client.reserve(call, 'credits_only');
  }
  const tier = entitlementService.effectiveTier();
  const included = rollingUsageGate.checkIncludedCapacity(tier, entitlementService.getSeatTier(), now, entitlementService.currentProMaxVariant());
  if (included.allowed) {
    return { ok: true, reservationId: null, maxOutputTokens: requestedOutput };
  }
  if (rollingUsageGate.isBuildFinalWeek(tier, now)) {
    return { ok: false, reason: 'no_allowance', message: included.reason ?? usageLimitMessage('no_allowance') };
  }
  return client.reserve(call, 'credits_only');
}
