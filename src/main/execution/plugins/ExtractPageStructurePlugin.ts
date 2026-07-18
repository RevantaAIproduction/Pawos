import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

/**
 * Real computed-style/bounding-box/breakpoint extraction for URL
 * Intelligence — sibling of ExtractPageDataPlugin's extractionScript,
 * same browserRuntime.evaluate() primitive, but reading design-language
 * signals (colors, fonts, spacing, layout) instead of text content.
 * Real getComputedStyle/getBoundingClientRect/cssRules values only —
 * never a guess at what a page "probably" looks like.
 */
export function structureExtractionScript(selectors: string[] | undefined): string {
  return `
    (function() {
      function describeElement(el) {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          color: cs.color,
          background: cs.backgroundColor,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          padding: cs.padding,
          margin: cs.margin,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
        };
      }

      const selectors = ${JSON.stringify(selectors ?? null)};
      const targets = selectors && selectors.length > 0
        ? selectors
        : ['header', 'nav', 'main', 'section', 'footer', '.card', 'button', 'form', 'h1', 'h2'];

      const elements = {};
      for (const sel of targets) {
        try {
          elements[sel] = Array.from(document.querySelectorAll(sel)).slice(0, 20).map(describeElement);
        } catch (e) {
          elements[sel] = [];
        }
      }

      const breakpoints = [];
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules;
          try {
            rules = sheet.cssRules;
          } catch (e) {
            continue; // cross-origin stylesheet — can't read its rules, skip honestly rather than fail the whole extraction
          }
          for (const rule of Array.from(rules || [])) {
            if (rule.media && rule.conditionText) breakpoints.push(rule.conditionText);
            else if (rule.media) breakpoints.push(rule.media.mediaText);
          }
        }
      } catch (e) {
        // stylesheet access can throw for other reasons too — real breakpoints found so far are still returned
      }

      return JSON.stringify({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        elements,
        breakpoints: Array.from(new Set(breakpoints)).slice(0, 30),
      });
    })()
  `;
}

export class ExtractPageStructurePlugin extends BasePlugin {
  id = 'extractPageStructure';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'extractPageStructure';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'extractPageStructure') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'extractPageStructure') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await browserRuntime.evaluate(request.sessionId, structureExtractionScript(request.selectors));
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };

    let data: unknown;
    try {
      data = JSON.parse(result.value as string);
    } catch {
      return { ok: false, reason: 'failed', message: 'Could not parse the extracted page structure.' };
    }
    return { ok: true, data: { url: browserRuntime.getCurrentUrl(request.sessionId), structure: data } };
  }

  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'extractPageStructure' || result.ok) return result;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return this.execute(request);
  }

  describeInProgress(): string {
    return "Analyzing the page's design and layout…";
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'extractPageStructure') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've analyzed the page's structure and design." : describeFailure(result);
  }
}

export const extractPageStructurePlugin = new ExtractPageStructurePlugin();
