import Fuse from 'fuse.js';
import type { ParsedSearchIntent, SearchQuery, SearchResult, TimelineScope, UnifiedTimelineEntry } from '../../shared/communication/CommunicationTypes';
import { communicationTimelineStore } from './CommunicationTimelineStore';
import { communicationSessionStore } from './CommunicationSessionStore';
import { communicationIntelligenceStore } from './CommunicationIntelligenceStore';
import { communicationSearchIndexStore } from './CommunicationSearchIndexStore';

/**
 * Advanced Search (architecture doc §19) — two stages. Natural-language
 * parsing (this file's `parseSearchIntent`, same responseSchema-constrained
 * JSON discipline as analyzeUiReference.ts) only ever extracts filters, it
 * never performs the search itself. Execution always narrows by structured
 * filters FIRST, then fuzzy-scores full text WITHIN that narrowed set —
 * never the other way around.
 */
export async function parseSearchIntent(params: {
  apiKey: string;
  query: string;
  knownParticipants: { id: string; name: string }[];
  knownCompanies: { id: string; name: string }[];
  knownProjects: { id: string; name: string }[];
  model?: string;
  baseUrl?: string;
}): Promise<ParsedSearchIntent> {
  const { apiKey, query, knownParticipants, knownCompanies, knownProjects, model = 'gemini-flash-latest', baseUrl = 'https://generativelanguage.googleapis.com/v1beta' } = params;

  const prompt = `Parse this natural-language search query about the user's past communications (meetings, calls, voice notes, emails, messages) into structured filters plus full-text search terms. Query: "${query}"

Known participants: ${knownParticipants.map((p) => `${p.name} (id: ${p.id})`).join(', ') || 'none'}
Known companies: ${knownCompanies.map((c) => `${c.name} (id: ${c.id})`).join(', ') || 'none'}
Known projects: ${knownProjects.map((p) => `${p.name} (id: ${p.id})`).join(', ') || 'none'}

Only set participantId/companyId/projectId if the query clearly names one of the KNOWN entities above (use its exact id) — never invent an id. Only set a dateRange if the query implies one (e.g. "last month", "this week") — resolve it to real millisecond timestamps relative to now (${Date.now()}). fullTextTerms are the remaining meaningful keywords (e.g. topic words like "pricing," "budget") — never the participant/company/project names already captured as filters.`;

  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            participantId: { type: 'string' },
            companyId: { type: 'string' },
            projectId: { type: 'string' },
            dateFrom: { type: 'number' },
            dateTo: { type: 'number' },
            fullTextTerms: { type: 'array', items: { type: 'string' } },
          },
          required: ['fullTextTerms'],
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Search intent parsing failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as any;
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let parsed: { participantId?: string; companyId?: string; projectId?: string; dateFrom?: number; dateTo?: number; fullTextTerms?: string[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Search intent parsing returned an unexpected response.');
  }

  const filters: TimelineScope = {};
  if (parsed.participantId) filters.participantId = parsed.participantId;
  if (parsed.companyId) filters.companyId = parsed.companyId;
  if (parsed.projectId) filters.projectId = parsed.projectId;
  if (typeof parsed.dateFrom === 'number' && typeof parsed.dateTo === 'number') filters.dateRange = { from: parsed.dateFrom, to: parsed.dateTo };

  return {
    filters,
    fullTextTerms: Array.isArray(parsed.fullTextTerms) ? parsed.fullTextTerms.map(String) : [],
    originalQuery: query,
  };
}

/** Real source text behind one timeline entry — transcript + summary + notes + headline, whatever exists — used both for keyword scoring and for extracting a real matched excerpt (never a fabricated one). */
function sourceTextFor(entry: UnifiedTimelineEntry): string {
  if (entry.kind === 'followUp') return entry.headline;
  const record = communicationSessionStore.get(entry.id);
  if (!record) return entry.headline;
  const parts = [entry.headline];
  if (record.transcriptPath) {
    const transcript = communicationSessionStore.readTextFile(record.transcriptPath);
    if (transcript) parts.push(transcript);
  }
  if (record.bodyPath) {
    const body = communicationSessionStore.readTextFile(record.bodyPath);
    if (body) parts.push(body);
  }
  const summary = communicationIntelligenceStore.getSummary(record.id);
  if (summary) parts.push(summary.summary, ...summary.keyPoints);
  return parts.join('\n');
}

