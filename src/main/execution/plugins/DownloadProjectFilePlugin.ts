import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { isAllowedUrl } from '../DevBrowserManager';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

/** Doesn't navigate the Development Browser — just fetches a URL and saves the body. Same origin restriction as everything else here (localhost/127.0.0.1/0.0.0.0 or a recorded deployment URL), never an arbitrary third-party download. */
export class DownloadProjectFilePlugin extends BasePlugin {
  id = 'downloadProjectFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'downloadProjectFile';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'downloadProjectFile') return [];
    if (!isAllowedUrl(request.url, workspaceMemoryStore.listDeploymentUrls())) {
      return [{ id: 'url-not-allowed', message: 'I can only download from localhost/127.0.0.1 or a recorded deployment URL.' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'downloadProjectFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isAllowedUrl(request.url, workspaceMemoryStore.listDeploymentUrls())) {
      return { ok: false, reason: 'failed', message: 'I can only download from localhost/127.0.0.1 or a recorded deployment URL.' };
    }
    try {
      const res = await fetch(request.url);
      if (!res.ok) return { ok: false, reason: 'failed', message: `Request failed with status ${res.status}.` };
      const buffer = Buffer.from(await res.arrayBuffer());
      await fs.promises.mkdir(path.dirname(request.savePath), { recursive: true });
      await fs.promises.writeFile(request.savePath, buffer);
      return { ok: true, data: { bytes: buffer.length } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'downloadProjectFile') return 'Working on that…';
    return `Downloading ${request.url}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'downloadProjectFile') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `I've saved that to ${request.savePath}.`;
  }
}

export const downloadProjectFilePlugin = new DownloadProjectFilePlugin();
