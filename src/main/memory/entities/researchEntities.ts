import { memoryGraphStore, type Entity } from '../MemoryGraphStore';

export type ResearchStatus = 'in_progress' | 'paused' | 'completed';
export type ResearchTaskAttributes = {
  topic: string;
  status: ResearchStatus;
  findings: string[];
  nextSteps?: string;
  finalReport?: string;
};

function findResearchTaskByTopic(topic: string): Entity | undefined {
  const target = topic.trim().toLowerCase();
  return memoryGraphStore.queryEntities({ type: 'researchTask', where: (a) => (a as ResearchTaskAttributes).topic.trim().toLowerCase() === target })[0];
}

/**
 * "Pause / Resume / Continue / Checkpoint" — long-running research doesn't
 * always fit in one turn (many sources, or the user comes back to it
 * later). Every checkpoint is matched and updated by topic (never
 * duplicated) and, when a new finding is given, appends it to the SAME
 * task's accumulated findings — so resuming later means the next
 * checkpoint keeps building on real prior work instead of starting over
 * or inventing what was already found.
 */
export function checkpointResearch(
  topic: string,
  status: ResearchStatus,
  finding?: string,
  nextSteps?: string,
  finalReport?: string
): Entity {
  const existing = findResearchTaskByTopic(topic);
  const priorFindings = existing ? (existing.attributes as ResearchTaskAttributes).findings : [];
  const findings = finding ? [...priorFindings, finding] : priorFindings;
  return memoryGraphStore.upsertEntity(
    'researchTask',
    { topic, status, findings, nextSteps, finalReport },
    { id: existing?.id, changeType: existing ? 'modified' : 'created' }
  );
}

/** "Where did I leave off?" — resuming a research task starts here: the real accumulated findings and the next step Paw itself noted, never a guess. */
export function getResearchStatus(topic: string): Entity | undefined {
  return findResearchTaskByTopic(topic);
}

export function listResearchTasks(status?: ResearchStatus): Entity[] {
  return memoryGraphStore.queryEntities(
    status ? { type: 'researchTask', where: (a) => (a as ResearchTaskAttributes).status === status } : { type: 'researchTask' }
  );
}
