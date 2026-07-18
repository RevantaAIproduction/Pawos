import { memoryGraphStore, type Entity } from '../MemoryGraphStore';

export type ComparisonCandidate = { name: string; url: string; values: Record<string, string | number> };
export type ComparisonAttributes = {
  topic: string;
  candidates: ComparisonCandidate[];
  ranking: string[];
  recommendation: string;
};

function findComparisonByTopic(topic: string): Entity | undefined {
  const target = topic.trim().toLowerCase();
  return memoryGraphStore.queryEntities({ type: 'comparison', where: (a) => (a as ComparisonAttributes).topic.trim().toLowerCase() === target })[0];
}

/**
 * The Comparison Engine's output — real structured values Paw actually
 * extracted from each candidate's page (never invented), normalized
 * enough to rank, plus the ranking and recommendation that came from
 * reasoning over those real values. Matched and updated by topic so
 * re-running the same comparison later (prices change) versions the same
 * entity instead of piling up duplicates — same convention as every other
 * Memory Graph entity in this app.
 */
export function recordComparison(topic: string, candidates: ComparisonCandidate[], ranking: string[], recommendation: string): Entity {
  const existing = findComparisonByTopic(topic);
  return memoryGraphStore.upsertEntity(
    'comparison',
    { topic, candidates, ranking, recommendation },
    { id: existing?.id, changeType: existing ? 'modified' : 'created' }
  );
}

export function getComparison(topic: string): Entity | undefined {
  return findComparisonByTopic(topic);
}
