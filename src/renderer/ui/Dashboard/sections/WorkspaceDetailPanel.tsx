import React, { useEffect, useRef, useState } from 'react';
import styles from '../dashboard.module.css';
import { organizationWorkspaceService } from '../../../organization/OrganizationWorkspaceService';
import { workspaceContentService } from '../../../organization/WorkspaceContentService';
import { workspaceTaskService } from '../../../organization/WorkspaceTaskService';
import { permissionService } from '../../../organization/PermissionService';
import { gitCollaborationService } from '../../../organization/GitCollaborationService';
import { WorkspacePresenceSession } from '../../../organization/WorkspacePresenceService';
import { SharedDocumentEditor } from './SharedDocumentEditor';
import type { OrganizationWorkspace, OrganizationWorkspaceMember } from '../../../../shared/organization/PermissionTypes';
import type { WorkspaceProject, WorkspaceDocument, WorkspaceResearchSession } from '../../../../shared/organization/WorkspaceContentTypes';
import type { WorkspaceTask, WorkspaceTaskStatus, WorkspaceTaskType, WorkspaceProjectMember } from '../../../../shared/organization/WorkspaceTaskTypes';
import type { OrganizationMember } from '../../../../shared/organization/OrganizationTypes';
import type { OrganizationRepository, BranchOwnership, GitProvider } from '../../../../shared/organization/GitCollaborationTypes';
import type { CursorBroadcastPayload, WorkspacePresenceMember } from '../../../../shared/organization/PresenceTypes';
import type { AuthUser } from '../../../auth/AuthTypes';

const CURSOR_COLORS = ['#e0a458', '#8ab4ff', '#7ee787', '#f78ca2', '#c792ea'];
function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

const TASK_STATUSES: WorkspaceTaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'];
const TASK_TYPES: WorkspaceTaskType[] = ['general', 'code_review', 'deployment'];

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: '8px 10px',
  fontSize: 13,
};

const rowStyle: React.CSSProperties = { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 };

/**
 * Phase 1 — per-workspace detail: members, shared projects, shared
 * documentation metadata, shared research sessions. Every list here is
 * visible to any active org member (RLS); creating rows requires either
 * an org capability or being the workspace owner/creator (see the
 * migration) — this component just reflects that back honestly.
 *
 * Phase 4 additions (presence, live cursors, real-time co-editing) layer
 * on top without changing any of the above: presence/cursors are
 * ephemeral Realtime channel state, never a table; "Edit live" on a
 * note-type document opens SharedDocumentEditor, which still writes
 * through the same content column/RLS/audit trigger Phase 1 already
 * built — see WorkspaceContentService.updateDocumentContent.
 */
