import { getSupabaseClient } from '../auth/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type WorkspaceTask = {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  progressPercent: number;
  assignedTo: string | null;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type TaskRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  progress_percent: number;
  assigned_to: string | null;
  due_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
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
  };
}

export const workspaceTaskService = {
  async listByOrganization(organizationId: string): Promise<WorkspaceTask[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_tasks')
      .select()
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data as TaskRow[]).map(toTask);
  },

  async create(
    organizationId: string,
    workspaceId: string,
    projectId: string | null,
    title: string,
    description: string | null = null,
  ): Promise<WorkspaceTask> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not signed in');

    const { data, error } = await supabase
      .from('workspace_tasks')
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        project_id: projectId,
        title,
        description,
        created_by: userId,
      })
      .select()
      .single<TaskRow>();
    if (error) throw error;
    return toTask(data);
  },

  async assign(taskId: string, assignedToUserId: string | null): Promise<WorkspaceTask> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_tasks')
      .update({ assigned_to: assignedToUserId, updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single<TaskRow>();
    if (error) throw error;
    return toTask(data);
  },

  async updateStatus(
    taskId: string,
    status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled',
    progressPercent?: number,
  ): Promise<WorkspaceTask> {
    const supabase = await getSupabaseClient();
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (progressPercent !== undefined) {
      update.progress_percent = Math.min(100, Math.max(0, progressPercent));
    }

    const { data, error } = await supabase
      .from('workspace_tasks')
      .update(update)
      .eq('id', taskId)
      .select()
      .single<TaskRow>();
    if (error) throw error;
    return toTask(data);
  },

  subscribeToTasks(organizationId: string, onChange: () => void): () => void {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    getSupabaseClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`tasks:${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'workspace_tasks',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => onChange(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  },
};
