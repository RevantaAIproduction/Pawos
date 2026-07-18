import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { codingModeStore } from '../CodingModeStore';

export class GetCodingModePlugin extends BasePlugin {
  id = 'getCodingMode';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getCodingMode';
  }

  async execute(): Promise<ActionResult> {
    return { ok: true, data: { preferences: codingModeStore.get() } };
  }

  describeInProgress(): string {
    return 'Checking your coding mode…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const mode = codingModeStore.getMode();
    return mode === 'pro'
      ? "You're in Paw Pro — full Coding Canvas execution is available."
      : "You're in Paw Go — planning and analysis only. Switch to Paw Pro for execution.";
  }
}

export const getCodingModePlugin = new GetCodingModePlugin();
