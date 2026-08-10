import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { recordCodingPreference } from '../../memory/entities/codingRuntimeMemoryEntities';

/**
 * Coding Runtime V2, Coding Runtime Memory (§14) — model-invoked only, never silently inferred from
 * a single observed instance of code style (see codingRuntimeMemoryEntities.ts's doc comment for
 * why re-recording the same key updates the same entity rather than accumulating duplicates).
 */
export class RecordCodingPreferencePlugin extends BasePlugin {
  id = 'recordCodingPreference';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordCodingPreference';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'recordCodingPreference') return [];
    if (request.preferenceScope === 'project' && !request.rootPath) {
      return [{ id: 'missing-root', message: 'Which project does this preference apply to?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordCodingPreference') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (request.preferenceScope === 'project' && !request.rootPath) {
      return { ok: false, reason: 'failed', message: 'A project-scoped preference needs a project root.' };
    }
    const entity = recordCodingPreference(request.preferenceScope, request.preferenceKey, request.preferenceValue, request.rootPath);
    return { ok: true, data: { id: entity.id } };
  }

  describeInProgress(): string {
    return 'Remembering that preference…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordCodingPreference') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "Got it — I'll remember that." : describeFailure(result);
  }
}

export const recordCodingPreferencePlugin = new RecordCodingPreferencePlugin();
