import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { execSync } from 'child_process';

export class RequestToolAccessPlugin extends BasePlugin {
  id = 'requestToolAccess';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'requestToolAccess';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'requestToolAccess') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const { tool, scope } = request;

    try {
      let verifyCommand = '';

      switch (tool) {
        case 'bash':
          verifyCommand = 'bash --version';
          break;
        case 'powershell':
          verifyCommand = 'powershell -Command "Get-Host"';
          break;
        case 'github':
          verifyCommand = 'gh --version';
          break;
        case 'docker':
          verifyCommand = 'docker --version';
          break;
        case 'kubernetes':
          verifyCommand = 'kubectl version --client';
          break;
        case 'curl':
          verifyCommand = 'curl --version';
          break;
        case 'git':
          verifyCommand = 'git --version';
          break;
      }

      if (verifyCommand) {
        try {
          execSync(verifyCommand, { stdio: 'pipe', shell: true });
        } catch {
          return { ok: false, reason: 'failed', message: `Tool not found or not accessible: ${tool}` };
        }
      }

      return { ok: true, data: { tool, scope, accessGranted: true } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Failed to grant ${tool} access: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'requestToolAccess') return 'Working on that…';
    return `Granting access to ${request.tool}${request.scope ? ` (${request.scope})` : ''}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'requestToolAccess') return result.ok ? 'Done.' : 'Failed.';
    if (!result.ok) return `Failed to grant tool access.`;
    return `Granted access to ${request.tool}.`;
  }
}

export const requestToolAccessPlugin = new RequestToolAccessPlugin();
