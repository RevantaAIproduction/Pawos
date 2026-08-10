import { crawlSite, httpPageFetcher, type PageFetcher, type CrawledPage } from '../../crawl/SiteCrawler';
import type { MarketingPageSummary } from '../../../../shared/intelligence/MarketingReportTypes';

export type MarketingEvidence = {
  startUrl: string;
  pagesFailed: number;
  hitCrawlBound: boolean;
  sitemapFound: boolean;
  pages: MarketingPageSummary[];
};

const OG_META_PATTERN = /<meta[^>]+property=["']og:(?:title|description|image)["']/i;
const TWITTER_CARD_PATTERN = /<meta[^>]+name=["']twitter:card["']/i;
const STRUCTURED_DATA_PATTERN = /<script[^>]+type=["']application\/ld\+json["']/i;
const FAVICON_PATTERN = /<link[^>]+rel=["'](?:shortcut icon|icon)["']/i;
const MAILTO_OR_TEL_PATTERN = /href=["'](?:mailto|tel):/i;

const SCRIPT_OR_STYLE_PATTERN = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi;
const TAG_PATTERN = /<[^>]+>/g;

/** Known third-party tracking signatures — matched against raw HTML (script src/inline snippets), same regex-over-real-fetch discipline as SiteCrawler's link extraction. */
const ANALYTICS_SIGNATURES: { id: string; pattern: RegExp }[] = [
  { id: 'google-analytics', pattern: /google-analytics\.com\/analytics\.js|gtag\(['"]config|googletagmanager\.com\/gtag/i },
  { id: 'google-tag-manager', pattern: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/ },
  { id: 'facebook-pixel', pattern: /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(['"]init/i },
  { id: 'hotjar', pattern: /static\.hotjar\.com/i },
  { id: 'segment', pattern: /cdn\.segment\.com/i },
  { id: 'mixpanel', pattern: /cdn\.mxpnl\.com/i },
];

const SOCIAL_DOMAINS = ['facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'tiktok.com'];

const CTA_KEYWORDS = [
  'sign up',
  'get started',
  'buy now',
  'contact us',
  'book a demo',
  'start free trial',
  'subscribe now',
  'request a demo',
  'try for free',
  'add to cart',
];

function extractVisibleText(html: string): string {
  return html.replace(SCRIPT_OR_STYLE_PATTERN, ' ').replace(TAG_PATTERN, ' ').toLowerCase();
}

function countCtaKeywords(visibleText: string): number {
  let count = 0;
  for (const keyword of CTA_KEYWORDS) {
    const pattern = new RegExp(keyword.replace(/\s+/g, '\\s+'), 'gi');
    count += (visibleText.match(pattern) ?? []).length;
  }
  return count;
}

function detectAnalytics(html: string): string[] {
  return ANALYTICS_SIGNATURES.filter((sig) => sig.pattern.test(html)).map((sig) => sig.id);
}

function detectSocialLinks(html: string): string[] {
  const found: string[] = [];
  for (const domain of SOCIAL_DOMAINS) {
    const pattern = new RegExp(`href=["'][^"']*${domain.replace('.', '\\.')}`, 'i');
    if (pattern.test(html)) found.push(domain);
  }
  return found;
}

function analyzePage(page: CrawledPage): MarketingPageSummary {
  return {
    url: page.url,
    hasOpenGraphTags: OG_META_PATTERN.test(page.html),
    hasTwitterCardTags: TWITTER_CARD_PATTERN.test(page.html),
    hasStructuredData: STRUCTURED_DATA_PATTERN.test(page.html),
    analyticsDetected: detectAnalytics(page.html),
    ctaKeywordCount: countCtaKeywords(extractVisibleText(page.html)),
    socialLinks: detectSocialLinks(page.html),
    hasContactInfo: MAILTO_OR_TEL_PATTERN.test(page.html),
    hasFavicon: FAVICON_PATTERN.test(page.html),
  };
}

/**
 * Gathers real evidence for Marketing Intelligence via SiteCrawler — the same real, bounded,
 * robots.txt-compliant crawl Website/UX Intelligence use (never a parallel crawler), plus one real
 * extra fetch of /sitemap.xml (via the same httpPageFetcher, no separate implementation). Scoped
 * to static HTML/response structure: dynamically-injected marketing tooling (chat widgets,
 * personalization, A/B test variants, analytics loaded via a later JS bundle) isn't captured — see
 * marketingCorrelate.ts's always-firing `jsRenderedMarketingGap` finding, which names that
 * limitation honestly rather than silently omitting it.
 */
export async function gatherMarketingEvidence(
  input: { url: string; maxPages?: number; maxDepth?: number; timeoutBudgetMs?: number },
  fetcher?: PageFetcher
): Promise<MarketingEvidence> {
  const bounds = {
    maxPages: input.maxPages ?? 1,
    maxDepth: input.maxDepth ?? 0,
    timeoutBudgetMs: input.timeoutBudgetMs ?? 20000,
  };
  const activeFetcher = fetcher ?? httpPageFetcher;
  const crawl = await crawlSite(input.url, bounds, activeFetcher);

  const origin = new URL(input.url).origin;
  const sitemapResult = await activeFetcher.fetch(`${origin}/sitemap.xml`);
  const sitemapFound = sitemapResult.ok && sitemapResult.statusCode < 400;

  return {
    startUrl: input.url,
    pagesFailed: crawl.failedUrls.length,
    hitCrawlBound: crawl.hitCrawlBound,
    sitemapFound,
    pages: crawl.pages.map(analyzePage),
  };
}
