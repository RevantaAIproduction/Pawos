import { memoryGraphStore, type Entity } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';

export type WebPageAttributes = { url: string; title?: string; summary?: string; browser?: string; bookmarked?: boolean; bookmarkLabel?: string };
export type DownloadAttributes = { path: string; sourceUrl?: string };

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function findWebPageByUrl(url: string): Entity | undefined {
  const target = normalizeUrl(url);
  return memoryGraphStore.queryEntities({ type: 'webPage', where: (a) => normalizeUrl((a as WebPageAttributes).url) === target })[0];
}

/**
 * Records a visited page — "every browsing session may create visited
 * pages... referenced sources... everything should become searchable
 * later." One entity per distinct URL (matched loosely, ignoring query
 * string/hash), updated in place on repeat visits rather than duplicated,
 * same precedent as file entities.
 */
export function recordVisitedPage(url: string, title?: string, browser?: string): Entity {
  const existing = findWebPageByUrl(url);
  return memoryGraphStore.upsertEntity(
    'webPage',
    { url, title, browser },
    { id: existing?.id, changeType: existing ? 'modified' : 'created' }
  );
}

/**
 * "Bookmark this page" — a Memory Graph attribute on the page's own
 * webPage entity, deliberately NOT a write into the real browser's actual
 * Bookmarks file (a live JSON file the running browser has open — writing
 * to it directly risks corruption or being silently overwritten). This is
 * Paw's own bookmark list, searchable through the same graph as
 * everything else, not a substitute for the browser's native one.
 */
export function bookmarkPage(url: string, label?: string): Entity {
  const existing = findWebPageByUrl(url) ?? recordVisitedPage(url);
  return memoryGraphStore.upsertEntity(
    'webPage',
    { ...(existing.attributes as WebPageAttributes), url, bookmarked: true, bookmarkLabel: label },
    { id: existing.id, changeType: 'modified' }
  );
}

export function listBookmarkedPages(): Entity[] {
  return memoryGraphStore.queryEntities({ type: 'webPage', where: (a) => (a as WebPageAttributes).bookmarked === true });
}

export type VisitEvent = { url: string; title?: string; browser?: string; visitedAt: number };

/**
 * "Show what I read yesterday" — Paw's own browsing history, built
 * entirely from the Memory Graph's existing append-only entity versioning
 * (every recordVisitedPage call already appends a version event on
 * repeat visits), not a read of the real browser's History file. Real
 * Chromium history is a binary SQLite database requiring native decoding
 * this project deliberately doesn't take on — this is Paw's own honest
 * record of pages IT visited on the user's behalf, which is what every
 * mission example ("what I read", "reuse my login") actually needs.
 */
export function getVisitHistory(since?: number, until?: number, limit = 50): VisitEvent[] {
  const pages = memoryGraphStore.queryEntities({ type: 'webPage' });
  const events: VisitEvent[] = [];
  for (const page of pages) {
    const attrs = page.attributes as WebPageAttributes;
    for (const h of page.history) {
      if (since && h.recordedAt < since) continue;
      if (until && h.recordedAt > until) continue;
      events.push({ url: attrs.url, title: attrs.title, browser: attrs.browser, visitedAt: h.recordedAt });
    }
  }
  return events.sort((a, b) => b.visitedAt - a.visitedAt).slice(0, limit);
}

/**
 * Records a real, verified browser download and links it to the page it
 * came from — the Browser Runtime's half of "Downloads... Relationships"
 * from the mission. File Runtime's own onFileCreated hook is the one that
 * actually classifies/indexes the downloaded file's content (this module
 * never duplicates that) — this only adds the DOWNLOADED_FROM provenance
 * edge a plain file-creation event wouldn't know to add on its own.
 */
export function recordDownload(fileEntityId: string, sourceUrl?: string): void {
  if (!sourceUrl) return;
  const page = findWebPageByUrl(sourceUrl) ?? recordVisitedPage(sourceUrl);
  memoryGraphStore.link(fileEntityId, page.id, RELATION.DOWNLOADED_FROM, {
    confidence: 1,
    evidence: [{ source: 'taskExecution', detail: `Downloaded from ${sourceUrl}` }],
    reasoningSummary: `Downloaded from ${sourceUrl}.`,
  });
}

/**
 * "Remember what you found" — Browser Intelligence's one genuine memory
 * gap: `WebPageAttributes.summary` existed on the type since Phase B but
 * nothing ever wrote it. This lets Paw persist its OWN synthesis of a
 * page's content (after actually reading/extracting it) so a later
 * question about the same page — or a later research task that would
 * otherwise re-browse it — can be answered from memory instead. Distinct
 * from bookmarking (a user-facing marker) and from recordVisitedPage
 * (just a URL/title): this is Paw's own understanding of what the page
 * said, not just that it was visited.
 */
export function recordPageSummary(url: string, summary: string): Entity {
  const existing = findWebPageByUrl(url) ?? recordVisitedPage(url);
  return memoryGraphStore.upsertEntity(
    'webPage',
    { ...(existing.attributes as WebPageAttributes), url, summary },
    { id: existing.id, changeType: 'modified' }
  );
}

export type PageSummaryMatch = { url: string; title?: string; summary?: string; visitedAt: number };

/**
 * "Have I already researched this?" — reuses MemoryGraphStore's existing
 * generic substring search (the same mechanism every other entity type
 * already searches through) rather than inventing a new lookup path, so
 * Paw can check its own memory before re-browsing a page it already read
 * and understood.
 */
export function searchBrowserMemory(query: string): PageSummaryMatch[] {
  return memoryGraphStore
    .search(query, 'webPage')
    .map((e) => {
      const attrs = e.attributes as WebPageAttributes;
      return { url: attrs.url, title: attrs.title, summary: attrs.summary, visitedAt: e.updatedAt };
    })
    .sort((a, b) => b.visitedAt - a.visitedAt);
}
