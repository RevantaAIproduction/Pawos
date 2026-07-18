import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';
import { communicationMemoryStore } from '../../communication/CommunicationMemoryStore';

/** Company Workspace (architecture doc §9) — meetings, calls, files, tasks, timeline, real relationship health/frequent topics/risks/opportunities for one company, composed from real cross-referenced records, never a second copy of the same data. Resolvable by id or by real name — never invents a company that doesn't already exist in Communication Memory. */
export class GetCompanyWorkspacePlugin extends BasePlugin {
  id = 'getCompanyWorkspace';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getCompanyWorkspace';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getCompanyWorkspace') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const companyId = request.companyId ?? (request.companyName ? communicationMemoryStore.findCompanyByName(request.companyName)?.id : undefined);
    if (!companyId) return { ok: false, reason: 'failed', message: `I don't have any real record of a company named "${request.companyName ?? ''}" yet.` };
    const workspace = communicationRuntime.getCompanyWorkspace(companyId);
    if (!workspace) return { ok: false, reason: 'failed', message: 'Unknown company.' };
    return { ok: true, data: workspace };
  }

  describeInProgress(): string {
    return 'Pulling together everything for this company…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getCompanyWorkspace') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { company?: { name?: string } } | undefined;
    return `Here's everything I have on ${data?.company?.name ?? 'this company'}.`;
  }
}

export const getCompanyWorkspacePlugin = new GetCompanyWorkspacePlugin();
