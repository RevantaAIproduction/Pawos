import { getSupabaseClient } from '../auth/supabaseClient';
import type { BranchOwnership, OrganizationRepository, PullRequestReview } from '../../shared/organization/GitCollaborationTypes';

type RepositoryRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  provider: OrganizationRepository['provider'];
  full_name: string;
  default_branch: string;
  connected_by: string | null;
  created_at: string;
};

type BranchOwnershipRow = {
  id: string;
  organization_id: string;
  repository_id: string;
  branch_name: string;
  owner_user_id: string;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewRow = {
  id: string;
  organization_id: string;
  repository_id: string;
  pr_number: number;
  task_id: string | null;
  reviewer_kind: PullRequestReview['reviewerKind'];
  reviewer_user_id: string | null;
  summary: string;
  verdict: PullRequestReview['verdict'];
  posted_to_provider: boolean;
  created_by: string | null;
  created_at: string;
};

function toRepository(row: RepositoryRow): OrganizationRepository {
  return {
    id: row.id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    provider: row.provider,
    fullName: row.full_name,
    defaultBranch: row.default_branch,
    connectedBy: row.connected_by,
    createdAt: row.created_at,
  };
}

function toBranchOwnership(row: BranchOwnershipRow): BranchOwnership {
  return {
    id: row.id,
    organizationId: row.organization_id,
    repositoryId: row.repository_id,
    branchName: row.branch_name,
    ownerUserId: row.owner_user_id,
    linkedTaskId: row.linked_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toReview(row: ReviewRow): PullRequestReview {
  return {
    id: row.id,
    organizationId: row.organization_id,
    repositoryId: row.repository_id,
    prNumber: row.pr_number,
    taskId: row.task_id,
    reviewerKind: row.reviewer_kind,
    reviewerUserId: row.reviewer_user_id,
    summary: row.summary,
    verdict: row.verdict,
    postedToProvider: row.posted_to_provider,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * Phase 3 — Git & Deployment Collaboration. Direct-Supabase pattern, same
 * as every other Phase 1/2 organization service. Infrastructure Runtime's
 * real GitHub/GitLab connectors stay local/single-tenant (main process,
 * env-var tokens) — this service only manages the org-shared record of
 * which repos a workspace uses, who owns which branch, and what a review
 * said, never the actual connector credentials.
 */
export const gitCollaborationService = {
  async listRepositories(workspaceId: string): Promise<OrganizationRepository[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_repositories')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .returns<RepositoryRow[]>();
    if (error) throw error;
    return (data ?? []).map(toRepository);
  },

  async connectRepository(
    organizationId: string,
    workspaceId: string,
    provider: OrganizationRepository['provider'],
    fullName: string,
    options: { projectId?: string; defaultBranch?: string } = {}
  ): Promise<OrganizationRepository> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('organization_repositories')
      .insert({
        organization_id: organizationId,
        workspace_id: workspaceId,
        project_id: options.projectId ?? null,
        provider,
        full_name: fullName,
        default_branch: options.defaultBranch ?? 'main',
        connected_by: userData.user?.id ?? null,
      })
      .select('*')
      .single<RepositoryRow>();
    if (error) throw error;
    return toRepository(data);
  },

  async removeRepository(repositoryId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_repositories').delete().eq('id', repositoryId);
    if (error) throw error;
  },

  async listBranchOwnership(repositoryId: string): Promise<BranchOwnership[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('branch_ownership')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .returns<BranchOwnershipRow[]>();
    if (error) throw error;
    return (data ?? []).map(toBranchOwnership);
  },

  async claimBranch(organizationId: string, repositoryId: string, branchName: string, ownerUserId: string, linkedTaskId?: string): Promise<BranchOwnership> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('branch_ownership')
      .insert({
        organization_id: organizationId,
        repository_id: repositoryId,
        branch_name: branchName,
        owner_user_id: ownerUserId,
        linked_task_id: linkedTaskId ?? null,
      })
      .select('*')
      .single<BranchOwnershipRow>();
    if (error) throw error;
    return toBranchOwnership(data);
  },

  async releaseBranch(branchOwnershipId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('branch_ownership').delete().eq('id', branchOwnershipId);
    if (error) throw error;
  },

  async listReviews(repositoryId: string): Promise<PullRequestReview[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('pull_request_reviews')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .returns<ReviewRow[]>();
    if (error) throw error;
    return (data ?? []).map(toReview);
  },

  /** Explicit opt-in save of a review already produced locally (e.g. by the aiReviewPullRequest plugin) into the organization's shared record — same "explicit bridge, not automatic" pattern as Phase 1's OrgSyncBridge. */
  async recordReview(
    organizationId: string,
    repositoryId: string,
    prNumber: number,
    summary: string,
    verdict: PullRequestReview['verdict'],
    options: { taskId?: string; reviewerKind?: PullRequestReview['reviewerKind']; postedToProvider?: boolean } = {}
  ): Promise<PullRequestReview> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('pull_request_reviews')
      .insert({
        organization_id: organizationId,
        repository_id: repositoryId,
        pr_number: prNumber,
        task_id: options.taskId ?? null,
        reviewer_kind: options.reviewerKind ?? 'ai',
        reviewer_user_id: options.reviewerKind === 'human' ? userData.user?.id ?? null : null,
        summary,
        verdict,
        posted_to_provider: options.postedToProvider ?? false,
        created_by: userData.user?.id ?? null,
      })
      .select('*')
      .single<ReviewRow>();
    if (error) throw error;
    return toReview(data);
  },
};
