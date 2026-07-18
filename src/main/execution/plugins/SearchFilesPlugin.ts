import * as fs from 'fs';
import * as path from 'path';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { fileContentMatches } from './contentScan';
import { fuzzyRank } from './fuzzyMatch';

const MAX_SEARCH_RESULTS = 200;
const MAX_SEARCH_DEPTH = 6;
// Content/date/size filtering means every candidate needs a stat() call —
// bounded separately from MAX_SEARCH_RESULTS so a broad query over a huge
// tree can't stall the app indefinitely.
const MAX_CANDIDATES_EXAMINED = 5000;

type SearchCriteria = {
  query: string;
  contentQuery?: string;
  extensions?: string[];
  modifiedAfter?: number;
  modifiedBefore?: number;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  fuzzy?: boolean;
  maxResults?: number;
};

async function matchesCriteria(fullPath: string, isDirectory: boolean, criteria: SearchCriteria): Promise<boolean> {
  const name = path.basename(fullPath);
  if (!criteria.fuzzy && criteria.query && !name.toLowerCase().includes(criteria.query.toLowerCase())) return false;

  if (criteria.extensions?.length) {
    if (isDirectory) return false;
    const ext = path.extname(fullPath).toLowerCase();
    if (!criteria.extensions.some((e) => e.toLowerCase() === ext)) return false;
  }

  if (criteria.modifiedAfter || criteria.modifiedBefore || criteria.minSizeBytes || criteria.maxSizeBytes) {
    if (isDirectory) return false;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch {
      return false;
    }
    if (criteria.modifiedAfter && stat.mtimeMs < criteria.modifiedAfter) return false;
    if (criteria.modifiedBefore && stat.mtimeMs > criteria.modifiedBefore) return false;
    if (criteria.minSizeBytes && stat.size < criteria.minSizeBytes) return false;
    if (criteria.maxSizeBytes && stat.size > criteria.maxSizeBytes) return false;
  }

  if (criteria.contentQuery) {
    if (isDirectory) return false;
    if (!(await fileContentMatches(fullPath, criteria.contentQuery))) return false;
  }

  return true;
}

async function searchFiles(rootPath: string, criteria: SearchCriteria): Promise<string[]> {
  const results: string[] = [];
  const fuzzyCandidates: string[] = [];
  let examined = 0;
  const maxResults = criteria.maxResults ?? MAX_SEARCH_RESULTS;

  async function walk(dir: string, depth: number) {
    if (results.length >= maxResults || examined >= MAX_CANDIDATES_EXAMINED || depth > MAX_SEARCH_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults || examined >= MAX_CANDIDATES_EXAMINED) return;
      examined += 1;
      const full = path.join(dir, entry.name);
      const isDirectory = entry.isDirectory();

      if (criteria.fuzzy) {
        if (!isDirectory) fuzzyCandidates.push(full);
      } else if (await matchesCriteria(full, isDirectory, criteria)) {
        results.push(full);
      }
      if (isDirectory) await walk(full, depth + 1);
    }
  }

  await walk(rootPath, 0);

  if (criteria.fuzzy) {
    const ranked = fuzzyRank(fuzzyCandidates, criteria.query, (c) => path.basename(c));
    for (const candidate of ranked) {
      if (results.length >= maxResults) break;
      if (await matchesCriteria(candidate, false, { ...criteria, fuzzy: false, query: '' })) results.push(candidate);
    }
  }

  return results;
}

export class SearchFilesPlugin extends BasePlugin {
  id = 'searchFiles';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'searchFiles';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'searchFiles') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const matches = await searchFiles(request.rootPath, {
      query: request.query,
      contentQuery: request.contentQuery,
      extensions: request.extensions,
      modifiedAfter: request.modifiedAfter,
      modifiedBefore: request.modifiedBefore,
      minSizeBytes: request.minSizeBytes,
      maxSizeBytes: request.maxSizeBytes,
      fuzzy: request.fuzzy,
      maxResults: request.maxResults,
    });
    return { ok: true, data: matches };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'searchFiles') return 'Working on that…';
    return `Searching for "${request.query}"…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    if (request.type !== 'searchFiles') return 'Done.';
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return count === 0
      ? `I didn't find anything matching "${request.query}".`
      : `Found ${count} match${count === 1 ? '' : 'es'} for "${request.query}".`;
  }
}

export const searchFilesPlugin = new SearchFilesPlugin();
