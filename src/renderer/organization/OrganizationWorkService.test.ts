import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { OrganizationMember } from '../../shared/organization/OrganizationTypes';
import type { OrganizationWorkItem } from '../../shared/organization/WorkOperatingSystemTypes';

const mocks = vi.hoisted(() => ({
  hasCapability: vi.fn(),
  listPolicies: vi.fn(),
  setPolicy: vi.fn(),
  assignTaskWithContext: vi.fn(),
  listTasksForOrganization: vi.fn(),
  getMembers: vi.fn(),
  listProjectsForOrganization: vi.fn(),
  getSummary: vi.fn(),
  companionShowNotification: vi.fn(),
}));

vi.mock('./PermissionService', () => ({
  permissionService: {
    hasCapability: mocks.hasCapability,
    listPolicies: mocks.listPolicies,
    setPolicy: mocks.setPolicy,
  },
}));

vi.mock('./WorkspaceTaskService', () => ({
  workspaceTaskService: {
    assignTaskWithContext: mocks.assignTaskWithContext,
    listTasksForOrganization: mocks.listTasksForOrganization,
  },
}));

vi.mock('./OrganizationService', () => ({
  organizationService: {
    getMembers: mocks.getMembers,
  },
}));

vi.mock('./WorkspaceContentService', () => ({
  workspaceContentService: {
    listProjectsForOrganization: mocks.listProjectsForOrganization,
  },
}));

vi.mock('./ActivityDashboardService', () => ({
  activityDashboardService: {
    getSummary: mocks.getSummary,
  },
}));

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({
  ipc: {
    companionShowNotification: mocks.companionShowNotification,
  },
}));

vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: vi.fn(),
}));

import { organizationWorkService } from './OrganizationWorkService';

const now = '2026-08-11T10:00:00.000Z';

function item(partial: Partial<OrganizationWorkItem> & { id: string }): OrganizationWorkItem {
  return {
    id: partial.id,
    organizationId: 'org-1',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    title: partial.title ?? partial.id,
    description: partial.description ?? null,
    status: partial.status ?? 'todo',
    progressPercent: 0,
    assignedTo: partial.assignedTo ?? null,
    dueAt: null,
    createdBy: 'admin-1',
    createdAt: now,
    updatedAt: now,
    taskType: 'general',
    repositoryId: null,
    prNumber: null,
    kind: partial.kind ?? 'general',
    teamId: partial.teamId ?? null,
    dependencyTaskIds: partial.dependencyTaskIds ?? [],
    requiredRuntime: partial.requiredRuntime ?? null,
    verificationRequirements: [],
    allocationMode: partial.allocationMode ?? 'manual',
    assignmentReason: partial.assignmentReason ?? null,
    assignedBy: partial.assignedBy ?? null,
  };
}

function member(userId: string): OrganizationMember {
  return {
    id: `member-${userId}`,
    organizationId: 'org-1',
    userId,
    email: `${userId}@acme.test`,
    displayName: null,
    role: 'member',
    status: 'active',
    invitedAt: now,
    joinedAt: now,
    seatTier: null,
    jobRoleRef: null,
  };
}

