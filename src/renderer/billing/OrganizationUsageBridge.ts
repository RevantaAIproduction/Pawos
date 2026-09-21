import { getIpcBridge } from '../services/ipc/ipcBridge';
import { organizationUsageService } from './OrganizationUsageService';
import type { OrganizationUsageRecordRequest } from '../../shared/billing/OrganizationUsageBridgeTypes';

export function installOrganizationUsageBridge(): void {
  const ipc = getIpcBridge();
  ipc.onOrganizationUsageRecordRequest(async (request: OrganizationUsageRecordRequest) => {
    try {
      const recorded = await organizationUsageService.recordUsage(request.organizationId, request.capability, request.amount);
      await ipc.organizationUsageRecordRespond(request.requestId, {
        ok: true,
        usedAmount: recorded.usedAmount,
        monthlyLimit: recorded.monthlyLimit,
      });
    } catch (err) {
      await ipc.organizationUsageRecordRespond(request.requestId, {
        ok: false,
        message: err instanceof Error ? err.message : 'Enterprise pooled usage is exhausted or unavailable.',
      });
    }
  });
}
