/**
 * Phase 2 of the Team & Enterprise Collaboration Platform — task
 * lifecycle (status/progress) and project-level member assignment.
 * Org-wide visible like workspace_projects; any active member can create
 * their own task, the creator/assignee/a tasks.manage holder can update it.
 */

export type WorkspaceTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

/** Phase 3 addition — lets a task represent a code-review or deployment work assignment (roadmap Section 8/11), not just a general task. Additive: existing rows default to 'general'. */
export type WorkspaceTaskType = 'general' | 'code_review' | 'deployment';

export type WorkspaceTask = {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: WorkspaceTaskStatus;
  progressPercent: number;
  assignedTo: string | null;
  dueAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  taskType: WorkspaceTaskType;
  repositoryId: string | null;
  prNumber: number | null;
};

export type WorkspaceProjectMember = {
  id: string;
  projectId: string;
  organizationId: string;
  userId: string;
  role: string;
  addedBy: string | null;
  createdAt: string;
};
