import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { analyzeUiReference } from '../../../shared/ai/analyzeUiReference';

/**
 * Reference Intelligence — real Gemini vision analysis of the screenshots/
 * mockups/logos/photos the user has attached this conversation, so Paw
 * can reuse their design LANGUAGE (layout, colors, typography,
 * components) without ever transcribing copyrighted content verbatim.
 * `apiKey`/`imageDataUrls` are always injected by ConversationRuntime
 * right before execution — never model-supplied, since the model can't
 * produce image bytes itself. `imageDataUrls` may hold one image (a
 * specific `imageIndex` the model asked for) or every pending image
 * (the whole attached set, analyzed together as one reference).
 */
export class AnalyzeReferenceImagePlugin extends BasePlugin {
  id = 'analyzeReferenceImage';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeReferenceImage';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeReferenceImage') return [];
    if (!request.apiKey) {
      return [{ id: 'no-gemini-key', message: 'Reference image analysis needs a Gemini API key configured first.' }];
    }
    if (!request.imageDataUrls?.length) {
      return [{ id: 'no-images', message: "There's no reference image attached yet — attach one first." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeReferenceImage') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.apiKey) return { ok: false, reason: 'failed', message: 'No Gemini API key configured.' };
    if (!request.imageDataUrls?.length) return { ok: false, reason: 'failed', message: 'No reference image to analyze.' };

    try {
      const analysis = await analyzeUiReference({ apiKey: request.apiKey, imageDataUrls: request.imageDataUrls });
      return { ok: true, data: analysis };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'analyzeReferenceImage') return 'Looking at the reference image…';
    const count = request.imageDataUrls?.length ?? 1;
    return count > 1 ? `Looking at ${count} reference images…` : 'Looking at the reference image…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'analyzeReferenceImage') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { summary?: string; imageCount?: number } | undefined;
    if (!data?.summary) return "I've analyzed the reference image.";
    return (data.imageCount ?? 1) > 1
      ? `I've looked at all ${data.imageCount} reference images together: ${data.summary}`
      : `I've looked at the reference image: ${data.summary}`;
  }
}

export const analyzeReferenceImagePlugin = new AnalyzeReferenceImagePlugin();
