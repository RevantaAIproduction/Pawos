import type { CreditBalance } from '../../shared/billing/BillingTypes';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';
import type { LocalUsageEventSummary, RecordedTurnUsage, UsageEventAck } from '../../shared/billing/UsageBucketTypes';

/**
 * The shapes the billing IPC channels hand to the renderer. The main process keeps model names,
 * token counts and normalizedCompute (the local ledger needs them); the renderer only ever gets these.
 */
export function recordedTurnUsageResponse(balance: CreditBalance): RecordedTurnUsage {
  return { balance };
}

export function usageEventAck(): UsageEventAck {
  return { ok: true };
}

export function toLocalUsageEventSummary(record: NormalizedUsageRecord): LocalUsageEventSummary {
  return { usageEventId: record.usageEventId, timestamp: record.timestamp, requestType: record.requestType, sessionId: record.sessionId };
}
