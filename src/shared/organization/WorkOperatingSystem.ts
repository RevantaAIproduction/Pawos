import type { RuntimeEntitlementId } from '../billing/BillingTypes';
import type { OrgRole, OrganizationMember } from './OrganizationTypes';
import type { WorkspaceProject } from './WorkspaceContentTypes';
import type { WorkspaceProjectMember, WorkspaceTaskStatus } from './WorkspaceTaskTypes';
import type {
  AdminOrganizationWorkOverview,
  AssignedWorkExecutionHandoff,
  ExecutionRecordProjectContext,
  FileChangeHistoryEntry,
  MemberWorkReport,
  MemberWorkView,
  OrganizationProjectActivityEvent,
  OrganizationTeam,
  OrganizationWorkExecutionContext,
  OrganizationWorkItem,
  TeamWorkQueue,
  WorkAllocationDecision,
  WorkAllocationMode,
  WorkAssignmentNotification,
} from './WorkOperatingSystemTypes';

const ADMIN_ROLES: OrgRole[] = [
  'owner',
  'organizationOwner',
  'organizationAdministrator',
  'workspaceAdministrator',
  'departmentManager',
];

const EMPLOYMENT_JUDGEMENT_PATTERNS = [
  /\bgood employee\b/i,
  /\bbad employee\b/i,
  /\bunderperform/i,
  /\bmisuse\b/i,
  /\bwasting compute\b/i,
  /\bshould be replaced\b/i,
  /\bnot fit\b/i,
  /\bsuspicious employee\b/i,
];

