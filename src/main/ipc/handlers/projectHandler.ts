import type { IpcMainInvokeEvent } from 'electron';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import type { OrgProject, ProjectUserDeviceAttachment } from '../../../shared/projects/ProjectTypes';
import { deviceIdentityStore } from '../../device/DeviceIdentityStore';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase not configured');
  }
  return createClient(url, anonKey);
}

type ProjectRow = {
  id: string;
  organization_id: string | null;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  project_id: string;
  user_id: string;
  device_id: string;
  local_path: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};

function toProject(row: ProjectRow): OrgProject {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAttachment(row: AttachmentRow): ProjectUserDeviceAttachment {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    deviceId: row.device_id,
    localPath: row.local_path,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function verifyFolderExists(localPath: string): boolean {
  try {
    const stat = fs.statSync(localPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function projectCreate(evt: IpcMainInvokeEvent, name: string, organizationId: string | null): Promise<OrgProject> {
  const client = getSupabaseClient();
  const user = await client.auth.getUser();
  if (!user.data.user) throw new Error('Not authenticated');

  const { data, error } = await client
    .from('org_projects')
    .insert({
      name,
      organization_id: organizationId,
      created_by: user.data.user.id,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create project: ${error?.message}`);
  return toProject(data as ProjectRow);
}

export async function projectList(evt: IpcMainInvokeEvent, organizationId: string | null): Promise<OrgProject[]> {
  const client = getSupabaseClient();
  let query = client.from('org_projects').select();

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  } else {
    query = query.is('organization_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return (data as ProjectRow[]).map(toProject);
}

export async function projectAttach(evt: IpcMainInvokeEvent, projectId: string, localPath: string): Promise<ProjectUserDeviceAttachment> {
  // Verify folder exists before attaching
  if (!verifyFolderExists(localPath)) {
    throw new Error(`Project folder not found or not accessible: ${localPath}`);
  }

  const client = getSupabaseClient();
  const user = await client.auth.getUser();
  if (!user.data.user) throw new Error('Not authenticated');

  const deviceId = deviceIdentityStore.getIdentity().deviceId;

  const { data, error } = await client
    .from('project_user_device_attachments')
    .upsert({
      project_id: projectId,
      user_id: user.data.user.id,
      device_id: deviceId,
      local_path: localPath,
      is_verified: false,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to attach path: ${error?.message}`);
  return toAttachment(data as AttachmentRow);
}

export async function projectMarkVerified(evt: IpcMainInvokeEvent, projectId: string): Promise<ProjectUserDeviceAttachment> {
  const client = getSupabaseClient();
  const user = await client.auth.getUser();
  if (!user.data.user) throw new Error('Not authenticated');

  const deviceId = deviceIdentityStore.getIdentity().deviceId;

  // Fetch attachment to verify folder
  const { data: attachment, error: fetchError } = await client
    .from('project_user_device_attachments')
    .select()
    .eq('project_id', projectId)
    .eq('user_id', user.data.user.id)
    .eq('device_id', deviceId)
    .single();

  if (fetchError || !attachment) throw new Error(`Failed to find attachment: ${fetchError?.message}`);

  const attachmentRow = attachment as AttachmentRow;

  // Verify folder still exists before marking verified
  if (!verifyFolderExists(attachmentRow.local_path)) {
    throw new Error(`Project folder no longer exists or not accessible: ${attachmentRow.local_path}`);
  }

  // Mark as verified
  const { data: updated, error: updateError } = await client
    .from('project_user_device_attachments')
    .update({ is_verified: true })
    .eq('project_id', projectId)
    .eq('user_id', user.data.user.id)
    .eq('device_id', deviceId)
    .select()
    .single();

  if (updateError || !updated) throw new Error(`Failed to mark verified: ${updateError?.message}`);
  return toAttachment(updated as AttachmentRow);
}

// Workspace task management

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

export async function taskListByOrganization(evt: IpcMainInvokeEvent, organizationId: string): Promise<WorkspaceTask[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('workspace_tasks')
    .select()
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  return (data as TaskRow[]).map(toTask);
}

export async function taskCreate(
  evt: IpcMainInvokeEvent,
  organizationId: string,
  workspaceId: string,
  projectId: string | null,
  title: string,
  description: string | null,
): Promise<WorkspaceTask> {
  const client = getSupabaseClient();
  const user = await client.auth.getUser();
  if (!user.data.user) throw new Error('Not authenticated');

  const { data, error } = await client
    .from('workspace_tasks')
    .insert({
      organization_id: organizationId,
      workspace_id: workspaceId,
      project_id: projectId,
      title,
      description,
      created_by: user.data.user.id,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create task: ${error?.message}`);
  return toTask(data as TaskRow);
}

export async function taskAssign(evt: IpcMainInvokeEvent, taskId: string, assignedToUserId: string | null): Promise<WorkspaceTask> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('workspace_tasks')
    .update({ assigned_to: assignedToUserId, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to assign task: ${error?.message}`);
  return toTask(data as TaskRow);
}

export async function taskUpdateStatus(
  evt: IpcMainInvokeEvent,
  taskId: string,
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled',
  progressPercent?: number,
): Promise<WorkspaceTask> {
  const client = getSupabaseClient();
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (progressPercent !== undefined) {
    update.progress_percent = Math.min(100, Math.max(0, progressPercent));
  }

  const { data, error } = await client
    .from('workspace_tasks')
    .update(update)
    .eq('id', taskId)
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to update task status: ${error?.message}`);
  return toTask(data as TaskRow);
}
