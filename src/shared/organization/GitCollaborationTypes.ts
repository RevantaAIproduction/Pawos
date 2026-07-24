/**
 * Phase 3 of the Team & Enterprise Collaboration Platform — Git &
 * Deployment Collaboration. Org-visible repository links, advisory branch
 * ownership, and recorded PR reviews. Infrastructure Runtime's actual
 * GitHub/GitLab connectors remain single-tenant/local (env-var tokens) —
 * these types are the org-shared collaboration layer on top, not a
 * credential vault.
 */

export type GitProvider = 'github' | 'gitlab';

export type OrganizationRepository = {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  provider: GitProvider;
  fullName: string;
  defaultBranch: string;
  connectedBy: string | null;
  createdAt: string;
};

export type BranchOwnership = {
  id: string;
  organizationId: string;
  repositoryId: string;
  branchName: string;
  ownerUserId: string;
  linkedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PullRequestReviewVerdict = 'approve' | 'request_changes' | 'comment';

export type PullRequestReview = {
  id: string;
  organizationId: string;
  repositoryId: string;
  prNumber: number;
  taskId: string | null;
  reviewerKind: 'ai' | 'human';
  reviewerUserId: string | null;
  summary: string;
  verdict: PullRequestReviewVerdict;
  postedToProvider: boolean;
  createdBy: string | null;
  createdAt: string;
};