export function WorkspaceDetailPanel({
  workspace,
  orgMembers,
  currentUser,
}: {
  workspace: OrganizationWorkspace;
  orgMembers: OrganizationMember[];
  currentUser: AuthUser;
}) {
  const [members, setMembers] = useState<OrganizationWorkspaceMember[]>([]);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [research, setResearch] = useState<WorkspaceResearchSession[]>([]);
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [canManageWorkspace, setCanManageWorkspace] = useState(false);
  const [canManageProjects, setCanManageProjects] = useState(false);
  const [canManageDocuments, setCanManageDocuments] = useState(false);
  const [canManageResearch, setCanManageResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [newResearchTopic, setNewResearchTopic] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [pickedMemberId, setPickedMemberId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<WorkspaceProjectMember[]>([]);
  const [pickedProjectMemberId, setPickedProjectMemberId] = useState('');
  const [newTaskType, setNewTaskType] = useState<WorkspaceTaskType>('general');
  const [newTaskRepositoryId, setNewTaskRepositoryId] = useState('');
  const [newTaskPrNumber, setNewTaskPrNumber] = useState('');
  const [repositories, setRepositories] = useState<OrganizationRepository[]>([]);
  const [canManageRepositories, setCanManageRepositories] = useState(false);
  const [newRepoProvider, setNewRepoProvider] = useState<GitProvider>('github');
  const [newRepoFullName, setNewRepoFullName] = useState('');
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [branchOwnership, setBranchOwnership] = useState<BranchOwnership[]>([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchOwnerId, setNewBranchOwnerId] = useState('');
  const [presentMembers, setPresentMembers] = useState<WorkspacePresenceMember[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorBroadcastPayload>>({});
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const presenceRef = useRef<WorkspacePresenceSession | null>(null);

  function reload() {
    Promise.all([
      organizationWorkspaceService.listMembers(workspace.id),
      workspaceContentService.listProjects(workspace.id),
      workspaceContentService.listDocuments(workspace.id),
      workspaceContentService.listResearchSessions(workspace.id),
      workspaceTaskService.listTasks(workspace.id),
      permissionService.hasCapability(workspace.organizationId, 'workspaces.manage'),
      permissionService.hasCapability(workspace.organizationId, 'projects.manage'),
      permissionService.hasCapability(workspace.organizationId, 'documents.manage'),
      permissionService.hasCapability(workspace.organizationId, 'research.manage'),
      gitCollaborationService.listRepositories(workspace.id),
      permissionService.hasCapability(workspace.organizationId, 'repositories.manage'),
    ])
      .then(([m, p, d, r, t, wm, pm, dm, rm, repos, repoManage]) => {
        setMembers(m);
        setProjects(p);
        setDocuments(d);
        setResearch(r);
        setTasks(t);
        setCanManageWorkspace(wm);
        setCanManageProjects(pm);
        setCanManageDocuments(dm);
        setCanManageResearch(rm);
        setRepositories(repos);
        setCanManageRepositories(repoManage);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }

  useEffect(reload, [workspace.id]);

  useEffect(() => {
    const session = new WorkspacePresenceSession();
    presenceRef.current = session;
    let cancelled = false;
    session
      .join(
        workspace.id,
        { userId: currentUser.id, displayName: currentUser.name || currentUser.email || currentUser.id },
        (memberList) => !cancelled && setPresentMembers(memberList),
        (cursor) => !cancelled && setCursors((prev) => ({ ...prev, [cursor.userId]: cursor }))
      )
      .catch(() => {});
    return () => {
      cancelled = true;
      setCursors({});
      session.leave().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, currentUser.id]);

  function handlePanelMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    presenceRef.current?.sendCursor({
      userId: currentUser.id,
      displayName: currentUser.name || currentUser.email || currentUser.id,
      color: colorForUser(currentUser.id),
      xRatio: (e.clientX - rect.left) / rect.width,
      yRatio: (e.clientY - rect.top) / rect.height,
    });
  }

  function reloadProjectMembers(projectId: string) {
    workspaceTaskService
      .listProjectMembers(projectId)
      .then(setProjectMembers)
      .catch((e) => setError(getErrorMessage(e)));
  }

  function toggleProjectMembers(projectId: string) {
    setSelectedProjectId((prev) => {
      const next = prev === projectId ? null : projectId;
      if (next) reloadProjectMembers(next);
      else setProjectMembers([]);
      return next;
    });
  }

  async function addProjectMember() {
    if (!selectedProjectId || !pickedProjectMemberId) return;
    setError(null);
    try {
      await workspaceTaskService.addProjectMember(selectedProjectId, workspace.organizationId, pickedProjectMemberId);
      setPickedProjectMemberId('');
      reloadProjectMembers(selectedProjectId);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function createTask() {
    if (!newTaskTitle.trim()) return;
    setError(null);
    try {
      await workspaceTaskService.createTask(workspace.organizationId, workspace.id, newTaskTitle.trim(), {
        assignedTo: newTaskAssignee || undefined,
        taskType: newTaskType,
        repositoryId: newTaskType !== 'general' && newTaskRepositoryId ? newTaskRepositoryId : undefined,
        prNumber: newTaskType !== 'general' && newTaskPrNumber.trim() ? Number(newTaskPrNumber) : undefined,
      });
      setNewTaskTitle('');
      setNewTaskAssignee('');
      setNewTaskType('general');
      setNewTaskRepositoryId('');
      setNewTaskPrNumber('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  function reloadBranchOwnership(repositoryId: string) {
    gitCollaborationService
      .listBranchOwnership(repositoryId)
      .then(setBranchOwnership)
      .catch((e) => setError(getErrorMessage(e)));
  }

  function toggleRepository(repositoryId: string) {
    setSelectedRepositoryId((prev) => {
      const next = prev === repositoryId ? null : repositoryId;
      if (next) reloadBranchOwnership(next);
      else setBranchOwnership([]);
      return next;
    });
  }

  async function connectRepository() {
    if (!newRepoFullName.trim()) return;
    setError(null);
    try {
      await gitCollaborationService.connectRepository(workspace.organizationId, workspace.id, newRepoProvider, newRepoFullName.trim());
      setNewRepoFullName('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function claimBranch() {
    if (!selectedRepositoryId || !newBranchName.trim() || !newBranchOwnerId) return;
    setError(null);
    try {
      await gitCollaborationService.claimBranch(workspace.organizationId, selectedRepositoryId, newBranchName.trim(), newBranchOwnerId);
      setNewBranchName('');
      setNewBranchOwnerId('');
      reloadBranchOwnership(selectedRepositoryId);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function updateTaskStatus(taskId: string, status: WorkspaceTaskStatus) {
    setError(null);
    try {
      await workspaceTaskService.setTaskStatus(taskId, status);
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function updateTaskProgress(taskId: string, progressPercent: number) {
    setError(null);
    try {
      await workspaceTaskService.setTaskProgress(taskId, progressPercent);
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function addMember() {
    if (!pickedMemberId) return;
    setError(null);
    try {
      await organizationWorkspaceService.addMember(workspace.id, workspace.organizationId, pickedMemberId);
      setPickedMemberId('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    setError(null);
    try {
      await workspaceContentService.createProject(workspace.organizationId, workspace.id, newProjectName.trim());
      setNewProjectName('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function createDocument() {
    if (!newDocTitle.trim()) return;
    setError(null);
    try {
      await workspaceContentService.createDocument(workspace.organizationId, workspace.id, newDocTitle.trim(), newDocUrl.trim() ? 'link' : 'note', {
        externalUrl: newDocUrl.trim() || undefined,
      });
      setNewDocTitle('');
      setNewDocUrl('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function createResearch() {
    if (!newResearchTopic.trim()) return;
    setError(null);
    try {
      await workspaceContentService.createResearchSession(workspace.organizationId, workspace.id, newResearchTopic.trim());
      setNewResearchTopic('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  const memberUserIds = new Set(members.map((m) => m.userId));
  const addableOrgMembers = orgMembers.filter((m) => m.userId && !memberUserIds.has(m.userId));

  const otherCursors = Object.values(cursors).filter((c) => c.userId !== currentUser.id);

  return (
    <div
      ref={panelRef}
      onMouseMove={handlePanelMouseMove}
      style={{ position: 'relative', marginTop: 10, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}
    >
      {otherCursors.map((c) => (
        <div
          key={c.userId}
          style={{
            position: 'absolute',
            left: `${c.xRatio * 100}%`,
            top: `${c.yRatio * 100}%`,
            pointerEvents: 'none',
            zIndex: 5,
            transform: 'translate(-2px, -2px)',
            transition: 'left 60ms linear, top 60ms linear',
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, boxShadow: `0 0 0 2px rgba(0,0,0,0.4)` }} />
          <div style={{ fontSize: 10.5, color: c.color, background: 'rgba(0,0,0,0.55)', padding: '1px 5px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap' }}>{c.displayName}</div>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{workspace.name}</div>
        {presentMembers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={presentMembers.map((m) => m.displayName).join(', ')}>
            {presentMembers.slice(0, 5).map((m) => (
              <div
                key={m.userId}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: colorForUser(m.userId),
                  color: '#0b0c10',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {m.displayName.slice(0, 1).toUpperCase()}
              </div>
            ))}
            <span style={{ fontSize: 11, color: '#96969e', marginLeft: 2 }}>{presentMembers.length === 1 ? 'you' : `${presentMembers.length} here`}</span>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Members</div>
        {members.length === 0 && <p className={styles.cardBody}>No one assigned yet — visible to every org member regardless.</p>}
        {members.map((m) => (
          <div key={m.id} style={rowStyle}>
            {orgMembers.find((om) => om.userId === m.userId)?.displayName || orgMembers.find((om) => om.userId === m.userId)?.email || m.userId}
            <span style={{ color: '#96969e', marginLeft: 8 }}>{m.role}</span>
          </div>
        ))}
        {canManageWorkspace && addableOrgMembers.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={pickedMemberId} onChange={(e) => setPickedMemberId(e.target.value)}>
              <option value="">Add a member…</option>
              {addableOrgMembers.map((m) => (
                <option key={m.userId ?? m.id} value={m.userId ?? ''}>
                  {m.displayName || m.email}
                </option>
              ))}
            </select>
            <button type="button" className={styles.primaryButton} disabled={!pickedMemberId} onClick={addMember}>
              Add
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Shared projects</div>
        {projects.length === 0 && <p className={styles.cardBody}>No shared projects yet.</p>}
        {projects.map((p) => (
          <div key={p.id}>
            <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={() => toggleProjectMembers(p.id)}>
              {p.name} <span style={{ color: '#96969e', marginLeft: 8 }}>{p.status}</span>
            </div>
            {selectedProjectId === p.id && (
              <div style={{ padding: '8px 0 8px 14px' }}>
                <div style={{ fontSize: 11.5, color: '#96969e', marginBottom: 4 }}>Assigned to this project</div>
                {projectMembers.length === 0 && <p style={{ fontSize: 12, color: '#96969e' }}>No one assigned yet.</p>}
                {projectMembers.map((pm) => (
                  <div key={pm.id} style={{ fontSize: 12.5, padding: '3px 0' }}>
                    {orgMembers.find((om) => om.userId === pm.userId)?.displayName || orgMembers.find((om) => om.userId === pm.userId)?.email || pm.userId}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <select style={{ ...inputStyle, flex: 1, fontSize: 12 }} value={pickedProjectMemberId} onChange={(e) => setPickedProjectMemberId(e.target.value)}>
                    <option value="">Assign a member…</option>
                    {orgMembers
                      .filter((m) => m.userId && !projectMembers.some((pm) => pm.userId === m.userId))
                      .map((m) => (
                        <option key={m.userId ?? m.id} value={m.userId ?? ''}>
                          {m.displayName || m.email}
                        </option>
                      ))}
                  </select>
                  <button type="button" className={styles.primaryButton} disabled={!pickedProjectMemberId} onClick={addProjectMember}>
                    Assign
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="New project name" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
          <button type="button" className={styles.primaryButton} disabled={!newProjectName.trim()} onClick={createProject}>
            Add
          </button>
        </div>
        {!canManageProjects && <p style={{ fontSize: 11.5, color: '#96969e', marginTop: 4 }}>You can create your own; editing others' requires projects.manage.</p>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Tasks</div>
        {tasks.length === 0 && <p className={styles.cardBody}>No tasks yet.</p>}
        {tasks.map((t) => (
          <div key={t.id} style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 120 }}>{t.title}</span>
            <span style={{ fontSize: 11.5, color: '#96969e' }}>
              {t.assignedTo ? orgMembers.find((om) => om.userId === t.assignedTo)?.displayName || orgMembers.find((om) => om.userId === t.assignedTo)?.email || 'assigned' : 'unassigned'}
            </span>
            {t.taskType !== 'general' && (
              <span style={{ fontSize: 11, color: '#8ab4ff' }}>
                {t.taskType === 'code_review' ? 'code review' : 'deployment'}
                {t.repositoryId && repositories.find((r) => r.id === t.repositoryId) ? ` · ${repositories.find((r) => r.id === t.repositoryId)?.fullName}` : ''}
                {t.prNumber ? ` #${t.prNumber}` : ''}
              </span>
            )}
            <select style={{ ...inputStyle, fontSize: 12, padding: '4px 6px' }} value={t.status} onChange={(e) => updateTaskStatus(t.id, e.target.value as WorkspaceTaskStatus)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              style={{ ...inputStyle, width: 56, fontSize: 12, padding: '4px 6px' }}
              value={t.progressPercent}
              onChange={(e) => updateTaskProgress(t.id, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            />
            <span style={{ fontSize: 11 }}>%</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="New task title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
          <select style={{ ...inputStyle }} value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {orgMembers
              .filter((m) => m.userId)
              .map((m) => (
                <option key={m.userId ?? m.id} value={m.userId ?? ''}>
                  {m.displayName || m.email}
                </option>
              ))}
          </select>
          <select style={{ ...inputStyle }} value={newTaskType} onChange={(e) => setNewTaskType(e.target.value as WorkspaceTaskType)}>
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'general' ? 'General' : t === 'code_review' ? 'Code review' : 'Deployment'}
              </option>
            ))}
          </select>
          <button type="button" className={styles.primaryButton} disabled={!newTaskTitle.trim()} onClick={createTask}>
            Add
          </button>
        </div>
        {newTaskType !== 'general' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <select style={{ ...inputStyle, flex: 1 }} value={newTaskRepositoryId} onChange={(e) => setNewTaskRepositoryId(e.target.value)}>
              <option value="">No repository linked</option>
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
            <input
              style={{ ...inputStyle, width: 100 }}
              placeholder="PR #"
              value={newTaskPrNumber}
              onChange={(e) => setNewTaskPrNumber(e.target.value)}
              inputMode="numeric"
            />
          </div>
        )}
        <p style={{ fontSize: 11.5, color: '#96969e', marginTop: 4 }}>You can update your own tasks and anything assigned to you; editing others' requires tasks.manage.</p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Repositories</div>
        {repositories.length === 0 && <p className={styles.cardBody}>No repositories connected yet.</p>}
        {repositories.map((r) => (
          <div key={r.id}>
            <div style={{ ...rowStyle, cursor: 'pointer' }} onClick={() => toggleRepository(r.id)}>
              {r.fullName} <span style={{ color: '#96969e', marginLeft: 8 }}>{r.provider}</span>
            </div>
            {selectedRepositoryId === r.id && (
              <div style={{ padding: '8px 0 8px 14px' }}>
                <div style={{ fontSize: 11.5, color: '#96969e', marginBottom: 4 }}>Branch ownership (advisory)</div>
                {branchOwnership.length === 0 && <p style={{ fontSize: 12, color: '#96969e' }}>No branches claimed yet.</p>}
                {branchOwnership.map((b) => (
                  <div key={b.id} style={{ fontSize: 12.5, padding: '3px 0' }}>
                    {b.branchName}
                    <span style={{ color: '#96969e', marginLeft: 8 }}>
                      {orgMembers.find((om) => om.userId === b.ownerUserId)?.displayName || orgMembers.find((om) => om.userId === b.ownerUserId)?.email || b.ownerUserId}
                    </span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input style={{ ...inputStyle, flex: 1, fontSize: 12 }} placeholder="Branch name" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
                  <select style={{ ...inputStyle, fontSize: 12 }} value={newBranchOwnerId} onChange={(e) => setNewBranchOwnerId(e.target.value)}>
                    <option value="">Owner…</option>
                    {orgMembers
                      .filter((m) => m.userId)
                      .map((m) => (
                        <option key={m.userId ?? m.id} value={m.userId ?? ''}>
                          {m.displayName || m.email}
                        </option>
                      ))}
                  </select>
                  <button type="button" className={styles.primaryButton} disabled={!newBranchName.trim() || !newBranchOwnerId} onClick={claimBranch}>
                    Claim
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle }} value={newRepoProvider} onChange={(e) => setNewRepoProvider(e.target.value as GitProvider)}>
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
          </select>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="owner/repo" value={newRepoFullName} onChange={(e) => setNewRepoFullName(e.target.value)} />
          <button type="button" className={styles.primaryButton} disabled={!newRepoFullName.trim()} onClick={connectRepository}>
            Connect
          </button>
        </div>
        {!canManageRepositories && <p style={{ fontSize: 11.5, color: '#96969e', marginTop: 4 }}>Anyone can view; connecting/removing requires repositories.manage.</p>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Shared documentation</div>
        {documents.length === 0 && <p className={styles.cardBody}>No shared documents yet.</p>}
        {documents.map((d) => (
          <div key={d.id}>
            <div style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
              {d.externalUrl ? (
                <a href={d.externalUrl} target="_blank" rel="noreferrer" style={{ color: '#8ab4ff', flex: 1 }}>
                  {d.title}
                </a>
              ) : (
                <span style={{ flex: 1 }}>{d.title}</span>
              )}
              {!d.externalUrl && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  style={{ fontSize: 11.5, padding: '3px 8px' }}
                  onClick={() => setEditingDocumentId((prev) => (prev === d.id ? null : d.id))}
                >
                  {editingDocumentId === d.id ? 'Close' : 'Edit live'}
                </button>
              )}
            </div>
            {editingDocumentId === d.id && <SharedDocumentEditor documentId={d.id} initialContent={d.content} />}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Title" value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} />
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Link (optional)" value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} />
          <button type="button" className={styles.primaryButton} disabled={!newDocTitle.trim()} onClick={createDocument}>
            Add
          </button>
        </div>
        {!canManageDocuments && <p style={{ fontSize: 11.5, color: '#96969e', marginTop: 4 }}>You can create your own; editing others' requires documents.manage.</p>}
      </div>

      <div>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Shared research</div>
        {research.length === 0 && <p className={styles.cardBody}>No shared research sessions yet.</p>}
        {research.map((r) => (
          <div key={r.id} style={rowStyle}>
            {r.topic} <span style={{ color: '#96969e', marginLeft: 8 }}>{r.status}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Research topic" value={newResearchTopic} onChange={(e) => setNewResearchTopic(e.target.value)} />
          <button type="button" className={styles.primaryButton} disabled={!newResearchTopic.trim()} onClick={createResearch}>
            Add
          </button>
        </div>
        {!canManageResearch && <p style={{ fontSize: 11.5, color: '#96969e', marginTop: 4 }}>You can create your own; editing others' requires research.manage.</p>}
      </div>

      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
