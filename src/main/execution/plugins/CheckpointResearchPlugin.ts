import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { checkpointResearch } from '../../memory/entities/researchEntities';

/** Long Running Research's checkpoint — pause, resume, continue, partial results, and the final report all flow through this one call. See researchEntities.ts. */
export class CheckpointResearchPlugin extends BasePlugin {
  id = 'checkpointResearch';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'checkpointResearch';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'checkpointResearch') return [];
    if (!request.topic || !request.topic.trim()) {
      return [{ id: 'no-topic', message: 'What research topic is this checkpoint for?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'checkpointResearch') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entity = checkpointResearch(request.topic, request.status, request.finding, request.nextSteps, request.finalReport);
    const attrs = entity.attributes as { findings: string[] };
    return { ok: true, data: { topic: request.topic, status: request.status, findingCount: attrs.findings.length } };
  }

  describeInProgress(): string {
    return 'Saving research progress…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'checkpointResearch') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    if (request.status === 'completed') return `Research on "${request.topic}" is complete — I've saved the final report.`;
    if (request.status === 'paused') return `Paused research on "${request.topic}" — I'll pick up right where I left off when you're ready.`;
    return `Checkpointed progress on "${request.topic}".`;
  }
}

export const checkpointResearchPlugin = new CheckpointResearchPlugin();
