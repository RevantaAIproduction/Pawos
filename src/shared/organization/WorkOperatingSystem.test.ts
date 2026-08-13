import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '../actions/ActionTypes';
import type { OrganizationMember } from './OrganizationTypes';
import type { WorkspaceProject } from './WorkspaceContentTypes';
import type { WorkspaceProjectMember } from './WorkspaceTaskTypes';
import {
  allocateWorkItem,
  assertFactualActivity,
  buildAdminOrganizationWorkOverview,
  buildAssignedWorkExecutionHandoff,
  buildMemberWorkView,
  buildProjectActivityHistory,
  buildTeamWorkQueue,
  buildWorkNotification,
  canMemberViewWorkItem,
  dependenciesSatisfied,
  projectActivityFromExecution,
} from './WorkOperatingSystem';
import type { OrganizationTeam, OrganizationWorkItem } from './WorkOperatingSystemTypes';

const now = '2026-08-11T10:00:00.000Z';

function member(partial: Partial<OrganizationMember> & { userId: string; email?: string }): OrganizationMember {
  return {
    id: `member-${partial.userId}`,
    organizationId: partial.organizationId ?? 'org-1',
    userId: partial.userId,
    email: partial.email ?? `${partial.userId}@acme.test`,
    displayName: null,
    role: partial.role ?? 'member',
    status: partial.status ?? 'active',
    invitedAt: now,
    joinedAt: now,
    seatTier: null,
    jobRoleRef: partial.jobRoleRef ?? null,
  };
}

function workItem(partial: Partial<OrganizationWorkItem> & { id: string; title?: string }): OrganizationWorkItem {
  return {
    id: partial.id,
    organizationId: partial.organizationId ?? 'org-1',
    workspaceId: partial.workspaceId ?? 'workspace-1',
    projectId: partial.projectId ?? 'project-1',
    title: partial.title ?? partial.id,
    description: partial.description ?? null,
    status: partial.status ?? 'todo',
    progressPercent: partial.progressPercent ?? 0,
    assignedTo: partial.assignedTo ?? null,
    dueAt: partial.dueAt ?? null,
    createdBy: partial.createdBy ?? 'admin-1',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    taskType: partial.taskType ?? 'general',
    repositoryId: partial.repositoryId ?? null,
    prNumber: partial.prNumber ?? null,
    kind: partial.kind ?? 'general',
    teamId: partial.teamId ?? 'team-dev',
    dependencyTaskIds: partial.dependencyTaskIds ?? [],
    requiredRuntime: partial.requiredRuntime ?? null,
    verificationRequirements: partial.verificationRequirements ?? [],
    allocationMode: partial.allocationMode ?? 'manual',
    assignmentReason: partial.assignmentReason ?? null,
    assignedBy: partial.assignedBy ?? null,
  };
}

const devTeam: OrganizationTeam = {
  id: 'team-dev',
  organizationId: 'org-1',
  name: 'Development Team',
  description: null,
  leadUserId: 'lead-1',
  memberUserIds: ['dev-1', 'dev-2'],
  roleRefs: ['builtin:frontend_engineer'],
  createdBy: 'admin-1',
  createdAt: now,
  updatedAt: now,
};

