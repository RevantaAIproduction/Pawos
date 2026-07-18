import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

type DirEntry = { name: string; isDirectory: boolean; size: number | null };

/** A plain single-directory listing — complements searchFiles, which is substring-search-only and doesn't just say "what's in this folder." */
export class ListDirectoryPlugin extends BasePlugin {
  id = 'listDirectory';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listDirectory';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'listDirectory') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'dir-missing', message: `I can't find the folder "${request.path}" — which folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listDirectory') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const stat = await fs.promises.stat(request.path);
      if (!stat.isDirectory()) return { ok: false, reason: 'failed', message: `"${request.path}" is a file, not a folder.` };

      const names = await fs.promises.readdir(request.path);
      const entries: DirEntry[] = await Promise.all(
        names.map(async (name) => {
          try {
            const entryStat = await fs.promises.stat(path.join(request.path, name));
            return { name, isDirectory: entryStat.isDirectory(), size: entryStat.isDirectory() ? null : entryStat.size };
          } catch {
            return { name, isDirectory: false, size: null };
          }
        })
      );
      return { ok: true, data: { entries } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(): string {
    return 'Listing that folder…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'listDirectory') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { entries: DirEntry[] } | undefined;
    const count = data?.entries.length ?? 0;
    return count === 0 ? "That folder's empty." : `Found ${count} item${count === 1 ? '' : 's'}.`;
  }
}

export const listDirectoryPlugin = new ListDirectoryPlugin();
