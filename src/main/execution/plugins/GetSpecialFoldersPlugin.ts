import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { getSpecialFolders } from '../specialFolders';

export class GetSpecialFoldersPlugin extends BasePlugin {
  id = 'getSpecialFolders';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getSpecialFolders';
  }

  async execute(): Promise<ActionResult> {
    return { ok: true, data: getSpecialFolders() };
  }

  describeInProgress(): string {
    return 'Checking your folders…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    return result.ok ? "I've got your Documents/Downloads/Desktop/Pictures/Videos/Music locations." : describeFailure(result);
  }
}

export const getSpecialFoldersPlugin = new GetSpecialFoldersPlugin();
