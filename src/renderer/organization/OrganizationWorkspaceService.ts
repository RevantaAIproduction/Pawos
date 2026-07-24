import { getSupabaseClient } from '../auth/supabaseClient';
import type { OrganizationWorkspace, OrganizationWorkspaceMember } from '../../shared/organization/PermissionTypes';

type WorkspaceRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  organization_id: string;
  user_id: string;
  role: string;
  added_by: string | null;
  created_at: string;
};

function toWorkspace(row: WorkspaceRow): OrganizationWorkspace {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    settings: row.settings ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWorkspaceMember(row: WorkspaceMemberRow): OrganizationWorkspaceMember {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

/**
 * Phase 0 shipped the workspace container only; Phase 1 adds settings and
 * an explicit member roster. Direct-Supabase pattern, RLS gates writes via
 * workspaces.manage.
 */
export const organizationWorkspaceService = {
  async listWorkspaces(organizationId: string): Promise<OrganizationWorkspace[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_workspaces')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .returns<WorkspaceRow[]>();
    if (error) throw error;
    return (data ?? []).map(toWorkspace);
  },

  async createWorkspace(organizationId: string, name: string, description?: string): Promise<OrganizationWorkspace> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_workspaces')
      .insert({ organization_id: organizationId, name, description: description ?? null, created_by: userData.user?.id ?? null })
      .select('*')
      .single<WorkspaceRow>();
    if (error) throw error;
    return toWorkspace(data);
  },

  async updateWorkspaceSettings(workspaceId: string, settings: Record<string, unknown>): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_workspaces')
      .update({ settings, updated_at: new Date().toISOString() })
      .eq('id', workspaceId);
    if (error) throw error;
  },

  async deleteWorkspace(workspaceId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_workspaces').delete().eq('id', workspaceId);
    if (error) throw error;
  },

  async listMembers(workspaceId: string): Promise<OrganizationWorkspaceMember[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true })
      .returns<WorkspaceMemberRow[]>();
    if (error) throw error;
    return (data ?? []).map(toWorkspaceMember);
  },

  async addMember(workspaceId: string, organizationId: string, userId: string, role = 'member'): Promise<OrganizationWorkspaceMember> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_workspace_members')
      .insert({ workspace_id: workspaceId, organization_id: organizationId, user_id: userId, role, added_by: userData.user?.id ?? null })
      .select('*')
      .single<WorkspaceMemberRow>();
    if (error) throw error;
    return toWorkspaceMember(data);
  },

  async removeMember(memberRowId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_workspace_members').delete().eq('id', memberRowId);
    if (error) throw error;
  },
};