describe('OrganizationWorkService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasCapability.mockResolvedValue(true);
    mocks.listPolicies.mockResolvedValue([]);
    mocks.setPolicy.mockResolvedValue(undefined);
    mocks.assignTaskWithContext.mockResolvedValue(undefined);
    mocks.listTasksForOrganization.mockResolvedValue([]);
    mocks.getMembers.mockResolvedValue([]);
    mocks.listProjectsForOrganization.mockResolvedValue([]);
    mocks.getSummary.mockResolvedValue({ creditsUsedThisPeriod: 0, creditsRemaining: 100, taskCountsByStatus: {}, taskCountsByAssignee: [], projectCountsByStatus: {}, recentlyUpdatedTasks: [] });
    mocks.companionShowNotification.mockResolvedValue(true);
  });

  it('manual assignment uses existing capability checks, records assignment context, and sends desktop notification', async () => {
    const work = item({ id: 'oauth-testing', title: 'OAuth testing' });

    const notification = await organizationWorkService.manuallyAssignWorkItem(work.id, 'tester-2', work, 'lead-1');

    expect(mocks.hasCapability).toHaveBeenCalledWith('org-1', 'work.assign');
    expect(mocks.assignTaskWithContext).toHaveBeenCalledWith(work.id, 'tester-2', 'lead-1', 'manual', 'Manual assignment by an authorized organization member.');
    expect(mocks.companionShowNotification).toHaveBeenCalledWith('You have been assigned: OAuth testing', expect.stringContaining('OAuth testing'));
    expect(notification.recipientUserId).toBe('tester-2');
  });

  it('does not assign through PawOS when allocation mode remains manual', async () => {
    const work = item({ id: 'oauth-implementation', requiredRuntime: 'coding' });
    mocks.listPolicies.mockResolvedValue([{ policyKey: 'work_allocation', policyValue: { mode: 'manual' } }]);
    mocks.listTasksForOrganization.mockResolvedValue([work]);
    mocks.getMembers.mockResolvedValue([member('dev-1')]);

    const notification = await organizationWorkService.pawosAssignNextReadyWork({
      organizationId: 'org-1',
      workItem: work,
      assignedBy: 'admin-1',
      runtimeEntitlementsByUserId: new Map([['dev-1', new Set(['coding'])]]),
    });

    expect(notification).toBeNull();
    expect(mocks.assignTaskWithContext).not.toHaveBeenCalled();
  });

  it('allows PawOS-assisted assignment only after explicit policy enablement', async () => {
    const work = item({ id: 'oauth-implementation', teamId: 'team-dev', requiredRuntime: 'coding' });
    mocks.listPolicies.mockResolvedValue([{ policyKey: 'work_allocation', policyValue: { mode: 'pawos_assisted' } }]);
    mocks.listTasksForOrganization.mockResolvedValue([work]);
    mocks.getMembers.mockResolvedValue([member('dev-1')]);

    vi.spyOn(organizationWorkService, 'listTeams').mockResolvedValue([
      {
        id: 'team-dev',
        organizationId: 'org-1',
        name: 'Development',
        description: null,
        leadUserId: null,
        memberUserIds: ['dev-1'],
        roleRefs: [],
        createdBy: 'admin-1',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const notification = await organizationWorkService.pawosAssignNextReadyWork({
      organizationId: 'org-1',
      workItem: work,
      assignedBy: 'admin-1',
      runtimeEntitlementsByUserId: new Map([['dev-1', new Set(['coding'])]]),
    });

    expect(notification?.recipientUserId).toBe('dev-1');
    expect(mocks.assignTaskWithContext).toHaveBeenCalledWith(work.id, 'dev-1', 'admin-1', 'pawos_assisted', expect.stringContaining('eligible for coding'));
  });

  it('forwarding assigned work invokes only the supplied execution bridge after local gates pass', async () => {
    const request: ActionRequest = { type: 'analyzeProjectStructure', rootPath: 'C:/repo' };
    const execute = vi.fn().mockResolvedValue({ ok: true, data: { from: 'DesktopExecutionEngine.execute' } });
    const result = await organizationWorkService.forwardAssignedWorkToPawOS({
      memberUserId: 'dev-1',
      item: item({ id: 'start-task', assignedTo: 'dev-1', requiredRuntime: 'coding' }),
      allItems: [item({ id: 'start-task', assignedTo: 'dev-1', requiredRuntime: 'coding' })],
      canViewWorkItem: true,
      hasRequiredRuntime: true,
      hasUsageAvailable: true,
      request,
      execute,
    });

    expect(execute).toHaveBeenCalledWith(request);
    expect(result).toEqual({ ok: true, data: { from: 'DesktopExecutionEngine.execute' } });
  });
});
