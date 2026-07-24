import Fuse from 'fuse.js';
import type { HelpArticle } from '../../shared/help/HelpArticleTypes';
import { ALL_ARTICLES } from '../../shared/help/articleIndex';

/**
 * Search runs entirely in the renderer over the static, bundle-shipped
 * article corpus — no IPC round-trip is needed since this content never
 * changes at runtime (unlike Communication Runtime's dynamic per-user
 * search, which persists an index store because its content does change).
 */
const fuse = new Fuse<HelpArticle>(ALL_ARTICLES, {
  keys: [
    { name: 'title', weight: 3 },
    { name: 'aliases', weight: 2.5 },
    { name: 'keywords', weight: 2 },
    { name: 'summary', weight: 1.5 },
    { name: 'overview', weight: 1 },
    { name: 'category', weight: 1 },
    { name: 'faq.question', weight: 1 },
    { name: 'faq.answer', weight: 0.5 },
  ],
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
});

export function searchHelpArticles(query: string, limit = 10): HelpArticle[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return fuse.search(trimmed, { limit }).map((r) => r.item);
}
