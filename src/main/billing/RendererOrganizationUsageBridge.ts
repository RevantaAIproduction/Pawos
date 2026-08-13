import { ipcMain, type WebContents } from 'electron';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import {
  ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL,
  ORGANIZATION_USAGE_RECORD_RESPONSE_CHANNEL_PREFIX,
  type OrganizationUsageRecordResponse,
} from '../../shared/billing/OrganizationUsageBridgeTypes';
import type { PooledCodingRuntimeUsageRecorder } from '../execution/CodingRuntimeUsageBoundary';

const RESPONSE_TIMEOUT_MS = 30_000;

function responseChannel(requestId: string): string {
  return `${ORGANIZATION_USAGE_RECORD_RESPONSE_CHANNEL_PREFIX}:${requestId}`;
}

export function createRendererOrganizationUsageRecorder(sender: WebContents): PooledCodingRuntimeUsageRecorder {
  return ({ organizationId, capability, amount }) =>
    new Promise((resolve) => {
      const requestId = `coding-runtime-usage:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const channel = responseChannel(requestId);
      const timeout = setTimeout(() => {
        ipcMain.removeHandler(channel);
        resolve({ ok: false, message: 'Enterprise pooled usage check timed out before Coding Runtime execution.' });
      }, RESPONSE_TIMEOUT_MS);

      ipcMain.handle(channel, (event, response: OrganizationUsageRecordResponse) => {
        if (event.sender.id !== sender.id) {
          return;
        }
        clearTimeout(timeout);
        ipcMain.removeHandler(channel);
        resolve(response.ok ? { ok: true } : { ok: false, message: response.message });
      });

      sender.send(ORGANIZATION_USAGE_RECORD_REQUEST_CHANNEL, {
        requestId,
        organizationId,
        capability,
        amount,
      });
    });
}

export function withRendererOrganizationUsageRecorder<T extends ActionRequest>(
  sender: WebContents,
  execute: (recorder: PooledCodingRuntimeUsageRecorder) => Promise<T>
): Promise<T> {
  return execute(createRendererOrganizationUsageRecorder(sender));
}
