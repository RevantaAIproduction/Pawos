import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { errorMemoryStore } from '../ErrorMemoryStore';

/** Called once the model has judged a fix actually worked — not auto-detected from success/failure patterns in code. */
export class RecordErrorFixPlugin extends BasePlugin {
  id = 'recordErrorFix';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordErrorFix';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordErrorFix') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entry = errorMemoryStore.record({
      workspaceRoot: request.workspaceRoot,
      problem: request.problem,
      cause: request.cause,
      solution: request.solution,
      filesChanged: request.filesChanged ?? [],
      commandsUsed: request.commandsUsed ?? [],
      verification: request.verification ?? '',
    });
    return { ok: true, data: { id: entry.id } };
  }

  describeInProgress(): string {
    return 'Remembering how that got fixed…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordErrorFix') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I'll remember that fix for next time." : describeFailure(result);
  }
}

export const recordErrorFixPlugin = new RecordErrorFixPlugin();
