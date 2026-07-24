import { getSupabaseClient } from '../auth/supabaseClient';
import type { WorkspaceTask, WorkspaceProjectMember } from '../../shared/organization/WorkspaceTaskTypes';

type TaskRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: WorkspaceTask['status'];
  progress_percent: number;
  assigned_to: string | null;
  due_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  task_type: WorkspaceTask['taskType'];
  repository_id: string | null;
  pr_number: number | null;
};

type ProjectMemberRow = {
  id: string;
  project_id: string;
  organization_id: string;
  user_id: string;
  role: string;
  added_by: string | null;
  created_at: string;
};

function toTask(row: TaskRow): WorkspaceTask {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    progressPercent: row.progress_percent,
    assignedTo: row.assigned_to,
    dueAt: row.due_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskType: row.task_type,
    repositoryId: row.repository_id,
    prNumber: row.pr_number,
  };
}

function toProjectMember(row: ProjectMemberRow): WorkspaceProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

/**
 * Phase 2 — task lifecycle (status/progress) and project-level member
 * assignment. Direct-Supabase pattern. Org-wide visible; a task's
 * creator/assignee (or a tasks.manage holder) can update it; a project's
 * owner/creator (or a projects.manage holder) can assign members to it.
 */
export const workspaceTaskService = {
  async listTasks(workspaceId: string): Promise<WorkspaceTask[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .returns<TaskRow[]>();
    if (error) throw error;
    return (data ?? []).map(toTask);
  },

  /** Org-wide, across every workspace — feeds the Activity Dashboard. */
  async listTasksForOrganization(organizationId: string): Promise<WorkspaceTask[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_tasks')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .returns<TaskRow[]>();
    if (error) throw error;
    return (data ?? []).map(toTask);
  },

  async createTask(
    organizationId: string,
    workspaceId: string,
    title: string,
    options: {
      projectId?: string;
      description?: string;
      assignedTo?: string;
      dueAt?: string;
      taskType?: WorkspaceTask['taskType'];
      repositoryId?: string;
      prNumber?: number;
    } = {}
  ): Promise<WorkspaceTask> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('workspace_tasks')
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        project_id: options.projectId ?? null,
        title,
        description: options.description ?? null,
        assigned_to: options.assignedTo ?? null,
        due_at: options.dueAt ?? null,
        created_by: userData.user?.id ?? null,
        task_type: options.taskType ?? 'general',
        repository_id: options.repositoryId ?? null,
        pr_number: options.prNumber ?? null,
      })
      .select('*')
      .single<TaskRow>();
    if (error) throw error;
    return toTask(data);
  },

  async setTaskStatus(taskId: string, status: WorkspaceTask['status']): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('workspace_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (error) throw error;
  },

  async setTaskProgress(taskId: string, progressPercent: number): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('workspace_tasks')
      .update({ progress_percent: progressPercent, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (error) throw error;
  },

  async assignTask(taskId: string, assignedTo: string | null): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('workspace_tasks')
      .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (error) throw error;
  },

  async deleteTask(taskId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('workspace_tasks').delete().eq('id', taskId);
    if (error) throw error;
  },

  async listProjectMembers(projectId: string): Promise<WorkspaceProjectMember[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_project_members')
      .select('*')
      .eq('project_id', projectId)
      .returns<ProjectMemberRow[]>();
    if (error) throw error;
    return (data ?? []).map(toProjectMember);
  },

  async addProjectMember(projectId: string, organizationId: string, userId: string, role = 'member'): Promise<WorkspaceProjectMember> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('workspace_project_members')
      .insert({ project_id: projectId, organization_id: organizationId, user_id: userId, role, added_by: userData.user?.id ?? null })
      .select('*')
      .single<ProjectMemberRow>();
    if (error) throw error;
    return toProjectMember(data);
  },

  async removeProjectMember(memberRowId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('workspace_project_members').delete().eq('id', memberRowId);
    if (error) throw error;
  },
};
