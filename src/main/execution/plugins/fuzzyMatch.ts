import Fuse from 'fuse.js';

/** Fuzzy-ranks candidate paths against a query by their basename — used when a request sets `fuzzy: true` instead of requiring an exact substring match. */
export function fuzzyRank(candidates: string[], query: string, getLabel: (candidate: string) => string): string[] {
  const fuse = new Fuse(candidates, { keys: [], getFn: (c) => getLabel(c), threshold: 0.4 });
  return fuse.search(query).map((r) => r.item);
}
