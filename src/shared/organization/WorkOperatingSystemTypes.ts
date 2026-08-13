import type { ActionRequest } from '../actions/ActionTypes';
import type { ExecutionRecord } from '../actions/ExecutionRecordTypes';
import type { RuntimeEntitlementId } from '../billing/BillingTypes';
import type { OrganizationMember } from './OrganizationTypes';
import type { WorkspaceProject } from './WorkspaceContentTypes';
import type { WorkspaceTask, WorkspaceTaskStatus } from './WorkspaceTaskTypes';

export type OrganizationTeam = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
  memberUserIds: string[];
  roleRefs: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkAllocationMode = 'manual' | 'pawos_assisted';

export type WorkItemKind = 'general' | 'implementation' | 'qa' | 'bug' | 'retest' | 'production_verification';

export type WorkVerificationRequirement = {
  id: string;
  description: string;
  required: boolean;
};

export type OrganizationWorkItem = WorkspaceTask & {
  kind: WorkItemKind;
  teamId: string | null;
  dependencyTaskIds: string[];
  requiredRuntime: RuntimeEntitlementId | null;
  verificationRequirements: WorkVerificationRequirement[];
  allocationMode: WorkAllocationMode;
  assignmentReason: string | null;
  assignedBy: string | null;
};

export type OrganizationWorkPlanPhase = {
  id: string;
  title: string;
  description: string | null;
  teamIds: string[];
  workItemIds: string[];
  status: WorkspaceTaskStatus;
};

export type OrganizationWorkPlan = {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string;
  requirements: string[];
  goals: string[];
  desiredOutcome: string;
  allocationMode: WorkAllocationMode;
  phases: OrganizationWorkPlanPhase[];
  workItems: OrganizationWorkItem[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamWorkQueue = {
  teamId: string;
  ready: OrganizationWorkItem[];
  inProgress: OrganizationWorkItem[];
  blocked: OrganizationWorkItem[];
  completed: OrganizationWorkItem[];
  waiting: OrganizationWorkItem[];
};

export type MemberWorkView = {
  memberUserId: string;
  assigned: OrganizationWorkItem[];
  inProgress: OrganizationWorkItem[];
  blocked: OrganizationWorkItem[];
  completed: OrganizationWorkItem[];
  waitingForNextAssignment: boolean;
};

export type WorkAssignmentNotification = {
  id: string;
  organizationId: string;
  recipientUserId: string;
  workItemId: string;
  type:
    | 'work_assigned'
    | 'dependency_ready'
    | 'bug_reported'
    | 'work_completed'
    | 'waiting_for_assignment'
    | 'usage_limit_reached';
  title: string;
  body: string;
  createdAt: string;
};

export type WorkAllocationDecision =
  | {
      ok: true;
      workItemId: string;
      assignedMemberUserId: string;
      teamId: string | null;
      role: string | null;
      reason: string;
      allocationMode: 'pawos_assisted';
      createdAt: string;
      notification: WorkAssignmentNotification;
    }
  | {
      ok: false;
      reason:
        | 'manual-mode'
        | 'not-ready'
        | 'no-eligible-member'
        | 'insufficient-information'
        | 'employment-judgement-rejected';
      message: string;
    };

export type OrganizationProjectActivityEvent = {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  workItemId: string | null;
  actorUserId: string | null;
  visibility: 'organization_project' | 'private_conversation';
  kind: 'prompt' | 'opened_file' | 'changed_file' | 'validation' | 'proof' | 'compute' | 'status';
  summary: string;
  filePath?: string;
  linesAdded?: number;
  linesDeleted?: number;
  runtimeId?: RuntimeEntitlementId;
  computeUnits?: number;
  executionRecordId?: string;
  createdAt: string;
};

export type FileChangeHistoryEntry = {
  filePath: string;
  actorUserId: string | null;
  workItemId: string | null;
  actionSummary: string;
  linesAdded: number;
  linesDeleted: number;
  validationStatus: 'passed' | 'failed' | 'not_run';
  createdAt: string;
};

export type MemberWorkReport = {
  member: OrganizationMember;
  assignedWork: OrganizationWorkItem[];
  completedWork: OrganizationWorkItem[];
  currentWork: OrganizationWorkItem[];
  projectActivity: OrganizationProjectActivityEvent[];
  fileChanges: FileChangeHistoryEntry[];
  runtimeUsage: { runtimeId: RuntimeEntitlementId; computeUnits: number }[];
};

export type AdminOrganizationWorkOverview = {
  organizationId: string;
  totalMembers: number;
  totalTeams: number;
  totalProjects: number;
  workCountsByStatus: Record<WorkspaceTaskStatus, number>;
  waitingWorkCount: number;
  memberReports: MemberWorkReport[];
  projectActivity: OrganizationProjectActivityEvent[];
  organizationUsage: {
    usedUnits: number;
    remainingUnits: number | null;
    exhausted: boolean;
  };
};

export type AssignedWorkExecutionHandoff =
  | {
      ok: true;
      executeWith: 'DesktopExecutionEngine.execute';
      workItemId: string;
      request: ActionRequest;
    }
  | {
      ok: false;
      reason: 'not-assigned' | 'not-ready' | 'runtime-entitlement-required' | 'usage-limit-reached' | 'not-authorized';
      message: string;
    };

export type OrganizationWorkExecutionContext = {
  memberUserId: string;
  workItem: OrganizationWorkItem;
  allWorkItems: OrganizationWorkItem[];
  canViewWorkItem: boolean;
  hasRequiredRuntime: boolean;
  hasUsageAvailable: boolean;
  request: ActionRequest;
};

export type ExecutionRecordProjectContext = {
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  workItemId: string | null;
  visibility: 'organization_project' | 'private_conversation';
  record: ExecutionRecord;
};
