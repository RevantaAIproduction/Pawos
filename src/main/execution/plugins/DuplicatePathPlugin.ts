import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { copyWithVerify, findFreeCopyName } from './pathCopy';
import { onFileCreated } from '../../memory/entities/fileEntities';

/** Duplicates a file or folder next to itself as "name (copy).ext" — always finds a free name, so it never collides and never needs confirmation. */
export class DuplicatePathPlugin extends BasePlugin {
  id = 'duplicatePath';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'duplicatePath';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'duplicatePath') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which file or folder did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'duplicatePath') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const to = await findFreeCopyName(request.path);
      await copyWithVerify(request.path, to);
      onFileCreated(to);
      return { ok: true, data: { to, overwritten: false } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'duplicatePath' || !result.ok) return result;
    const data = result.data as { to?: string } | undefined;
    if (!data?.to || !fs.existsSync(data.to)) {
      return { ok: false, reason: 'failed', message: 'The duplicate reported success, but the new copy doesn’t exist — something went wrong.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'duplicatePath') return 'Working on that…';
    return `Duplicating ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'duplicatePath') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { to?: string } | undefined;
    return `I've duplicated ${path.basename(request.path)} as ${data?.to ? path.basename(data.to) : 'a copy'}.`;
  }
}

export const duplicatePathPlugin = new DuplicatePathPlugin();
