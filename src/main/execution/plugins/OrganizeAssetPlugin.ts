import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { onFileCreated } from '../../memory/entities/fileEntities';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.ico']);
const FONT_EXT = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.avi']);

/** Plain, honest extension-based routing — a real classification decision the user shouldn't have to make themselves, not an AI guess about ambiguous cases. */
function subfolderFor(ext: string): string {
  const lower = ext.toLowerCase();
  if (IMAGE_EXT.has(lower)) return path.join('public', 'images');
  if (FONT_EXT.has(lower)) return path.join('public', 'fonts');
  if (VIDEO_EXT.has(lower)) return path.join('public', 'videos');
  return path.join('public', 'assets');
}

function findFreeName(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

/**
 * Asset Intelligence — places a dropped-in asset into a sensible project
 * subpath by real file type (images/fonts/videos/other), never asking
 * the user where it belongs since the routing is unambiguous. Always a
 * copy, never a move — the user's original file is never touched.
 */
export class OrganizeAssetPlugin extends BasePlugin {
  id = 'organizeAsset';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'organizeAsset';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'organizeAsset') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which asset did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'organizeAsset') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const ext = path.extname(request.path);
    const targetDir = path.join(request.projectRoot, subfolderFor(ext));

    try {
      await fs.promises.mkdir(targetDir, { recursive: true });
      const outputPath = findFreeName(targetDir, path.basename(request.path));
      await fs.promises.copyFile(request.path, outputPath);
      onFileCreated(outputPath);
      return { ok: true, data: { outputPath } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'organizeAsset' || !result.ok) return result;
    const data = result.data as { outputPath?: string } | undefined;
    if (!data?.outputPath || !fs.existsSync(data.outputPath)) {
      return { ok: false, reason: 'failed', message: 'The asset reported organized, but the new file doesn’t exist — something went wrong.' };
    }
    return result;
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'organizeAsset') return 'Working on that…';
    return `Organizing ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'organizeAsset') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { outputPath?: string } | undefined;
    return `I've placed ${path.basename(request.path)} in ${data?.outputPath ? path.relative(request.projectRoot, data.outputPath) : 'the project'}.`;
  }
}

export const organizeAssetPlugin = new OrganizeAssetPlugin();
