import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { onFileCreated } from '../../memory/entities/fileEntities';

function defaultOutputPath(sourcePath: string): string {
  const dir = path.dirname(sourcePath);
  const ext = path.extname(sourcePath);
  const base = path.basename(sourcePath, ext);
  let candidate = path.join(dir, `${base}.thumb${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}.thumb-${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

/** Asset Intelligence — real resized thumbnail via sharp, always to a new derived file, never overwriting the original. */
export class GenerateThumbnailPlugin extends BasePlugin {
  id = 'generateThumbnail';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'generateThumbnail';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'generateThumbnail') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which image did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'generateThumbnail') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const width = request.width ?? 200;
    const height = request.height ?? 200;
    const outputPath = request.outputPath ?? defaultOutputPath(request.path);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp');
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await sharp(request.path).resize(width, height, { fit: 'cover' }).toFile(outputPath);
      onFileCreated(outputPath);
      return { ok: true, data: { outputPath, width, height } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'generateThumbnail' || !result.ok) return result;
    const data = result.data as { outputPath?: string } | undefined;
    if (!data?.outputPath || !fs.existsSync(data.outputPath)) {
      return { ok: false, reason: 'failed', message: 'The thumbnail reported success, but the file doesn’t exist — something went wrong.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'generateThumbnail') return 'Working on that…';
    return `Generating a thumbnail for ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'generateThumbnail') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { outputPath?: string } | undefined;
    return `I've generated a thumbnail: ${data?.outputPath ? path.basename(data.outputPath) : ''}.`;
  }
}

export const generateThumbnailPlugin = new GenerateThumbnailPlugin();