function excerptAround(text: string, term: string, radius = 80): string | null {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Execution (architecture doc §19.2/§19.3): structured filters narrow the
 * candidate set first (cheap), then full-text terms score/rank within that
 * narrowed set. If there are no full-text terms, structured-filtered
 * results are returned as-is, newest first. `apiKey` is optional — omitted
 * means natural-language parsing is skipped and `query.text` is treated as
 * plain full-text terms directly (the fallback path, §19.3).
 */
export async function searchCommunications(query: SearchQuery, apiKey?: string): Promise<SearchResult[]> {
  let filters: TimelineScope = query.filters ?? {};
  let fullTextTerms: string[] = [];

  if (query.text?.trim()) {
    if (apiKey) {
      try {
        const parsed = await parseSearchIntent({
          apiKey,
          query: query.text,
          knownParticipants: [], // resolved lazily by caller via CommunicationRuntime if needed — kept simple/fast here
          knownCompanies: [],
          knownProjects: [],
        });
        filters = { ...parsed.filters, ...query.filters }; // explicit filters always win over parsed ones
        fullTextTerms = parsed.fullTextTerms;
      } catch {
        // Fallback (§19.3): parsing failed for any reason — treat the whole query as a keyword search rather than losing the search entirely.
        fullTextTerms = [query.text];
      }
    } else {
      fullTextTerms = [query.text];
    }
  }

  const candidates = communicationTimelineStore.getTimeline(filters);
  if (fullTextTerms.length === 0) {
    return candidates.map((entry) => ({ entry, matchedExcerpt: null, score: 1 }));
  }

  const searchText = fullTextTerms.join(' ');
  const withText = candidates.map((entry) => ({ entry, text: sourceTextFor(entry) }));
  const fuse = new Fuse(withText, { keys: ['text'], includeScore: true, threshold: 0.4, ignoreLocation: true });
  const ranked = fuse.search(searchText);

  const communicationResults = ranked.map((r) => {
    const matchTerm = fullTextTerms.find((t) => r.item.text.toLowerCase().includes(t.toLowerCase())) ?? fullTextTerms[0];
    return {
      entry: r.item.entry,
      matchedExcerpt: excerptAround(r.item.text, matchTerm ?? searchText),
      score: 1 - (r.score ?? 0),
    };
  });

  // Cross-entity search (§19, "search across meetings, calls, emails,
  // voice notes, action items, decisions, companies, contacts") — real
  // rows from the persisted index/search.db, not a live reconstruction.
  // Kept as a separate fuzzy pass rather than folded into `candidates`
  // above, since contacts/companies aren't scoped by TimelineScope the
  // same way communications are.
  const indexCandidates = communicationSearchIndexStore.list().filter((e) => e.kind === 'contact' || e.kind === 'company' || e.kind === 'actionItem' || e.kind === 'decision');
  const indexFuse = new Fuse(indexCandidates, { keys: ['text', 'headline'], includeScore: true, threshold: 0.4, ignoreLocation: true });
  const indexRanked = indexFuse.search(searchText);
  const indexResults = indexRanked.map((r) => {
    const matchTerm = fullTextTerms.find((t) => r.item.text.toLowerCase().includes(t.toLowerCase())) ?? fullTextTerms[0];
    const entry: UnifiedTimelineEntry = {
      kind: r.item.kind,
      id: r.item.id,
      occurredAt: r.item.occurredAt,
      medium: r.item.kind,
      participants: [],
      companyIds: [],
      projectIds: [],
      headline: r.item.headline,
      relatedCommunicationId: r.item.communicationId,
    };
    return { entry, matchedExcerpt: excerptAround(r.item.text, matchTerm ?? searchText), score: 1 - (r.score ?? 0) };
  });

  return [...communicationResults, ...indexResults].sort((a, b) => b.score - a.score);
}
