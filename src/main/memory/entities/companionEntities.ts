import { memoryGraphStore, type Entity } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';

/**
 * Companion Memory — the same generic Memory Graph every other runtime
 * writes into (see officeEntities.ts/infrastructureEntities.ts for the
 * established upsert-by-natural-key precedent), extended with a real
 * companion-scoped anchor entity plus goals/routines linked to it.
 *
 * Conversations, recent files, and projects are deliberately NOT
 * duplicated here — they already live in ConversationSessionStore and the
 * file/project entity wrappers respectively. A companion can be linked to
 * any existing entity id via linkCompanionToEntity() (e.g. a project the
 * user is working on with this companion), but nothing links itself
 * automatically — that would be fabricated association no runtime today
 * actually has evidence for.
 */

export type CompanionAttributes = { companionId: string; name: string };
export type CompanionGoalAttributes = { companionId: string; text: string; completedAt?: number };
export type CompanionRoutineAttributes = { companionId: string; description: string; cadence?: string };

function findCompanion(companionId: string): Entity | undefined {
  return memoryGraphStore.queryEntities({ type: 'companion', where: (a) => (a as CompanionAttributes).companionId === companionId })[0];
}

/** Ensures the companion's own anchor node exists — every goal/routine/link below is attached to this node. */
export function upsertCompanion(companionId: string, name: string): Entity {
  const existing = findCompanion(companionId);
  return memoryGraphStore.upsertEntity('companion', { companionId, name }, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

export function recordCompanionGoal(companionId: string, text: string): Entity {
  const companion = findCompanion(companionId) ?? upsertCompanion(companionId, companionId);
  const goal = memoryGraphStore.upsertEntity('companionGoal', { companionId, text }, { changeType: 'created' });
  memoryGraphStore.link(goal.id, companion.id, RELATION.BELONGS_TO);
  return goal;
}

export function completeCompanionGoal(goalId: string): Entity | undefined {
  const goal = memoryGraphStore.getEntity(goalId);
  if (!goal || goal.type !== 'companionGoal') return undefined;
  return memoryGraphStore.upsertEntity('companionGoal', { ...(goal.attributes as CompanionGoalAttributes), completedAt: Date.now() }, { id: goalId, changeType: 'modified' });
}

export function listCompanionGoals(companionId: string): Entity[] {
  return memoryGraphStore.queryEntities({ type: 'companionGoal', where: (a) => (a as CompanionGoalAttributes).companionId === companionId });
}

export function recordCompanionRoutine(companionId: string, description: string, cadence?: string): Entity {
  const companion = findCompanion(companionId) ?? upsertCompanion(companionId, companionId);
  const routine = memoryGraphStore.upsertEntity('companionRoutine', { companionId, description, cadence }, { changeType: 'created' });
  memoryGraphStore.link(routine.id, companion.id, RELATION.BELONGS_TO);
  return routine;
}

export function listCompanionRoutines(companionId: string): Entity[] {
  return memoryGraphStore.queryEntities({ type: 'companionRoutine', where: (a) => (a as CompanionRoutineAttributes).companionId === companionId });
}

/** Links an already-existing entity (a project, a file, anything else already in the graph) to this companion — never invented automatically. */
export function linkCompanionToEntity(companionId: string, entityId: string): void {
  const companion = findCompanion(companionId) ?? upsertCompanion(companionId, companionId);
  memoryGraphStore.link(companion.id, entityId, RELATION.RELATES_TO);
}

export type CompanionMemorySummary = {
  goals: { id: string; text: string; completed: boolean }[];
  routines: { id: string; description: string; cadence?: string }[];
  linkedEntityCount: number;
};

export function getCompanionMemorySummary(companionId: string): CompanionMemorySummary {
  const goals = listCompanionGoals(companionId).map((g) => {
    const a = g.attributes as CompanionGoalAttributes;
    return { id: g.id, text: a.text, completed: Boolean(a.completedAt) };
  });
  const routines = listCompanionRoutines(companionId).map((r) => {
    const a = r.attributes as CompanionRoutineAttributes;
    return { id: r.id, description: a.description, cadence: a.cadence };
  });
  const companion = findCompanion(companionId);
  const linkedEntityCount = companion
    ? memoryGraphStore.getAllEdgesFor(companion.id).filter((e) => e.active && e.relation === RELATION.RELATES_TO).length
    : 0;
  return { goals, routines, linkedEntityCount };
}

/** Deletes every goal/routine entity for this companion (not the anchor companion node itself) — backs the Editor's Memory "Reset" action. Supersedes each entity's BELONGS_TO edge first, same discipline as fileEntities.ts, so nothing is left dangling. */
export function resetCompanionMemory(companionId: string): void {
  for (const goal of listCompanionGoals(companionId)) {
    for (const edge of memoryGraphStore.getAllEdgesFor(goal.id)) {
      if (edge.active && edge.fromId === goal.id && edge.relation === RELATION.BELONGS_TO) memoryGraphStore.supersede(edge.id);
    }
    memoryGraphStore.deleteEntity(goal.id);
  }
  for (const routine of listCompanionRoutines(companionId)) {
    for (const edge of memoryGraphStore.getAllEdgesFor(routine.id)) {
      if (edge.active && edge.fromId === routine.id && edge.relation === RELATION.BELONGS_TO) memoryGraphStore.supersede(edge.id);
    }
    memoryGraphStore.deleteEntity(routine.id);
  }
}
