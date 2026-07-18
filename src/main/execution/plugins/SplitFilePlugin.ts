import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

async function splitFile(sourcePath: string, destPrefix: string, chunkSizeBytes: number): Promise<string[]> {
  await fs.promises.mkdir(path.dirname(destPrefix), { recursive: true });
  const chunkPaths: string[] = [];
  const handle = await fs.promises.open(sourcePath, 'r');
  try {
    const stat = await handle.stat();
    let offset = 0;
    let index = 1;
    while (offset < stat.size) {
      const length = Math.min(chunkSizeBytes, stat.size - offset);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      const chunkPath = `${destPrefix}.${String(index).padStart(3, '0')}`;
      await fs.promises.writeFile(chunkPath, buffer);
      chunkPaths.push(chunkPath);
      offset += length;
      index += 1;
    }
  } finally {
    await handle.close();
  }
  return chunkPaths;
}

/** Splits a file into fixed-size numbered chunks (name.001, name.002, ...). Destructiveness is conditional on the first chunk already existing. */
export class SplitFilePlugin extends BasePlugin {
  id = 'splitFile';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'splitFile';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'splitFile') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'source-missing', message: `I can't find "${request.path}" — which file did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'splitFile') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const firstChunk = `${request.to}.001`;
    const exists = fs.existsSync(firstChunk);
    if (exists && !request.confirmed) {
      return { ok: false, reason: 'requires-confirmation' };
    }

    try {
      const chunks = await splitFile(request.path, request.to, request.chunkSizeBytes);
      return { ok: true, data: { chunks, overwritten: exists } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'splitFile' || !result.ok) return result;
    const data = result.data as { chunks?: string[] } | undefined;
    if (!data?.chunks?.length) {
      return { ok: false, reason: 'failed', message: 'The split reported success, but no chunks were produced.' };
    }
    try {
      const original = await fs.promises.stat(request.path);
      let total = 0;
      for (const chunk of data.chunks) total += (await fs.promises.stat(chunk)).size;
      if (total !== original.size) {
        return { ok: false, reason: 'failed', message: 'The split chunks’ combined size doesn’t match the original file — something went wrong.' };
      }
      return result;
    } catch (error) {
      return { ok: false, reason: 'failed', message: `I split the file but couldn't confirm it afterward: ${(error as Error).message}` };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'splitFile') return 'Working on that…';
    return `Splitting ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'splitFile') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        return `${path.basename(request.to)}.001 already exists. Should I overwrite it?`;
      }
      return describeFailure(result);
    }
    const data = result.data as { chunks?: string[] } | undefined;
    return `I've split ${path.basename(request.path)} into ${data?.chunks?.length ?? 0} chunks.`;
  }
}

export const splitFilePlugin = new SplitFilePlugin();
