import { crawlSite, type PageFetcher, type CrawledPage } from '../../crawl/SiteCrawler';
import type { UxPageSummary, UxHeadingCounts } from '../../../../shared/intelligence/UxReportTypes';

export type UxEvidence = {
  startUrl: string;
  pagesFailed: number;
  hitCrawlBound: boolean;
  pages: UxPageSummary[];
};

const IMG_PATTERN = /<img\b[^>]*>/gi;
const ALT_ATTR_PATTERN = /\balt\s*=\s*["']([^"']*)["']/i;

/** Fields a real label should describe — excludes hidden/submit/button/image/reset, which aren't "fields needing a label" in the same sense. */
const LABELABLE_FIELD_PATTERN = /<(input|select|textarea)\b[^>]*>/gi;
const TYPE_ATTR_PATTERN = /\btype\s*=\s*["']([^"']*)["']/i;
const UNLABELABLE_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset']);
const ID_ATTR_PATTERN = /\bid\s*=\s*["']([^"']+)["']/i;
const ARIA_LABEL_PATTERN = /\baria-label\s*=\s*["']([^"']+)["']/i;
const ARIA_LABELLEDBY_PATTERN = /\baria-labelledby\s*=\s*["']([^"']+)["']/i;

const LABEL_BLOCK_PATTERN = /<label\b[^>]*>[\s\S]*?<\/label>/gi;
const LABEL_FOR_PATTERN = /\bfor\s*=\s*["']([^"']+)["']/i;

const NAV_PATTERN = /<nav\b|role\s*=\s*["']navigation["']/i;
const LANG_ATTR_PATTERN = /<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i;

const INTERACTIVE_PATTERN = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const TAG_PATTERN = /<[^>]+>/g;

function countHeadings(html: string): UxHeadingCounts {
  const counts: UxHeadingCounts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  for (let level = 1; level <= 6; level++) {
    const pattern = new RegExp(`<h${level}\\b`, 'gi');
    counts[`h${level}` as keyof UxHeadingCounts] = (html.match(pattern) ?? []).length;
  }
  return counts;
}

function countImagesAndAlt(html: string): { imageCount: number; imagesWithAltCount: number } {
  const images = html.match(IMG_PATTERN) ?? [];
  let withAlt = 0;
  for (const img of images) {
    const altMatch = img.match(ALT_ATTR_PATTERN);
    if (altMatch?.[1]?.trim()) withAlt++;
  }
  return { imageCount: images.length, imagesWithAltCount: withAlt };
}

/** Real, deterministic HTML-text analysis (no DOM parser dependency, same discipline as SiteCrawler's link extraction) — a field counts as labeled if it has an id referenced by a `<label for="...">`, sits inside a wrapping `<label>...</label>` block, or carries its own aria-label/aria-labelledby. */
function countFormFieldLabeling(html: string): { formFieldCount: number; labeledFormFieldCount: number } {
  const labeledIds = new Set<string>();
  const labelBlocks: { start: number; end: number }[] = [];
  let labelMatch: RegExpExecArray | null;
  LABEL_BLOCK_PATTERN.lastIndex = 0;
  while ((labelMatch = LABEL_BLOCK_PATTERN.exec(html))) {
    const forMatch = labelMatch[0].match(LABEL_FOR_PATTERN);
    if (forMatch?.[1]) labeledIds.add(forMatch[1]);
    labelBlocks.push({ start: labelMatch.index, end: labelMatch.index + labelMatch[0].length });
  }

  let formFieldCount = 0;
  let labeledFormFieldCount = 0;
  let fieldMatch: RegExpExecArray | null;
  LABELABLE_FIELD_PATTERN.lastIndex = 0;
  while ((fieldMatch = LABELABLE_FIELD_PATTERN.exec(html))) {
    const tag = fieldMatch[0];
    const type = tag.match(TYPE_ATTR_PATTERN)?.[1]?.toLowerCase();
    if (type && UNLABELABLE_TYPES.has(type)) continue;
    formFieldCount++;

    const id = tag.match(ID_ATTR_PATTERN)?.[1];
    const hasForLabel = id ? labeledIds.has(id) : false;
    const hasAriaLabel = Boolean(tag.match(ARIA_LABEL_PATTERN)?.[1]?.trim());
    const hasAriaLabelledby = Boolean(tag.match(ARIA_LABELLEDBY_PATTERN)?.[1]?.trim());
    const isWrappedByLabel = labelBlocks.some((b) => fieldMatch!.index >= b.start && fieldMatch!.index < b.end);

    if (hasForLabel || hasAriaLabel || hasAriaLabelledby || isWrappedByLabel) labeledFormFieldCount++;
  }

  return { formFieldCount, labeledFormFieldCount };
}

/** An interactive element counts as "empty" (inaccessible) only if it has neither visible text content nor an aria-label — a real, common UX/a11y gap, never a guessed one. */
function countEmptyInteractiveElements(html: string): number {
  let count = 0;
  let match: RegExpExecArray | null;
  INTERACTIVE_PATTERN.lastIndex = 0;
  while ((match = INTERACTIVE_PATTERN.exec(html))) {
    const attrs = match[2] ?? '';
    const inner = match[3] ?? '';
    const hasAriaLabel = Boolean(attrs.match(ARIA_LABEL_PATTERN)?.[1]?.trim());
    const visibleText = inner.replace(TAG_PATTERN, ' ').trim();
    if (!hasAriaLabel && !visibleText) count++;
  }
  return count;
}

function analyzePage(page: CrawledPage): UxPageSummary {
  const { imageCount, imagesWithAltCount } = countImagesAndAlt(page.html);
  const { formFieldCount, labeledFormFieldCount } = countFormFieldLabeling(page.html);
  return {
    url: page.url,
    headingCounts: countHeadings(page.html),
    imageCount,
    imagesWithAltCount,
    formFieldCount,
    labeledFormFieldCount,
    hasNavLandmark: NAV_PATTERN.test(page.html),
    hasLangAttribute: Boolean(page.html.match(LANG_ATTR_PATTERN)?.[1]?.trim()),
    emptyInteractiveElementCount: countEmptyInteractiveElements(page.html),
  };
}

/**
 * Gathers real evidence for UX Intelligence via SiteCrawler — the same real, bounded,
 * robots.txt-compliant crawl Website Intelligence uses (never a parallel crawler). Deliberately
 * scoped to static HTML structure: real rendered layout/contrast/tap-target checks would need a
 * live browser screenshot (CaptureBrowserScreenshotPlugin/analyzeUiReference), which requires an
 * actual Electron/CDP session and is therefore not part of this always-testable evidence pass —
 * see uxCorrelate.ts's always-firing `visualLayoutGap` finding, which names that limitation
 * honestly rather than silently omitting it.
 */
export async function gatherUxEvidence(
  input: { url: string; maxPages?: number; maxDepth?: number; timeoutBudgetMs?: number },
  fetcher?: PageFetcher
): Promise<UxEvidence> {
  const bounds = {
    maxPages: input.maxPages ?? 1,
    maxDepth: input.maxDepth ?? 0,
    timeoutBudgetMs: input.timeoutBudgetMs ?? 20000,
  };
  const crawl = fetcher ? await crawlSite(input.url, bounds, fetcher) : await crawlSite(input.url, bounds);

  return {
    startUrl: input.url,
    pagesFailed: crawl.failedUrls.length,
    hitCrawlBound: crawl.hitCrawlBound,
    pages: crawl.pages.map(analyzePage),
  };
}