describe('WorkOperatingSystem foundation', () => {
  it('blocks downstream work until dependencies are completed, then queues it as ready', () => {
    const architecture = workItem({ id: 'architecture', status: 'done' });
    const development = workItem({ id: 'development', dependencyTaskIds: ['architecture'], status: 'todo' });
    const qa = workItem({ id: 'qa', dependencyTaskIds: ['development'], status: 'todo' });

    expect(dependenciesSatisfied(qa, [architecture, development, qa])).toBe(false);
    expect(buildTeamWorkQueue('team-dev', [architecture, development, qa]).waiting.map((item) => item.id)).toEqual(['qa']);

    const completedDevelopment = { ...development, status: 'done' as const };
    expect(dependenciesSatisfied(qa, [architecture, completedDevelopment, qa])).toBe(true);
    expect(buildTeamWorkQueue('team-dev', [architecture, completedDevelopment, qa]).ready.map((item) => item.id)).toEqual(['qa']);
  });

  it('keeps manual assignment as the default and never auto-assigns there', () => {
    const decision = allocateWorkItem({
      mode: 'manual',
      workItem: workItem({ id: 'oauth-testing', requiredRuntime: 'coding' }),
      allWorkItems: [],
      members: [member({ userId: 'tester-2' })],
      teams: [devTeam],
      runtimeEntitlementsByUserId: new Map([['tester-2', new Set(['coding'])]]),
      nowIso: now,
    });

    expect(decision).toEqual({
      ok: false,
      reason: 'manual-mode',
      message: 'Manual assignment mode is active. PawOS will not choose a member automatically.',
    });
  });

  it('lets PawOS-assisted allocation choose only an eligible member and sends a factual notification', () => {
    const decision = allocateWorkItem({
      mode: 'pawos_assisted',
      workItem: workItem({ id: 'oauth-implementation', requiredRuntime: 'coding', allocationMode: 'pawos_assisted' }),
      allWorkItems: [workItem({ id: 'busy-work', assignedTo: 'dev-1', status: 'in_progress' })],
      members: [member({ userId: 'dev-1' }), member({ userId: 'dev-2' })],
      teams: [devTeam],
      runtimeEntitlementsByUserId: new Map([
        ['dev-1', new Set(['coding'])],
        ['dev-2', new Set(['coding'])],
      ]),
      nowIso: now,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.assignedMemberUserId).toBe('dev-2');
    expect(decision.reason).toContain('eligible for coding');
    expect(decision.notification.title).toBe('You have been assigned: oauth-implementation');
  });

  it('does not invent availability when team information is missing', () => {
    const decision = allocateWorkItem({
      mode: 'pawos_assisted',
      workItem: workItem({ id: 'qa-retest', teamId: 'team-empty', requiredRuntime: 'coding' }),
      allWorkItems: [],
      members: [member({ userId: 'dev-1' })],
      teams: [{ ...devTeam, id: 'team-empty', leadUserId: null, memberUserIds: [] }],
      runtimeEntitlementsByUserId: new Map([['dev-1', new Set(['coding'])]]),
      nowIso: now,
    });

    expect(decision).toMatchObject({ ok: false, reason: 'insufficient-information' });
  });

  it('builds member views for assigned, active, blocked, and completed work', () => {
    const view = buildMemberWorkView('dev-1', [
      workItem({ id: 'assigned', assignedTo: 'dev-1' }),
      workItem({ id: 'progress', assignedTo: 'dev-1', status: 'in_progress' }),
      workItem({ id: 'blocked', assignedTo: 'dev-1', status: 'blocked' }),
      workItem({ id: 'done', assignedTo: 'dev-1', status: 'done' }),
      workItem({ id: 'other', assignedTo: 'dev-2' }),
    ]);

    expect(view.assigned.map((item) => item.id)).toEqual(['assigned']);
    expect(view.inProgress.map((item) => item.id)).toEqual(['progress']);
    expect(view.blocked.map((item) => item.id)).toEqual(['blocked']);
    expect(view.completed.map((item) => item.id)).toEqual(['done']);
    expect(view.waitingForNextAssignment).toBe(false);
  });

  it('uses organization/project/team visibility and rejects other organizations', () => {
    const item = workItem({ id: 'shared', assignedTo: 'dev-1' });
    const projectMembers: WorkspaceProjectMember[] = [
      { id: 'pm-1', projectId: 'project-1', organizationId: 'org-1', userId: 'qa-1', role: 'member', addedBy: 'admin-1', createdAt: now },
    ];

    expect(canMemberViewWorkItem(member({ userId: 'qa-1' }), item, projectMembers, [devTeam])).toBe(true);
    expect(canMemberViewWorkItem(member({ userId: 'lead-1' }), item, [], [devTeam])).toBe(true);
    expect(canMemberViewWorkItem(member({ userId: 'admin-1', role: 'organizationAdministrator' }), item, [], [])).toBe(true);
    expect(canMemberViewWorkItem(member({ userId: 'outsider', organizationId: 'org-2' }), item, projectMembers, [devTeam])).toBe(false);
  });

  it('forwards assigned work only as a DesktopExecutionEngine handoff after auth, runtime, and usage checks', () => {
    const request: ActionRequest = { type: 'analyzeProjectStructure', rootPath: 'C:/repo' };
    const assigned = workItem({ id: 'start-task', assignedTo: 'dev-1', requiredRuntime: 'coding' });

    expect(
      buildAssignedWorkExecutionHandoff({
        memberUserId: 'dev-1',
        workItem: assigned,
        allWorkItems: [assigned],
        canViewWorkItem: true,
        hasRequiredRuntime: true,
        hasUsageAvailable: true,
        request,
      })
    ).toEqual({ ok: true, executeWith: 'DesktopExecutionEngine.execute', workItemId: 'start-task', request });

    expect(
      buildAssignedWorkExecutionHandoff({
        memberUserId: 'dev-1',
        workItem: assigned,
        allWorkItems: [assigned],
        canViewWorkItem: true,
        hasRequiredRuntime: false,
        hasUsageAvailable: true,
        request,
      })
    ).toMatchObject({ ok: false, reason: 'runtime-entitlement-required' });

    expect(
      buildAssignedWorkExecutionHandoff({
        memberUserId: 'dev-1',
        workItem: assigned,
        allWorkItems: [assigned],
        canViewWorkItem: true,
        hasRequiredRuntime: true,
        hasUsageAvailable: false,
        request,
      })
    ).toMatchObject({ ok: false, reason: 'usage-limit-reached', message: 'Paw Compute limit reached for your organization. Contact your administrator.' });
  });

  it('keeps private conversations out of shared project activity and records factual history only', () => {
    expect(() => assertFactualActivity('Developer 1 changed src/auth/oauth.ts')).not.toThrow();
    expect(() => assertFactualActivity('Developer 1 is a bad employee')).toThrow(/factual activity/);

    const history = buildProjectActivityHistory([
      {
        id: 'private',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        projectId: null,
        workItemId: null,
        actorUserId: 'dev-1',
        visibility: 'private_conversation',
        kind: 'prompt',
        summary: 'Private prompt',
        createdAt: now,
      },
      {
        id: 'project',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        workItemId: 'task-1',
        actorUserId: 'dev-1',
        visibility: 'organization_project',
        kind: 'changed_file',
        summary: 'Changed: src/auth/oauth.ts',
        filePath: 'src/auth/oauth.ts',
        linesAdded: 24,
        linesDeleted: 8,
        createdAt: now,
      },
    ]);

    expect(history.map((event) => event.id)).toEqual(['project']);
  });

  it('derives factual project activity from existing execution records', () => {
    const events = projectActivityFromExecution({
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      workItemId: 'task-1',
      visibility: 'organization_project',
      record: {
        id: 'exec-1',
        goal: 'Add the Google OAuth environment variable.',
        status: 'completed',
        startedAt: Date.parse(now),
        completedAt: Date.parse(now) + 1000,
        durationMs: 1000,
        applicationsUsed: [],
        aiWorkersUsed: [],
        commandsExecuted: [],
        filesCreated: [],
        filesModified: ['src/auth/oauth.ts'],
        verificationResults: [{ description: 'npm test', ok: true }],
        recoveryAttempts: 0,
        timeline: [],
        summary: 'Configured OAuth.',
      },
    });

    expect(events.map((event) => event.kind)).toEqual(['prompt', 'changed_file', 'validation']);
  });

  it('builds admin overview without employment judgements', () => {
    const project: WorkspaceProject = {
      id: 'project-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      name: 'OAuth',
      description: null,
      status: 'active',
      ownerUserId: 'admin-1',
      createdBy: 'admin-1',
      createdAt: now,
      updatedAt: now,
    };

    const overview = buildAdminOrganizationWorkOverview({
      organizationId: 'org-1',
      members: [member({ userId: 'admin-1', role: 'organizationAdministrator' }), member({ userId: 'dev-1' })],
      teams: [devTeam],
      projects: [project],
      items: [workItem({ id: 'bug', kind: 'bug', status: 'blocked', assignedTo: 'dev-1' })],
      activity: [],
      usage: { usedUnits: 184, remainingUnits: 0 },
    });

    expect(overview.totalMembers).toBe(2);
    expect(overview.totalTeams).toBe(1);
    expect(overview.workCountsByStatus.blocked).toBe(1);
    expect(overview.organizationUsage.exhausted).toBe(true);
    expect(overview.memberReports[1]!.currentWork.map((item) => item.id)).toEqual(['bug']);
  });

  it('formats required desktop notifications for manual and PawOS-assisted work', () => {
    const notification = buildWorkNotification('usage_limit_reached', workItem({ id: 'usage' }), 'dev-1', now);
    expect(notification.title).toBe('Organization Paw Compute is exhausted.');
    expect(notification.body).toBe('Paw Compute limit reached for your organization. Contact your administrator.');
  });
});
