import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { listRecentOfficeFiles } from '../../../memory/entities/officeEntities';

/** Read-only "what have I recently created/edited" across documents/spreadsheets/presentations — backs the Workspace UI's Recent Documents region. Never gated. */
export class ListRecentOfficeFilesPlugin extends BasePlugin {
  id = 'listRecentOfficeFiles';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listRecentOfficeFiles';
  }

  async execute(): Promise<ActionResult> {
    const files = listRecentOfficeFiles(10).map((e) => ({ type: e.type, attributes: e.attributes, updatedAt: e.updatedAt }));
    return { ok: true, data: { files } };
  }

  describeInProgress(): string {
    return 'Checking recent documents…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { files: unknown[] };
    return data.files.length > 0 ? `${data.files.length} recent office file(s) found.` : 'No office files created or edited yet.';
  }
}

export const listRecentOfficeFilesPlugin = new ListRecentOfficeFilesPlugin();
