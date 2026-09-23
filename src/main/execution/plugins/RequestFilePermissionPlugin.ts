import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';

export class RequestFilePermissionPlugin extends BasePlugin {
  id = 'requestFilePermission';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'requestFilePermission';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'requestFilePermission') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const { path, permission } = request;

    try {
      const fileExists = fs.existsSync(path);

      switch (permission) {
        case 'read':
          if (!fileExists) return { ok: false, reason: 'failed', message: `File not found: ${path}` };
          break;
        case 'write':
          if (!fileExists) fs.writeFileSync(path, '');
          break;
        case 'edit':
          if (!fileExists) return { ok: false, reason: 'failed', message: `File not found: ${path}` };
          break;
        case 'delete':
          if (!fileExists) return { ok: false, reason: 'failed', message: `File not found: ${path}` };
          fs.unlinkSync(path);
          break;
      }

      return { ok: true, data: { path, permission, granted: true } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Failed to grant ${permission} permission: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'requestFilePermission') return 'Working on that…';
    return `Granting ${request.permission} permission for ${request.path}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'requestFilePermission') return result.ok ? 'Done.' : 'Failed.';
    if (!result.ok) return `Failed to grant permission.`;
    return `Granted ${request.permission} permission for ${request.path}.`;
  }
}

export const requestFilePermissionPlugin = new RequestFilePermissionPlugin();
