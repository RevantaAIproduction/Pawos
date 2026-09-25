import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { execSync } from 'child_process';

/**
 * Package identifiers only (winget ids like "Git.Git", npm names like "@scope/pkg@1.2.3", pip names like
 * "requests==2.32"). The name is interpolated into a shell command (npm/pip are .cmd shims on Windows,
 * so a shell is unavoidable), so anything outside this set — spaces, &, |, ;, quotes, $() — is refused
 * rather than escaped.
 */
const SAFE_PACKAGE_NAME = /^[A-Za-z0-9@][A-Za-z0-9@._+\-\/=~]*$/;

export class DownloadSoftwarePlugin extends BasePlugin {
  id = 'downloadSoftware';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'downloadSoftware';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'downloadSoftware') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const { name, manager = 'winget' } = request;
    if (!SAFE_PACKAGE_NAME.test(name)) {
      return { ok: false, reason: 'failed', message: `Refusing to install "${name}": not a valid package identifier.` };
    }

    try {
      let command = '';

      switch (manager) {
        case 'winget':
          command = `winget install --id ${name} -e`;
          break;
        case 'npm':
          command = `npm install -g ${name}`;
          break;
        case 'pip':
          command = `pip install ${name}`;
          break;
        default:
          return { ok: false, reason: 'failed', message: `Unknown package manager: ${manager}` };
      }

      execSync(command, { stdio: 'pipe' });
      return { ok: true, data: { name, manager, installed: true } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Failed to download ${name}: ${(error as Error).message}` };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'downloadSoftware' || !result.ok) return result;

    try {
      if (request.type === 'downloadSoftware') {
        const { manager = 'winget', name } = request;
        if (!SAFE_PACKAGE_NAME.test(name)) return { ok: false, reason: 'failed', message: `Not a valid package identifier: ${name}` };

        let verifyCommand = '';
        switch (manager) {
          case 'winget':
            verifyCommand = `winget list --id ${name}`;
            break;
          case 'npm':
            verifyCommand = `npm list -g ${name}`;
            break;
          case 'pip':
            verifyCommand = `pip show ${name}`;
            break;
        }

        if (verifyCommand) {
          execSync(verifyCommand, { stdio: 'pipe' });
        }
      }
      return result;
    } catch (error) {
      return { ok: false, reason: 'failed', message: `Verification failed: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'downloadSoftware') return 'Working on that…';
    return `Downloading ${request.name}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'downloadSoftware') return result.ok ? 'Done.' : 'Failed.';
    if (!result.ok) return `Failed to download ${request.name}.`;
    return `Downloaded and installed ${request.name} successfully.`;
  }
}

export const downloadSoftwarePlugin = new DownloadSoftwarePlugin();
