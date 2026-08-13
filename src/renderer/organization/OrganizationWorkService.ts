import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { RuntimeEntitlementId } from '../../shared/billing/BillingTypes';
import type { OrganizationMember } from '../../shared/organization/OrganizationTypes';
import type { WorkspaceProject } from '../../shared/organization/WorkspaceContentTypes';
import type { WorkspaceProjectMember } from '../../shared/organization/WorkspaceTaskTypes';
import {
  allocateWorkItem,
  buildAdminOrganizationWorkOverview,
  buildAssignedWorkExecutionHandoff,
  buildMemberWorkView,
  buildTeamWorkQueue,
  buildWorkNotification,
  canMemberViewWorkItem,
} from '../../shared/organization/WorkOperatingSystem';
import type {
  AdminOrganizationWorkOverview,
  AssignedWorkExecutionHandoff,
  MemberWorkView,
  OrganizationTeam,
  OrganizationWorkItem,
  TeamWorkQueue,
  WorkAllocationMode,
  WorkAssignmentNotification,
} from '../../shared/organization/WorkOperatingSystemTypes';
import { getSupabaseClient } from '../auth/supabaseClient';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { activityDashboardService } from './ActivityDashboardService';
import { organizationService } from './OrganizationService';
import { permissionService } from './PermissionService';
import { workspaceContentService } from './WorkspaceContentService';
import { workspaceTaskService } from './WorkspaceTaskService';

const WORK_ALLOCATION_POLICY_KEY = 'work_allocation';

type TeamRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  lead_user_id: string | null;
  member_user_ids: string[] | null;
  role_refs: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toTeam(row: TeamRow): OrganizationTeam {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    leadUserId: row.lead_user_id,
    memberUserIds: row.member_user_ids ?? [],
    roleRefs: row.role_refs ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWorkItem(task: Awaited<ReturnType<typeof workspaceTaskService.listTasks>>[number]): OrganizationWorkItem {
  return {
    ...task,
    kind: (task.taskType === 'code_review' || task.taskType === 'deployment' ? 'general' : task.taskType) as OrganizationWorkItem['kind'],
    teamId: task.teamId ?? null,
    dependencyTaskIds: task.dependencyTaskIds ?? [],
    requiredRuntime: (task.requiredRuntime ?? null) as RuntimeEntitlementId | null,
    verificationRequirements: task.verificationRequirements ?? [],
    allocationMode: task.allocationMode ?? 'manual',
    assignmentReason: task.assignmentReason ?? null,
    assignedBy: task.assignedBy ?? null,
  };
}

async function notify(notification: WorkAssignmentNotification): Promise<void> {
  await ipc.companionShowNotification(notification.title, notification.body).catch(() => false);
}

export const organizationWorkService = {
  async listTeams(organizationId: string): Promise<OrganizationTeam[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_teams')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })
      .returns<TeamRow[]>();
    if (error) throw error;
    return (data ?? []).map(toTeam);
  },

  async createTeam(organizationId: string, name: string, options: { description?: string; leadUserId?: string; memberUserIds?: string[]; roleRefs?: string[] } = {}): Promise<OrganizationTeam> {
    const allowed = await permissionService.hasCapability(organizationId, 'work.plan.manage');
    if (!allowed) throw new Error('You do not have permission to manage organization work plans.');
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_teams')
      .insert({
        organization_id: organizationId,
        name,
        description: options.description ?? null,
        lead_user_id: options.leadUserId ?? null,
        member_user_ids: options.memberUserIds ?? [],
        role_refs: options.roleRefs ?? [],
        created_by: userData.user?.id ?? null,
      })
      .select('*')
      .single<TeamRow>();
    if (error) throw error;
    return toTeam(data);
  },

  async getAllocationMode(organizationId: string): Promise<WorkAllocationMode> {
    const policies = await permissionService.listPolicies(organizationId);
    const value = policies.find((policy) => policy.policyKey === WORK_ALLOCATION_POLICY_KEY)?.policyValue;
    return value?.mode === 'pawos_assisted' ? 'pawos_assisted' : 'manual';
  },

  async setAllocationMode(organizationId: string, mode: WorkAllocationMode): Promise<void> {
    const allowed = await permissionService.hasCapability(organizationId, 'work.allocate.pawos');
    if (!allowed) throw new Error('Only authorized organization admins can enable PawOS-assisted assignment.');
    await permissionService.setPolicy(organizationId, WORK_ALLOCATION_POLICY_KEY, { mode });
  },

  async listWorkItemsForOrganization(organizationId: string): Promise<OrganizationWorkItem[]> {
    const tasks = await workspaceTaskService.listTasksForOrganization(organizationId);
    return tasks.map(toWorkItem);
  },

  async createWorkItem(
    organizationId: string,
    workspaceId: string,
    title: string,
    options: {
      projectId?: string;
      description?: string;
      teamId?: string;
      requiredRuntime?: RuntimeEntitlementId;
      dependencyTaskIds?: string[];
      assignedTo?: string;
      dueAt?: string;
      kind?: OrganizationWorkItem['kind'];
      verificationRequirements?: OrganizationWorkItem['verificationRequirements'];
    } = {}
  ): Promise<OrganizationWorkItem> {
    const task = await workspaceTaskService.createTask(organizationId, workspaceId, title, {
      projectId: options.projectId,
      description: options.description,
      teamId: options.teamId,
      requiredRuntime: options.requiredRuntime,
      dependencyTaskIds: options.dependencyTaskIds,
      assignedTo: options.assignedTo,
      dueAt: options.dueAt,
      taskType: options.kind ?? 'general',
      verificationRequirements: options.verificationRequirements,
    });
    return toWorkItem(task);
  },

  async createBugWorkItem(organizationId: string, workspaceId: string, title: string, options: { projectId?: string; description?: string; teamId?: string; assignedTo?: string } = {}): Promise<OrganizationWorkItem> {
    return organizationWorkService.createWorkItem(organizationId, workspaceId, title, { ...options, kind: 'bug', verificationRequirements: [{ id: 'reproduction', description: 'Reproduction information is attached or described.', required: true }] });
  },

  async manuallyAssignWorkItem(taskId: string, assigneeUserId: string, item: OrganizationWorkItem, assignedBy: string | null): Promise<WorkAssignmentNotification> {
    const allowed = await permissionService.hasCapability(item.organizationId, 'work.assign');
    if (!allowed) throw new Error('You do not have permission to assign organization work.');
    await workspaceTaskService.assignTaskWithContext(taskId, assigneeUserId, assignedBy, 'manual', 'Manual assignment by an authorized organization member.');
    const notification = buildWorkNotification('work_assigned', { ...item, assignedTo: assigneeUserId, assignedBy, allocationMode: 'manual' }, assigneeUserId);
    await notify(notification);
    return notification;
  },

  async pawosAssignNextReadyWork(input: {
    organizationId: string;
    workItem: OrganizationWorkItem;
    runtimeEntitlementsByUserId: Map<string, Set<RuntimeEntitlementId>>;
    assignedBy: string | null;
  }): Promise<WorkAssignmentNotification | null> {
    const mode = await organizationWorkService.getAllocationMode(input.organizationId);
    if (mode === 'manual') return null;
    const [items, members, teams] = await Promise.all([
      organizationWorkService.listWorkItemsForOrganization(input.organizationId),
      organizationService.getMembers(input.organizationId),
      organizationWorkService.listTeams(input.organizationId),
    ]);
    const decision = allocateWorkItem({
      mode,
      workItem: input.workItem,
      allWorkItems: items,
      members,
      teams,
      runtimeEntitlementsByUserId: input.runtimeEntitlementsByUserId,
    });
    if (!decision.ok) return null;
    await workspaceTaskService.assignTaskWithContext(input.workItem.id, decision.assignedMemberUserId, input.assignedBy, 'pawos_assisted', decision.reason);
    await notify(decision.notification);
    return decision.notification;
  },

  buildTeamQueue(teamId: string, items: OrganizationWorkItem[]): TeamWorkQueue {
    return buildTeamWorkQueue(teamId, items);
  },

  buildMyWork(memberUserId: string, items: OrganizationWorkItem[]): MemberWorkView {
    return buildMemberWorkView(memberUserId, items);
  },

  canViewWorkItem(member: OrganizationMember, item: OrganizationWorkItem, projectMembers: WorkspaceProjectMember[], teams: OrganizationTeam[]): boolean {
    return canMemberViewWorkItem(member, item, projectMembers, teams);
  },

  forwardAssignedWorkToPawOS(context: {
    memberUserId: string;
    item: OrganizationWorkItem;
    allItems: OrganizationWorkItem[];
    canViewWorkItem: boolean;
    hasRequiredRuntime: boolean;
    hasUsageAvailable: boolean;
    request: ActionRequest;
    execute: (request: ActionRequest) => Promise<ActionResult>;
  }): Promise<ActionResult | AssignedWorkExecutionHandoff> {
    const handoff = buildAssignedWorkExecutionHandoff({
      memberUserId: context.memberUserId,
      workItem: context.item,
      allWorkItems: context.allItems,
      canViewWorkItem: context.canViewWorkItem,
      hasRequiredRuntime: context.hasRequiredRuntime,
      hasUsageAvailable: context.hasUsageAvailable,
      request: context.request,
    });
    if (!handoff.ok) return Promise.resolve(handoff);
    return context.execute(handoff.request);
  },

  async getAdminOverview(organizationId: string): Promise<AdminOrganizationWorkOverview> {
    const [members, teams, projects, items, summary] = await Promise.all([
      organizationService.getMembers(organizationId),
      organizationWorkService.listTeams(organizationId).catch(() => []),
      workspaceContentService.listProjectsForOrganization(organizationId).catch((): WorkspaceProject[] => []),
      organizationWorkService.listWorkItemsForOrganization(organizationId),
      activityDashboardService.getSummary(organizationId),
    ]);
    return buildAdminOrganizationWorkOverview({
      organizationId,
      members,
      teams,
      projects,
      items,
      activity: [],
      usage: { usedUnits: summary.creditsUsedThisPeriod, remainingUnits: summary.creditsRemaining },
    });
  },
};
