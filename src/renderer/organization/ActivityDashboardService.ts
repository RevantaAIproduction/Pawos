import { workspaceTaskService } from './WorkspaceTaskService';
import { workspaceContentService } from './WorkspaceContentService';
import { creditPoolService } from './CreditPoolService';
import type { WorkspaceTaskStatus } from '../../shared/organization/WorkspaceTaskTypes';
import type { WorkspaceProjectStatus } from '../../shared/organization/WorkspaceContentTypes';

export type OrganizationActivitySummary = {
  taskCountsByStatus: Record<WorkspaceTaskStatus, number>;
  taskCountsByAssignee: { userId: string; count: number }[];
  projectCountsByStatus: Record<WorkspaceProjectStatus, number>;
  creditsUsedThisPeriod: number;
  creditsRemaining: number | null;
  recentlyUpdatedTasks: Awaited<ReturnType<typeof workspaceTaskService.listTasksForOrganization>>;
};

/**
 * Phase 2 — Activity Dashboard + reporting foundation. Deliberately not a
 * new table: this is a read-side aggregation over data every active org
 * member can already see (workspace_tasks, workspace_projects, credit
 * usage), computed client-side. Distinct from the Audit Log, which stays
 * restricted to audit.view — this dashboard is org-wide transparency,
 * the audit trail is governance history.
 */
export const activityDashboardService = {
  async getSummary(organizationId: string): Promise<OrganizationActivitySummary> {
    const [tasks, projects, creditSummary] = await Promise.all([
      workspaceTaskService.listTasksForOrganization(organizationId),
      workspaceContentService.listProjectsForOrganization(organizationId),
      creditPoolService.getSummary(organizationId).catch(() => null),
    ]);

    const taskCountsByStatus: Record<WorkspaceTaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
      cancelled: 0,
    };
    const assigneeCounts = new Map<string, number>();
    for (const task of tasks) {
      taskCountsByStatus[task.status] += 1;
      if (task.assignedTo) {
        assigneeCounts.set(task.assignedTo, (assigneeCounts.get(task.assignedTo) ?? 0) + 1);
      }
    }

    const projectCountsByStatus: Record<WorkspaceProjectStatus, number> = {
      active: 0,
      paused: 0,
      completed: 0,
      archived: 0,
    };
    for (const project of projects) {
      projectCountsByStatus[project.status] += 1;
    }

    return {
      taskCountsByStatus,
      taskCountsByAssignee: [...assigneeCounts.entries()].map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count),
      projectCountsByStatus,
      creditsUsedThisPeriod: creditSummary?.usedThisPeriod ?? 0,
      creditsRemaining: creditSummary?.remaining ?? null,
      recentlyUpdatedTasks: tasks.slice(0, 10),
    };
  },
};
