import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { onFileCreated } from '../../memory/entities/fileEntities';

/** Never overwrites the source — appends a suffix, and if that's somehow already taken, appends a counter until it finds a real free name. */
function defaultOutputPath(sourcePath: string, format: 'jpeg' | 'webp'): string {
  const ext = format === 'jpeg' ? '.jpg' : '.webp';
  const dir = path.dirname(sourcePath);
  const base = path.basename(sourcePath, path.extname(sourcePath));
  let candidate = path.join(dir, `${base}.optimized${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}.optimized-${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

/** Asset Intelligence — real image compression via sharp, always to a new derived file, never overwriting the original. */
export class OptimizeImagePlugin extends BasePlugin {
  id = 'optimizeImage';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'optimizeImage';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'optimizeImage') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which image did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'optimizeImage') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const format = request.format ?? 'webp';
    const quality = request.quality ?? 80;
    const outputPath = request.outputPath ?? defaultOutputPath(request.path, format);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp');
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await sharp(request.path)
        .toFormat(format, { quality })
        .toFile(outputPath);
      onFileCreated(outputPath);
      const beforeBytes = (await fs.promises.stat(request.path)).size;
      const afterBytes = (await fs.promises.stat(outputPath)).size;
      return { ok: true, data: { outputPath, beforeBytes, afterBytes } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'optimizeImage' || !result.ok) return result;
    const data = result.data as { outputPath?: string } | undefined;
    if (!data?.outputPath || !fs.existsSync(data.outputPath)) {
      return { ok: false, reason: 'failed', message: 'The optimized image reported success, but the file doesn’t exist — something went wrong.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'optimizeImage') return 'Working on that…';
    return `Optimizing ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'optimizeImage') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { outputPath?: string; beforeBytes?: number; afterBytes?: number } | undefined;
    const savings = data?.beforeBytes && data?.afterBytes ? Math.round((1 - data.afterBytes / data.beforeBytes) * 100) : null;
    return `I've optimized ${path.basename(request.path)}${savings !== null ? ` (${savings}% smaller)` : ''}.`;
  }
}

export const optimizeImagePlugin = new OptimizeImagePlugin();
