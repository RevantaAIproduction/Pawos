import { memoryGraphStore, type Entity } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';
import { findCodingProjectByRoot } from './codingProjectEntities';

export type CodingTaskStatus = 'inProgress' | 'completed' | 'blocked';

export type CodingTaskAttributes = {
  taskId: string;
  goal: string;
  projectRoot: string;
  status: CodingTaskStatus;
  commandsExecuted: string[];
  filesModified: string[];
  blockedReason?: string;
  startedAt: number;
  completedAt?: number;
};

function findCodingTaskByTaskId(taskId: string): Entity | undefined {
  return memoryGraphStore.queryEntities({ type: 'codingTask', where: (a) => (a as CodingTaskAttributes).taskId === taskId })[0];
}

function linkTaskToProject(taskEntityId: string, projectRoot: string): void {
  const project = findCodingProjectByRoot(projectRoot);
  if (!project) return;
  memoryGraphStore.link(taskEntityId, project.id, RELATION.BELONGS_TO, {
    confidence: 1,
    evidence: [{ source: 'taskExecution', detail: `Task ran against project root "${projectRoot}"` }],
    reasoningSummary: 'Belongs to this project because the task executed against its root path.',
  });
}

/**
 * Lifecycle hooks matching fileEntities.ts's onFileCreated/Modified/Deleted
 * pattern — one real entity per coding task (matched by the Task Card's own
 * `taskId`, never re-derived), evidence sourced from the same
 * commandsExecuted/filesModified fields ExecutionRecord already tracks.
 * Not yet wired into the live conversation pipeline as of Phase 2.3 — ready
 * for Phase 2.4's TodoProgress/SetTaskChecklistPlugin, which already needs a
 * per-task lifecycle touchpoint, to call these rather than inventing a
 * second one.
 */
export function onCodingTaskStarted(taskId: string, goal: string, projectRoot: string): Entity {
  const attributes: CodingTaskAttributes = {
    taskId,
    goal,
    projectRoot,
    status: 'inProgress',
    commandsExecuted: [],
    filesModified: [],
    startedAt: Date.now(),
  };
  const entity = memoryGraphStore.upsertEntity('codingTask', attributes, { changeType: 'created' });
  linkTaskToProject(entity.id, projectRoot);
  return entity;
}

export function onCodingTaskCompleted(taskId: string, commandsExecuted: string[], filesModified: string[]): Entity | undefined {
  const existing = findCodingTaskByTaskId(taskId);
  if (!existing) return undefined;
  const attrs = existing.attributes as CodingTaskAttributes;
  return memoryGraphStore.upsertEntity(
    'codingTask',
    { ...attrs, status: 'completed', commandsExecuted, filesModified, completedAt: Date.now() },
    { id: existing.id, changeType: 'modified' }
  );
}

export function onCodingTaskBlocked(taskId: string, blockedReason: string): Entity | undefined {
  const existing = findCodingTaskByTaskId(taskId);
  if (!existing) return undefined;
  const attrs = existing.attributes as CodingTaskAttributes;
  return memoryGraphStore.upsertEntity(
    'codingTask',
    { ...attrs, status: 'blocked', blockedReason },
    { id: existing.id, changeType: 'modified' }
  );
}
