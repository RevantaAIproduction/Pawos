import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { generateAltTextForImage } from '../../../shared/ai/analyzeUiReference';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Asset Intelligence — real accessibility alt-text via vision analysis of the actual image, never invented. `apiKey` is always injected by ConversationRuntime right before execution. */
export class GenerateAltTextPlugin extends BasePlugin {
  id = 'generateAltText';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'generateAltText';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'generateAltText') return [];
    if (!fs.existsSync(request.path)) {
      return [{ id: 'path-missing', message: `I can't find "${request.path}" — which image did you mean?` }];
    }
    if (!request.apiKey) {
      return [{ id: 'no-gemini-key', message: 'Alt-text generation needs a Gemini API key configured first.' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'generateAltText') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.apiKey) return { ok: false, reason: 'failed', message: 'No Gemini API key configured.' };

    const mimeType = MIME_BY_EXT[path.extname(request.path).toLowerCase()];
    if (!mimeType) return { ok: false, reason: 'failed', message: `Unsupported image type for "${request.path}".` };

    try {
      const buffer = await fs.promises.readFile(request.path);
      const imageDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
      const altText = await generateAltTextForImage({ apiKey: request.apiKey, imageDataUrl });
      return { ok: true, data: { altText } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'generateAltText') return 'Working on that…';
    return `Writing alt text for ${path.basename(request.path)}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'generateAltText') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { altText?: string } | undefined;
    return data?.altText ? `Alt text for ${path.basename(request.path)}: "${data.altText}"` : `I've written alt text for ${path.basename(request.path)}.`;
  }
}

export const generateAltTextPlugin = new GenerateAltTextPlugin();
