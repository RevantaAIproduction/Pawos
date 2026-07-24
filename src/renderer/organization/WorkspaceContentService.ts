import { getSupabaseClient } from '../auth/supabaseClient';
import type { WorkspaceProject, WorkspaceDocument, WorkspaceResearchSession } from '../../shared/organization/WorkspaceContentTypes';

type ProjectRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: WorkspaceProject['status'];
  owner_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  title: string;
  doc_type: WorkspaceDocument['docType'];
  external_url: string | null;
  content: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ResearchRow = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  topic: string;
  status: WorkspaceResearchSession['status'];
  findings: string[];
  next_steps: string | null;
  final_report: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toProject(row: ProjectRow): WorkspaceProject {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    status: row.status,
    ownerUserId: row.owner_user_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDocument(row: DocumentRow): WorkspaceDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    title: row.title,
    docType: row.doc_type,
    externalUrl: row.external_url,
    content: row.content,
    ownerUserId: row.owner_user_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toResearch(row: ResearchRow): WorkspaceResearchSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    topic: row.topic,
    status: row.status,
    findings: row.findings ?? [],
    nextSteps: row.next_steps,
    finalReport: row.final_report,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Phase 1 — shared project/document/research metadata attached to an
 * OrganizationWorkspace. Direct-Supabase pattern. RLS lets any active org
 * member create their own record; edits are allowed for the
 * owner/creator or a *.manage capability holder (see the migration).
 * Metadata only: no source code sync, no live research collaboration.
 * Phase 4 adds real-time co-editing for note-type documents' `content`
 * field on top of this same RLS — see SharedDocumentSession.ts.
 */
export const workspaceContentService = {
  async listProjects(workspaceId: string): Promise<WorkspaceProject[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_projects')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .returns<ProjectRow[]>();
    if (error) throw error;
    return (data ?? []).map(toProject);
  },

  /** Org-wide, across every workspace — feeds the Activity Dashboard. */
  async listProjectsForOrganization(organizationId: string): Promise<WorkspaceProject[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_projects')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .returns<ProjectRow[]>();
    if (error) throw error;
    return (data ?? []).map(toProject);
  },

  async createProject(organizationId: string, workspaceId: string, name: string, description?: string): Promise<WorkspaceProject> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    const { data, error } = await supabase
      .from('workspace_projects')
      .insert({ organization_id: organizationId, workspace_id: workspaceId, name, description: description ?? null, owner_user_id: uid, created_by: uid })
      .select('*')
      .single<ProjectRow>();
    if (error) throw error;
    return toProject(data);
  },

  async setProjectStatus(projectId: string, status: WorkspaceProject['status']): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('workspace_projects')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', projectId);
    if (error) throw error;
  },

  async deleteProject(projectId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('workspace_projects').delete().eq('id', projectId);
    if (error) throw error;
  },

  async listDocuments(workspaceId: string): Promise<WorkspaceDocument[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .returns<DocumentRow[]>();
    if (error) throw error;
    return (data ?? []).map(toDocument);
  },

  async createDocument(
    organizationId: string,
    workspaceId: string,
    title: string,
    docType: WorkspaceDocument['docType'],
    body: { externalUrl?: string; content?: string }
  ): Promise<WorkspaceDocument> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    const { data, error } = await supabase
      .from('workspace_documents')
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        title,
        doc_type: docType,
        external_url: body.externalUrl ?? null,
        content: body.content ?? null,
        owner_user_id: uid,
        created_by: uid,
      })
      .select('*')
      .single<DocumentRow>();
    if (error) throw error;
    return toDocument(data);
  },

  async deleteDocument(documentId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('workspace_documents').delete().eq('id', documentId);
    if (error) throw error;
  },

  /** Phase 4 — debounced persistence target for SharedDocumentSession's live-edited plain-text snapshot. Reuses the same RLS (creator/documents.manage) and audit trigger already covering this column — no new migration. */
  async updateDocumentContent(documentId: string, content: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('workspace_documents').update({ content, updated_at: new Date().toISOString() }).eq('id', documentId);
    if (error) throw error;
  },

  async listResearchSessions(workspaceId: string): Promise<WorkspaceResearchSession[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('workspace_research_sessions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .returns<ResearchRow[]>();
    if (error) throw error;
    return (data ?? []).map(toResearch);
  },

  async createResearchSession(
    organizationId: string,
    workspaceId: string | null,
    topic: string,
    findings: string[] = []
  ): Promise<WorkspaceResearchSession> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('workspace_research_sessions')
      .insert({ organization_id: organizationId, workspace_id: workspaceId, topic, findings, created_by: userData.user?.id ?? null })
      .select('*')
      .single<ResearchRow>();
    if (error) throw error;
    return toResearch(data);
  },

  async deleteResearchSession(sessionId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('workspace_research_sessions').delete().eq('id', sessionId);
    if (error) throw error;
  },
};
