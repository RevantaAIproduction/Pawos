const DEFAULT_MIN_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 5000;

export type RobotsRules = {
  disallow: string[];
  crawlDelayMs?: number;
};

/**
 * Real robots.txt compliance + per-origin rate limiting — the "consent/rate-limit/robots.txt
 * layer" the architecture calls out as genuinely net-new (nothing like this exists today for
 * unattended multi-page traversal; BrowseWebPlugin's single-navigation confirmation is a
 * different, lighter-weight concern). One instance is scoped to a single crawl run, not shared
 * process-wide — a fresh robots.txt fetch every crawl rather than a stale cross-run cache.
 */
export class RobotsPolicy {
  private rulesByOrigin = new Map<string, RobotsRules>();
  private lastRequestAtByOrigin = new Map<string, number>();

  /** Fetches and parses robots.txt for `origin` (e.g. "https://example.com") — real HTTP, never assumed. A missing/unreachable robots.txt means "no rules found," not "everything disallowed." */
  async loadForOrigin(origin: string): Promise<{ found: boolean }> {
    if (this.rulesByOrigin.has(origin)) return { found: true };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(`${origin}/robots.txt`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        this.rulesByOrigin.set(origin, { disallow: [] });
        return { found: false };
      }
      const text = await response.text();
      this.rulesByOrigin.set(origin, parseRobotsTxt(text));
      return { found: true };
    } catch {
      this.rulesByOrigin.set(origin, { disallow: [] });
      return { found: false };
    }
  }

  /** Whether `url`'s path is allowed to be fetched — real prefix-match against parsed Disallow rules, never a guess. Origins never loaded default to allowed (loadForOrigin must be called first for a real answer). */
  isAllowed(url: string): boolean {
    const { origin, pathname } = new URL(url);
    const rules = this.rulesByOrigin.get(origin);
    if (!rules) return true;
    return !rules.disallow.some((rule) => rule.length > 0 && pathname.startsWith(rule));
  }

  /** Blocks (real setTimeout wait, never a fake instantaneous resolve) until at least the required delay has passed since the last request to this origin — the crawl-delay from robots.txt if one was found, otherwise a conservative default. */
  async waitForRateLimit(origin: string): Promise<void> {
    const minDelayMs = this.rulesByOrigin.get(origin)?.crawlDelayMs ?? DEFAULT_MIN_DELAY_MS;
    const lastRequestAt = this.lastRequestAtByOrigin.get(origin);
    if (lastRequestAt !== undefined) {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < minDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, minDelayMs - elapsed));
      }
    }
    this.lastRequestAtByOrigin.set(origin, Date.now());
  }
}

/**
 * Minimal real robots.txt parser: honors the `*` user-agent group (and PawOS's own group if a
 * site names one), collecting `Disallow`/`Crawl-delay` directives. Never invents a rule the file
 * didn't actually state.
 */
export function parseRobotsTxt(text: string): RobotsRules {
  const disallow: string[] = [];
  let crawlDelayMs: number | undefined;
  let inRelevantGroup = false;
  let sawAnyUserAgentLine = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (!key) continue;

    if (key === 'user-agent') {
      // A new user-agent line starts a new group; relevant if it's "*" or names PawOS.
      inRelevantGroup = value === '*' || value.toLowerCase() === 'pawos';
      sawAnyUserAgentLine = true;
      continue;
    }
    if (!sawAnyUserAgentLine) continue; // directives before any User-agent line are malformed/ignored
    if (!inRelevantGroup) continue;

    if (key === 'disallow' && value) {
      disallow.push(value);
    } else if (key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) crawlDelayMs = seconds * 1000;
    }
  }

  return { disallow, crawlDelayMs };
}
