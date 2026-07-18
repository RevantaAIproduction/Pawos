import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { DevBrowserConsoleEntry } from '../../../shared/actions/DevBrowserTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { structureExtractionScript } from './ExtractPageStructurePlugin';
import { verifyUiScreenshot } from '../../../shared/ai/analyzeUiReference';

type StructureElement = { rect: { x: number; y: number; width: number; height: number } };
type PageStructure = { viewport: { width: number; height: number }; elements: Record<string, StructureElement[]> };

/** Real bounding-rect math only — never a guess. Flags an element visibly wider than the viewport (horizontal overflow) or a real zero-size element among the structural targets. */
function findStructuralIssues(structure: PageStructure): string[] {
  const issues: string[] = [];
  const { width: viewportWidth } = structure.viewport;
  for (const [selector, elements] of Object.entries(structure.elements)) {
    for (const el of elements) {
      if (el.rect.width > viewportWidth + 5) {
        issues.push(`"${selector}" is wider (${el.rect.width}px) than the viewport (${viewportWidth}px) — likely horizontal overflow.`);
      }
      if (el.rect.width === 0 && el.rect.height === 0) {
        issues.push(`"${selector}" has zero size — it may not be rendering.`);
      }
    }
  }
  return issues;
}

/**
 * Visual Verification — one bounded pass composing already-real primitives
 * (screenshot, console, network, structural measurement, vision analysis)
 * into a single {ok, issues[]} result. Never an autonomous fix loop itself
 * — the model re-verifies after fixing, already bounded by
 * ConversationRuntime's existing MAX_TOOL_ITERATIONS_PER_TURN/
 * MAX_SAME_FAILURE_ATTEMPTS recovery policy. `apiKey` is always injected
 * by ConversationRuntime right before execution.
 */
export class VisualVerificationPlugin extends BasePlugin {
  id = 'verifyRenderedUi';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'verifyRenderedUi';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'verifyRenderedUi') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open — open the preview first." }];
    }
    if (!request.apiKey) {
      return [{ id: 'no-gemini-key', message: 'Visual verification needs a Gemini API key configured first.' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'verifyRenderedUi') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.apiKey) return { ok: false, reason: 'failed', message: 'No Gemini API key configured.' };

    const screenshotResult = await browserRuntime.captureScreenshot(request.sessionId);
    if (!screenshotResult.ok) return { ok: false, reason: 'failed', message: screenshotResult.message };

    const consoleEntries = browserRuntime.getConsoleLog(request.sessionId) ?? [];
    const consoleErrors = (consoleEntries as DevBrowserConsoleEntry[])
      .filter((e) => e.level === 'error')
      .map((e) => e.text);

    let structuralIssues: string[] = [];
    const structureResult = await browserRuntime.evaluate(request.sessionId, structureExtractionScript(undefined));
    if (structureResult.ok) {
      try {
        const structure = JSON.parse(structureResult.value as string) as PageStructure;
        structuralIssues = findStructuralIssues(structure);
      } catch {
        // Structural extraction is a bonus signal here, not required — screenshot/console/vision alone still give a real verification.
      }
    }

    const baseIssues = [...structuralIssues, ...consoleErrors.map((e) => `Console error: ${e}`)];

    // The vision call is isolated from the capture above on purpose: a
    // transient Gemini failure here must never discard a screenshot that
    // was already successfully captured — real workspace evidence should
    // never disappear just because one verification stage failed.
    try {
      const imageDataUrl = `data:image/png;base64,${screenshotResult.base64Png}`;
      const visionResult = await verifyUiScreenshot({
        apiKey: request.apiKey,
        imageDataUrl,
        structuralIssues,
        consoleErrors,
      });
      const allIssues = [...baseIssues, ...visionResult.issues];
      return {
        ok: true,
        data: {
          ok: visionResult.ok && allIssues.length === 0,
          issues: allIssues,
          base64Png: screenshotResult.base64Png,
        },
      };
    } catch (error) {
      return {
        ok: true,
        data: {
          ok: false,
          issues: [...baseIssues, `Visual analysis failed: ${(error as Error).message}`],
          base64Png: screenshotResult.base64Png,
        },
      };
    }
  }

  describeInProgress(): string {
    return 'Checking how the page actually looks…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'verifyRenderedUi') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { ok?: boolean; issues?: string[] } | undefined;
    if (data?.ok) return "I've checked the rendered page — it looks correct.";
    const count = data?.issues?.length ?? 0;
    return `I've checked the rendered page and found ${count} issue${count === 1 ? '' : 's'}.`;
  }
}

export const visualVerificationPlugin = new VisualVerificationPlugin();
