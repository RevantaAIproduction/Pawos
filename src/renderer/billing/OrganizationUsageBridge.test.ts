import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationUsageRecordRequest, OrganizationUsageRecordResponse } from '../../shared/billing/OrganizationUsageBridgeTypes';

const mocks = vi.hoisted(() => ({
  recordUsage: vi.fn(),
  respond: vi.fn(),
  listener: null as ((request: OrganizationUsageRecordRequest) => void) | null,
}));

vi.mock('./OrganizationUsageService', () => ({
  organizationUsageService: { recordUsage: mocks.recordUsage },
}));

vi.mock('../services/ipc/ipcBridge', () => ({
  getIpcBridge: () => ({
    onOrganizationUsageRecordRequest: (cb: (request: OrganizationUsageRecordRequest) => void) => {
      mocks.listener = cb;
      return () => {
        mocks.listener = null;
      };
    },
    organizationUsageRecordRespond: mocks.respond,
  }),
}));

import { installOrganizationUsageBridge } from './OrganizationUsageBridge';

describe('OrganizationUsageBridge', () => {
  beforeEach(() => {
    mocks.recordUsage.mockReset();
    mocks.respond.mockReset();
    mocks.listener = null;
  });

  it('records Enterprise Coding Runtime usage through the existing OrganizationUsageService', async () => {
    mocks.recordUsage.mockResolvedValue({ usedAmount: 8, monthlyLimit: 10 });
    installOrganizationUsageBridge();

    mocks.listener?.({ requestId: 'req-1', organizationId: 'org-1', capability: 'codeExecution', amount: 1 });
    await vi.waitFor(() => expect(mocks.respond).toHaveBeenCalled());

    expect(mocks.recordUsage).toHaveBeenCalledWith('org-1', 'codeExecution', 1);
    expect(mocks.respond).toHaveBeenCalledWith('req-1', {
      ok: true,
      usedAmount: 8,
      monthlyLimit: 10,
    } satisfies OrganizationUsageRecordResponse);
  });

  it('returns a blocking response when organization pooled usage is exhausted', async () => {
    mocks.recordUsage.mockRejectedValue(new Error('usage exhausted'));
    installOrganizationUsageBridge();

    mocks.listener?.({ requestId: 'req-2', organizationId: 'org-1', capability: 'longRunningWorkflow', amount: 1 });
    await vi.waitFor(() => expect(mocks.respond).toHaveBeenCalled());

    expect(mocks.respond).toHaveBeenCalledWith('req-2', { ok: false, message: 'usage exhausted' } satisfies OrganizationUsageRecordResponse);
  });
});
