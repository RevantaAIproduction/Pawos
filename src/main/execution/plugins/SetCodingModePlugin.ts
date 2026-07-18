import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { codingModeStore } from '../CodingModeStore';

/** Switches the local Paw Go/Paw Pro capability preference — not a purchased plan, no billing, no auth check. */
export class SetCodingModePlugin extends BasePlugin {
  id = 'setCodingMode';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setCodingMode';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setCodingMode') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const preferences = codingModeStore.setMode(request.mode);
    return { ok: true, data: { preferences } };
  }

  describeInProgress(): string {
    return 'Switching coding mode…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'setCodingMode') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return request.mode === 'pro'
      ? "Switched to Paw Pro — I can now generate/edit code, run commands, build, test, and use the full Coding Canvas."
      : "Switched to Paw Go — I'll stick to planning, analysis, and read-only Coding Canvas from here.";
  }
}

export const setCodingModePlugin = new SetCodingModePlugin();
