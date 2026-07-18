import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { onFileCreated } from '../../memory/entities/fileEntities';

const DEFAULT_WIDTHS = [480, 768, 1280, 1920];

/** Asset Intelligence — real resized copies at standard breakpoint widths via sharp, always new derived files, never overwriting the original. Skips a width wider than the source image's real size rather than upscaling. */
export class GenerateResponsiveVariantsPlugin extends BasePlugin {
  id = 'generateResponsiveVariants';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'generateResponsiveVariants';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'generateResponsiveVariants') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which image did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'generateResponsiveVariants') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const widths = request.widths?.length ? request.widths : DEFAULT_WIDTHS;
    const outputDir = request.outputDir ?? path.dirname(request.path);
    const ext = path.extname(request.path);
    const base = path.basename(request.path, ext);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp');
      await fs.promises.mkdir(outputDir, { recursive: true });
      const sourceMeta = await sharp(request.path).metadata();
      const sourceWidth = sourceMeta.width ?? Infinity;

      const outputPaths: string[] = [];
      for (const width of widths) {
        if (width >= sourceWidth) continue; // never upscale past the real source resolution
        const outputPath = path.join(outputDir, `${base}-${width}w${ext}`);
        await sharp(request.path).resize(width).toFile(outputPath);
        onFileCreated(outputPath);
        outputPaths.push(outputPath);
      }

      if (outputPaths.length === 0) {
        return { ok: true, data: { outputPaths: [], skippedReason: 'The source image is already at or below every requested width — nothing to generate.' } };
      }
      return { ok: true, data: { outputPaths } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'generateResponsiveVariants') return 'Working on that…';
    return `Generating responsive sizes for ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'generateResponsiveVariants') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { outputPaths?: string[] } | undefined;
    return `I've generated ${data?.outputPaths?.length ?? 0} responsive size${data?.outputPaths?.length === 1 ? '' : 's'} of ${path.basename(request.path)}.`;
  }
}

export const generateResponsiveVariantsPlugin = new GenerateResponsiveVariantsPlugin();
