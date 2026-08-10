import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { classifyProjectAssets, type AssetKind } from '../AssetClassifier';

// Caps how many individual image entries are returned in the result payload — counts by kind cover
// the overview, this is only for surfacing real width/height data on a representative sample,
// mirroring FeatureMapBuilder's MAX_FILES_PER_FEATURE cap discipline rather than dumping every file.
const MAX_IMAGES_RETURNED = 50;

/**
 * Asset Understanding Engine (Coding Runtime V2, §11) — deterministic, extension/exact-name asset
 * classification (image/stylesheet/config/markdown/buildFile/sourceCode/test/other), no AI call.
 * Read-only from the target project's perspective; available in both Paw Go and Paw Pro, same as
 * analyze_project_structure and discover_project_features.
 */
export class ClassifyProjectAssetsPlugin extends BasePlugin {
  id = 'classifyProjectAssets';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'classifyProjectAssets';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'classifyProjectAssets') return [];
    if (!fs.existsSync(request.rootPath)) {
      return [{ id: 'root-missing', message: `I can't find the folder "${request.rootPath}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'classifyProjectAssets') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.rootPath)) return { ok: false, reason: 'failed', message: `"${request.rootPath}" doesn't exist.` };

    try {
      const { assets, truncated } = classifyProjectAssets(request.rootPath);
      const countsByKind: Record<AssetKind, number> = {
        image: 0,
        stylesheet: 0,
        config: 0,
        markdown: 0,
        buildFile: 0,
        sourceCode: 0,
        test: 0,
        other: 0,
      };
      for (const asset of assets) countsByKind[asset.kind] += 1;

      const imagesWithMetadata = assets.filter((a) => a.kind === 'image' && a.imageMetadata);

      return {
        ok: true,
        data: {
          root: request.rootPath,
          totalFiles: assets.length,
          truncated,
          countsByKind,
          images: imagesWithMetadata.slice(0, MAX_IMAGES_RETURNED).map((a) => ({
            path: a.path,
            width: a.imageMetadata?.width,
            height: a.imageMetadata?.height,
            type: a.imageMetadata?.type,
          })),
          imagesTruncated: imagesWithMetadata.length > MAX_IMAGES_RETURNED,
        },
      };
    } catch (err) {
      return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Failed to classify project assets.' };
    }
  }

  describeInProgress(): string {
    return 'Looking at what kinds of files this project contains…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'classifyProjectAssets') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { totalFiles: number; countsByKind: Record<string, number> } | undefined;
    if (!data) return 'Done.';
    const parts = Object.entries(data.countsByKind)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([kind, count]) => `${count} ${kind}`);
    return `Looked at ${data.totalFiles} file${data.totalFiles === 1 ? '' : 's'} — ${parts.join(', ')}.`;
  }
}

export const classifyProjectAssetsPlugin = new ClassifyProjectAssetsPlugin();
