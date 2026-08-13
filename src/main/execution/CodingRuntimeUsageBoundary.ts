import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { UsageCapability } from '../../shared/billing/UsageEngineTypes';
import { usageEngine, type UsageCheckResult } from '../billing/UsageEngine';
import { classifyActionUsageCapability, shouldEnforceCustomerUsage, type MeteredUsageCapability } from './ActionUsageClassifier';

export type PooledCodingRuntimeUsageRecorder = (params: {
  organizationId: string;
  capability: MeteredUsageCapability;
  amount: number;
  request: ActionRequest;
}) => Promise<{ ok: true } | { ok: false; message: string }>;

type UsageEngineLike = {
  canConsume(capability: MeteredUsageCapability, amount?: number): UsageCheckResult;
  recordUsage(capability: MeteredUsageCapability, amount?: number): void;
};

type UsageBoundaryDeps = {
  usageEngine?: UsageEngineLike;
  pooledRecorder?: PooledCodingRuntimeUsageRecorder | null;
};

let pooledRecorder: PooledCodingRuntimeUsageRecorder | null = null;

export function setPooledCodingRuntimeUsageRecorder(recorder: PooledCodingRuntimeUsageRecorder | null): void {
  pooledRecorder = recorder;
}

function isAwaitingPluginConfirmation(request: ActionRequest): boolean {
  if ('confirmed' in request && request.confirmed) return false;
  if (request.type === 'applyCodeEdit') return true;
  if (request.type === 'writeFile') return fs.existsSync(request.path);
  return false;
}

function failure(message: string, data?: unknown): ActionResult {
  return { ok: false, reason: 'usage-restricted', message, data };
}

export async function enforceCodingRuntimeUsage(request: ActionRequest, deps: UsageBoundaryDeps = {}): Promise<ActionResult | null> {
  if (!shouldEnforceCustomerUsage(request.type)) return null;
  if (isAwaitingPluginConfirmation(request)) return null;

  const capability = classifyActionUsageCapability(request.type);
  if (!capability) return null;

  const engine = deps.usageEngine ?? usageEngine;
  const check = engine.canConsume(capability, 1);
  if (!check.allowed) return failure(check.reason, { capability });

  if (check.pooled) {
    const organizationId = request.scope?.organizationId;
    if (!organizationId) {
      return failure('Enterprise pooled usage must be associated with an organization before Coding Runtime execution can run.', { capability });
    }
    const recorder = deps.pooledRecorder ?? pooledRecorder;
    if (!recorder) {
      return failure('Enterprise pooled Coding Runtime usage enforcement is not connected for this execution path.', { capability });
    }
    const recorded = await recorder({ organizationId, capability, amount: 1, request });
    if (!recorded.ok) return failure(recorded.message, { capability });
    return null;
  }

  engine.recordUsage(capability, 1);
  return null;
}

export function getActionUsageCapability(type: ActionRequest['type']): UsageCapability | null {
  return classifyActionUsageCapability(type);
}
