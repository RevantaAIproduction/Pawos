import type { UsageCapability } from './UsageEngineTypes';

export const ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL = 'organizationUsage:recordRequest';
export const ORGANIZATION_USAGE_RECORD_RESPONSE_CHANNEL_PREFIX = 'organizationUsage:recordResponse';

export type OrganizationUsageRecordRequest = {
  requestId: string;
  organizationId: string;
  capability: Exclude<UsageCapability, 'aiReasoning'>;
  amount: number;
};

export type OrganizationUsageRecordResponse =
  | { ok: true; usedAmount: number; monthlyLimit: number | null }
  | { ok: false; message: string };
