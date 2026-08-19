import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { codingModeStore } from '../CodingModeStore';
import { entitlementService } from '../../billing/EntitlementService';

/**
 * Switches the local Paw Go/Paw Pro capability preference — not a purchased plan, no billing, no
 * auth check. This toggle is only ever HALF of the real execution gate (see ThinkExecuteGate.
 * codingExecutionBlocked: `!canExecute || codingMode === 'go'`) — the other half is the account's
 * real subscription entitlement, which this plugin never touches. Flipping this to 'pro' on an
 * account whose real tier doesn't include `advancedRuntimes` changes nothing about what the engine
 * will actually allow; the result/narration must say so honestly rather than implying real
 * execution access was just granted.
 */
export class SetCodingModePlugin extends BasePlugin {
  id = 'setCodingMode';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setCodingMode';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setCodingMode') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const preferences = codingModeStore.setMode(request.mode);
    const entitlements = entitlementService.getEntitlements();
    const executionEntitled = entitlementService.isFeatureAvailable('advancedRuntimes');
    return { ok: true, data: { preferences, executionEntitled, tier: entitlements.tier } };
  }

  describeInProgress(): string {
    return 'Switching coding mode…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'setCodingMode') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    if (request.mode !== 'pro') {
      return "Switched to Paw Go — I'll stick to planning, analysis, and read-only Coding Canvas from here.";
    }
    const data = result.ok ? (result.data as { executionEntitled?: boolean; tier?: string } | undefined) : undefined;
    if (data?.executionEntitled) {
      return "Switched to Paw Pro — I can now generate/edit code, run commands, build, test, and use the full Coding Canvas.";
    }
    return `Set the local coding mode preference to Pro, but this account's real subscription tier (${data?.tier ?? 'Paw Go'}) doesn't include code execution — I still can't generate/edit code, run commands, build, or test until the account itself is upgraded to Paw Pro or higher. I can keep planning and analyzing in the meantime.`;
  }
}

export const setCodingModePlugin = new SetCodingModePlugin();
