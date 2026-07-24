/**
 * Phase 1 of the Team & Enterprise Collaboration Platform — shared project
 * records, shared documentation metadata, and shared research sessions
 * that attach to an OrganizationWorkspace (PermissionTypes.ts). Metadata
 * only: no local source code sync, no real-time document editing, no live
 * research collaboration — those are later-phase scope.
 */

export type WorkspaceProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export type WorkspaceProject = {
  id: string;
  organizationId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: WorkspaceProjectStatus;
  ownerUserId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDocumentType = 'note' | 'link';

export type WorkspaceDocument = {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  docType: WorkspaceDocumentType;
  externalUrl: string | null;
  content: string | null;
  ownerUserId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceResearchStatus = 'in_progress' | 'paused' | 'completed';

export type WorkspaceResearchSession = {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  topic: string;
  status: WorkspaceResearchStatus;
  findings: string[];
  nextSteps: string | null;
  finalReport: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};