export function isAdminOrLeadRole(role: OrgRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function containsEmploymentJudgement(text: string): boolean {
  return EMPLOYMENT_JUDGEMENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function assertFactualActivity(summary: string): void {
  if (containsEmploymentJudgement(summary)) {
    throw new Error('Organization work history can record factual activity only, not employment judgements.');
  }
}

export function dependenciesSatisfied(item: OrganizationWorkItem, allItems: OrganizationWorkItem[]): boolean {
  if (item.dependencyTaskIds.length === 0) return true;
  const byId = new Map(allItems.map((candidate) => [candidate.id, candidate]));
  return item.dependencyTaskIds.every((dependencyId) => byId.get(dependencyId)?.status === 'done');
}

export function isWorkItemReady(item: OrganizationWorkItem, allItems: OrganizationWorkItem[]): boolean {
  return item.status === 'todo' && dependenciesSatisfied(item, allItems);
}

export function buildTeamWorkQueue(teamId: string, items: OrganizationWorkItem[]): TeamWorkQueue {
  const teamItems = items.filter((item) => item.teamId === teamId);
  return {
    teamId,
    ready: teamItems.filter((item) => isWorkItemReady(item, items)),
    inProgress: teamItems.filter((item) => item.status === 'in_progress'),
    blocked: teamItems.filter((item) => item.status === 'blocked'),
    completed: teamItems.filter((item) => item.status === 'done'),
    waiting: teamItems.filter((item) => item.status === 'todo' && !dependenciesSatisfied(item, items)),
  };
}

export function buildMemberWorkView(memberUserId: string, items: OrganizationWorkItem[]): MemberWorkView {
  const mine = items.filter((item) => item.assignedTo === memberUserId);
  return {
    memberUserId,
    assigned: mine.filter((item) => item.status === 'todo' && dependenciesSatisfied(item, items)),
    inProgress: mine.filter((item) => item.status === 'in_progress'),
    blocked: mine.filter((item) => item.status === 'blocked'),
    completed: mine.filter((item) => item.status === 'done'),
    waitingForNextAssignment: mine.filter((item) => item.status !== 'done' && item.status !== 'cancelled').length === 0,
  };
}

export function canMemberViewWorkItem(
  member: OrganizationMember,
  item: OrganizationWorkItem,
  projectMembers: WorkspaceProjectMember[],
  teams: OrganizationTeam[]
): boolean {
  if (member.organizationId !== item.organizationId || member.status !== 'active') return false;
  if (isAdminOrLeadRole(member.role)) return true;
  if (member.userId && (item.assignedTo === member.userId || item.createdBy === member.userId)) return true;
  if (member.userId && item.projectId && projectMembers.some((projectMember) => projectMember.projectId === item.projectId && projectMember.userId === member.userId)) {
    return true;
  }
  if (member.userId && item.teamId) {
    const team = teams.find((candidate) => candidate.id === item.teamId);
    return team?.leadUserId === member.userId || team?.memberUserIds.includes(member.userId) || false;
  }
  return false;
}

export type WorkAllocationInput = {
  mode: WorkAllocationMode;
  workItem: OrganizationWorkItem;
  allWorkItems: OrganizationWorkItem[];
  members: OrganizationMember[];
  teams: OrganizationTeam[];
  runtimeEntitlementsByUserId: Map<string, Set<RuntimeEntitlementId>>;
  nowIso?: string;
};

export function allocateWorkItem(input: WorkAllocationInput): WorkAllocationDecision {
  if (input.mode === 'manual') {
    return { ok: false, reason: 'manual-mode', message: 'Manual assignment mode is active. PawOS will not choose a member automatically.' };
  }
  if (!isWorkItemReady(input.workItem, input.allWorkItems)) {
    return { ok: false, reason: 'not-ready', message: 'This work item is waiting on dependencies or is not in todo status.' };
  }
  if (input.workItem.assignmentReason && containsEmploymentJudgement(input.workItem.assignmentReason)) {
    return { ok: false, reason: 'employment-judgement-rejected', message: 'Assignment reason must use factual project context only.' };
  }

  const activeWorkCounts = new Map<string, number>();
  for (const item of input.allWorkItems) {
    if (!item.assignedTo || item.status === 'done' || item.status === 'cancelled') continue;
    activeWorkCounts.set(item.assignedTo, (activeWorkCounts.get(item.assignedTo) ?? 0) + 1);
  }

  const team = input.workItem.teamId ? input.teams.find((candidate) => candidate.id === input.workItem.teamId) : null;
  const eligibleMembers = input.members
    .filter((member) => member.status === 'active' && member.userId)
    .filter((member) => !team || team.memberUserIds.includes(member.userId!) || team.leadUserId === member.userId)
    .filter((member) => !input.workItem.requiredRuntime || input.runtimeEntitlementsByUserId.get(member.userId!)?.has(input.workItem.requiredRuntime));

  if (team && eligibleMembers.length === 0 && team.memberUserIds.length === 0 && !team.leadUserId) {
    return { ok: false, reason: 'insufficient-information', message: 'The selected team has no known members. Ask the admin who should receive this work.' };
  }
  if (eligibleMembers.length === 0) {
    return { ok: false, reason: 'no-eligible-member', message: 'No active member has the required team membership and runtime entitlement.' };
  }

  const chosen = eligibleMembers.sort((a, b) => {
    const aCount = activeWorkCounts.get(a.userId!) ?? 0;
    const bCount = activeWorkCounts.get(b.userId!) ?? 0;
    if (aCount !== bCount) return aCount - bCount;
    return a.email.localeCompare(b.email);
  })[0]!;
  const now = input.nowIso ?? new Date().toISOString();
  const reason = `Assigned because ${chosen.email} is eligible for ${input.workItem.requiredRuntime ?? 'the requested work'} and has the fewest active assigned work items.`;
  return {
    ok: true,
    workItemId: input.workItem.id,
    assignedMemberUserId: chosen.userId!,
    teamId: input.workItem.teamId,
    role: chosen.jobRoleRef,
    reason,
    allocationMode: 'pawos_assisted',
    createdAt: now,
    notification: buildWorkNotification('work_assigned', input.workItem, chosen.userId!, now),
  };
}

export function buildWorkNotification(
  type: WorkAssignmentNotification['type'],
  item: OrganizationWorkItem,
  recipientUserId: string,
  nowIso = new Date().toISOString()
): WorkAssignmentNotification {
  const titleByType: Record<WorkAssignmentNotification['type'], string> = {
    work_assigned: `You have been assigned: ${item.title}`,
    dependency_ready: `Your dependency is complete: ${item.title}`,
    bug_reported: `QA found a bug in: ${item.title}`,
    work_completed: `Your assigned work has been completed: ${item.title}`,
    waiting_for_assignment: 'You are waiting for your next assignment.',
    usage_limit_reached: 'Organization Paw Compute is exhausted.',
  };
  const bodyByType: Record<WorkAssignmentNotification['type'], string> = {
    work_assigned: item.description ?? item.title,
    dependency_ready: 'This work item is now ready.',
    bug_reported: item.description ?? 'Review the bug work item for reproduction details.',
    work_completed: 'The work item is marked complete.',
    waiting_for_assignment: 'No ready assigned work is available right now.',
    usage_limit_reached: 'Paw Compute limit reached for your organization. Contact your administrator.',
  };
  return {
    id: `${item.id}:${type}:${recipientUserId}:${nowIso}`,
    organizationId: item.organizationId,
    recipientUserId,
    workItemId: item.id,
    type,
    title: titleByType[type],
    body: bodyByType[type],
    createdAt: nowIso,
  };
}

export function buildAssignedWorkExecutionHandoff(context: OrganizationWorkExecutionContext): AssignedWorkExecutionHandoff {
  if (!context.canViewWorkItem) {
    return { ok: false, reason: 'not-authorized', message: 'You do not have access to this organization work item.' };
  }
  if (context.workItem.assignedTo !== context.memberUserId) {
    return { ok: false, reason: 'not-assigned', message: 'This work item is not assigned to you.' };
  }
  if (!isWorkItemReady(context.workItem, context.allWorkItems) && context.workItem.status !== 'in_progress') {
    return { ok: false, reason: 'not-ready', message: 'This work item is waiting on dependencies.' };
  }
  if (context.workItem.requiredRuntime && !context.hasRequiredRuntime) {
    return { ok: false, reason: 'runtime-entitlement-required', message: `${context.workItem.requiredRuntime} Runtime is not enabled for this account.` };
  }
  if (!context.hasUsageAvailable) {
    return { ok: false, reason: 'usage-limit-reached', message: 'Paw Compute limit reached for your organization. Contact your administrator.' };
  }
  return {
    ok: true,
    executeWith: 'DesktopExecutionEngine.execute',
    workItemId: context.workItem.id,
    request: context.request,
  };
}

export function projectActivityFromExecution(context: ExecutionRecordProjectContext): OrganizationProjectActivityEvent[] {
  if (context.visibility !== 'organization_project') return [];
  const record = context.record;
  const base = {
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    workItemId: context.workItemId,
    actorUserId: null,
    visibility: 'organization_project' as const,
    executionRecordId: record.id,
  };
  const events: OrganizationProjectActivityEvent[] = [];
  if (record.goal) {
    events.push({ ...base, id: `${record.id}:prompt`, kind: 'prompt', summary: `Prompt: ${record.goal}`, createdAt: new Date(record.startedAt).toISOString() });
  }
  for (const filePath of record.filesModified) {
    events.push({ ...base, id: `${record.id}:changed:${filePath}`, kind: 'changed_file', filePath, summary: `Changed: ${filePath}`, createdAt: new Date(record.completedAt ?? record.startedAt).toISOString() });
  }
  for (const result of record.verificationResults) {
    events.push({ ...base, id: `${record.id}:validation:${result.description}`, kind: 'validation', summary: `Tests: ${result.ok ? 'Passed' : 'Failed'} - ${result.description}`, createdAt: new Date(record.completedAt ?? record.startedAt).toISOString() });
  }
  return events.map((event) => {
    assertFactualActivity(event.summary);
    return event;
  });
}

export function buildProjectActivityHistory(events: OrganizationProjectActivityEvent[]): OrganizationProjectActivityEvent[] {
  return events
    .filter((event) => event.visibility === 'organization_project')
    .map((event) => {
      assertFactualActivity(event.summary);
      return event;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function buildFileChangeHistory(events: OrganizationProjectActivityEvent[]): FileChangeHistoryEntry[] {
  return buildProjectActivityHistory(events)
    .filter((event) => event.kind === 'changed_file' && event.filePath)
    .map((event) => ({
      filePath: event.filePath!,
      actorUserId: event.actorUserId,
      workItemId: event.workItemId,
      actionSummary: event.summary,
      linesAdded: event.linesAdded ?? 0,
      linesDeleted: event.linesDeleted ?? 0,
      validationStatus: 'not_run',
      createdAt: event.createdAt,
    }));
}

export function buildMemberWorkReport(
  member: OrganizationMember,
  items: OrganizationWorkItem[],
  activity: OrganizationProjectActivityEvent[],
  fileChanges: FileChangeHistoryEntry[]
): MemberWorkReport {
  const userId = member.userId;
  const assignedWork = userId ? items.filter((item) => item.assignedTo === userId) : [];
  return {
    member,
    assignedWork,
    completedWork: assignedWork.filter((item) => item.status === 'done'),
    currentWork: assignedWork.filter((item) => item.status === 'todo' || item.status === 'in_progress' || item.status === 'blocked'),
    projectActivity: userId ? buildProjectActivityHistory(activity).filter((event) => event.actorUserId === userId || assignedWork.some((item) => item.id === event.workItemId)) : [],
    fileChanges: userId ? fileChanges.filter((entry) => entry.actorUserId === userId || assignedWork.some((item) => item.id === entry.workItemId)) : [],
    runtimeUsage: [],
  };
}

export function buildAdminOrganizationWorkOverview(input: {
  organizationId: string;
  members: OrganizationMember[];
  teams: OrganizationTeam[];
  projects: WorkspaceProject[];
  items: OrganizationWorkItem[];
  activity: OrganizationProjectActivityEvent[];
  usage: { usedUnits: number; remainingUnits: number | null };
}): AdminOrganizationWorkOverview {
  const workCountsByStatus: Record<WorkspaceTaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
    cancelled: 0,
  };
  for (const item of input.items) workCountsByStatus[item.status] += 1;
  const fileChanges = buildFileChangeHistory(input.activity);
  return {
    organizationId: input.organizationId,
    totalMembers: input.members.filter((member) => member.status === 'active').length,
    totalTeams: input.teams.length,
    totalProjects: input.projects.length,
    workCountsByStatus,
    waitingWorkCount: input.items.filter((item) => item.status === 'todo' && !dependenciesSatisfied(item, input.items)).length,
    memberReports: input.members.map((member) => buildMemberWorkReport(member, input.items, input.activity, fileChanges)),
    projectActivity: buildProjectActivityHistory(input.activity),
    organizationUsage: {
      ...input.usage,
      exhausted: input.usage.remainingUnits !== null && input.usage.remainingUnits <= 0,
    },
  };
}
