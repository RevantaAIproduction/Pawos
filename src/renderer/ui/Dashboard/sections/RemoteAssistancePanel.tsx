import React, { useEffect, useRef, useState } from 'react';
import styles from '../dashboard.module.css';
import { remoteAssistanceService } from '../../../organization/RemoteAssistanceService';
import { permissionService } from '../../../organization/PermissionService';
import { ScreenShareHostSession, ScreenShareViewerSession } from '../../../organization/ScreenShareSession';
import { RemoteControlHelperSession, RemoteControlHostSession } from '../../../organization/RemoteControlSession';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { AuthUser } from '../../../auth/AuthTypes';
import type { OrganizationMember } from '../../../../shared/organization/OrganizationTypes';
import type { ControlGrant, ControlGrantKind, RemoteAssistanceSession, ShareScope } from '../../../../shared/organization/RemoteAssistanceTypes';

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

/** Matches Section 6's "Remote Control — independent permission grants" table exactly, in the order it's presented there. */
const GRANT_KINDS: { kind: ControlGrantKind; label: string }[] = [
  { kind: 'view_screen', label: 'View screen' },
  { kind: 'view_runtime', label: 'View runtime' },
  { kind: 'move_cursor', label: 'Move cursor' },
  { kind: 'click_ui', label: 'Click UI' },
  { kind: 'keyboard_input', label: 'Keyboard input' },
  { kind: 'clipboard', label: 'Clipboard' },
  { kind: 'file_editing', label: 'File editing' },
  { kind: 'terminal', label: 'Terminal' },
  { kind: 'browser_control', label: 'Browser control' },
  { kind: 'infra_control', label: 'Infrastructure control' },
];

/**
 * Phase 5 — Remote Assistance & Screen Sharing/Remote Control. Implements
 * the roadmap's Section 5 request→approve state machine and Section 6's
 * per-permission grants end to end: request help, an eligible helper joins,
 * every escalation (view/cursor/keyboard/terminal/...) is requested and
 * approved as its own explicit step, and any grant can be revoked instantly.
 */
export function RemoteAssistancePanel({
  organizationId,
  workspaceId,
  currentUser,
  orgMembers,
}: {
  organizationId: string;
  workspaceId: string | null;
  currentUser: AuthUser;
  orgMembers: OrganizationMember[];
}) {
  const [canProvide, setCanProvide] = useState(false);
  const [openRequests, setOpenRequests] = useState<RemoteAssistanceSession[]>([]);
  const [session, setSession] = useState<RemoteAssistanceSession | null>(null);
  const [grants, setGrants] = useState<ControlGrant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const hostScreenShare = useRef<ScreenShareHostSession | null>(null);
  const viewerScreenShare = useRef<ScreenShareViewerSession | null>(null);
  const controlHost = useRef<RemoteControlHostSession | null>(null);
  const controlHelper = useRef<RemoteControlHelperSession | null>(null);

  const isRequester = session?.requesterUserId === currentUser.id;
  const isHelper = session?.helperUserId === currentUser.id;

  function memberLabel(userId: string): string {
    const member = orgMembers.find((m) => m.userId === userId);
    return member?.displayName || member?.email || userId;
  }

  function reload() {
    permissionService
      .hasCapability(organizationId, 'remote_assistance.provide')
      .then(setCanProvide)
      .catch((e) => setError(getErrorMessage(e)));
    remoteAssistanceService
      .listOpenRequests(organizationId)
      .then(setOpenRequests)
      .catch((e) => setError(getErrorMessage(e)));
  }

  useEffect(reload, [organizationId]);

  // Resume-on-remount: without this, reloading or navigating away and back
  // loses all UI access to an already in-flight session (no "End session"
  // button, and a repeat "Request help" click would insert a duplicate row).
  useEffect(() => {
    remoteAssistanceService
      .getMyActiveSession(organizationId)
      .then((existing) => {
        if (existing) setSession(existing);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [organizationId]);

  // Live update for the open-requests queue: without this, a request created
  // by a teammate only appears after this panel remounts (e.g. a full reload).
  useEffect(() => {
    const unsub = remoteAssistanceService.subscribeToOpenRequests(organizationId, () => {
      remoteAssistanceService
        .listOpenRequests(organizationId)
        .then(setOpenRequests)
        .catch((e) => setError(getErrorMessage(e)));
    });
    return unsub;
  }, [organizationId]);

  // Live session + grants subscriptions once a session exists.
  useEffect(() => {
    if (!session) return;
    const unsubSession = remoteAssistanceService.subscribeToSession(session.id, organizationId, setSession);
    const unsubGrants = remoteAssistanceService.subscribeToGrants(session.id, (grant) => {
      setGrants((prev) => {
        const next = prev.filter((g) => g.id !== grant.id);
        next.push(grant);
        return next;
      });
    });
    remoteAssistanceService.listGrants(session.id).then(setGrants).catch(() => {});
    return () => {
      unsubSession();
      unsubGrants();
    };
  }, [session?.id]);

  // Wire up the host side (requester's own machine): relays approved
  // control-grant actions into the local Desktop Execution Engine, and
  // the shared-terminal process, once the session goes active.
  useEffect(() => {
    if (!session || !isRequester || session.status !== 'active') return;
    const host = new RemoteControlHostSession();
    controlHost.current = host;
    const grantIsActive = (kind: ControlGrantKind) => grants.some((g) => g.kind === kind && g.status === 'granted');
    host.open(session.id, grantIsActive, () => {});
    const unsubOutput = ipc.onProcessOutput((event) => host.forwardTerminalOutput(event.processId, event.chunk));
    return () => {
      host.close();
      unsubOutput?.();
    };
  }, [session?.id, session?.status, isRequester]);

  // Wire up the helper side's screen-share viewer once active.
  useEffect(() => {
    if (!session || !isHelper || session.status !== 'active') return;
    const viewer = new ScreenShareViewerSession();
    viewerScreenShare.current = viewer;
    viewer.connect(session.id, currentUser.id, (stream) => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    });
    const helper = new RemoteControlHelperSession();
    controlHelper.current = helper;
    helper.open(session.id, (chunk) => setTerminalOutput((prev) => (prev + chunk).slice(-20000)));
    return () => {
      viewer.disconnect();
      helper.close();
    };
  }, [session?.id, session?.status, isHelper]);

  async function requestAssistance() {
    setError(null);
    try {
      const created = await remoteAssistanceService.requestAssistance(organizationId, workspaceId);
      setSession(created);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function joinRequest(target: RemoteAssistanceSession) {
    setError(null);
    try {
      const joined = await remoteAssistanceService.joinAsHelper(target.id);
      setSession(joined);
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function startSharing(scope: ShareScope) {
    if (!session) return;
    setError(null);
    try {
      const host = new ScreenShareHostSession();
      hostScreenShare.current = host;
      const { sourceLabel } = await host.start(session.id, scope, currentUser.id);
      await remoteAssistanceService.activateSession(session.id, scope, sourceLabel);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function requestGrant(kind: ControlGrantKind) {
    if (!session) return;
    try {
      await remoteAssistanceService.requestGrant(organizationId, session.id, kind);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function decideGrant(grantId: string, decision: 'granted' | 'denied') {
    try {
      await remoteAssistanceService.decideGrant(grantId, decision);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function revokeGrant(grantId: string) {
    try {
      await remoteAssistanceService.revokeGrant(grantId);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function endSession() {
    if (!session) return;
    try {
      await hostScreenShare.current?.stop();
      await controlHost.current?.close();
      await viewerScreenShare.current?.close?.();
      await controlHelper.current?.close();
      await remoteAssistanceService.endSession(session.id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSession(null);
      setGrants([]);
      setTerminalOutput('');
      reload();
    }
  }

  const terminalGrant = grants.find((g) => g.kind === 'terminal');
  const terminalActive = terminalGrant?.status === 'granted';

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Remote Assistance</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Request help from a teammate, or join a colleague's request. Every level of control — viewing your screen, moving
        the cursor, typing, running terminal commands — is its own explicit request you approve separately; nothing is
        granted automatically.
      </p>

      {!session && (
        <>
          <button type="button" className={styles.primaryButton} onClick={requestAssistance}>
            Request help
          </button>

          {canProvide && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Open help requests</div>
              {openRequests.length === 0 && <p className={styles.cardBody}>No open requests.</p>}
              {openRequests.map((r) => (
                <div
                  key={r.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}
                >
                  <div>
                    {memberLabel(r.requesterUserId)} — <span style={{ color: '#96969e' }}>{r.status}</span>
                  </div>
                  <button type="button" className={styles.primaryButton} onClick={() => joinRequest(r)}>
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {session && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13 }}>
              {isRequester ? `Helping you: ${session.helperUserId ? memberLabel(session.helperUserId) : 'waiting for someone to join…'}` : `Helping ${memberLabel(session.requesterUserId)}`}
              <span style={{ color: '#96969e' }}> — {session.status}</span>
            </div>
            <button type="button" className={styles.primaryButton} onClick={endSession}>
              End session
            </button>
          </div>

          {isRequester && session.status === 'notified' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: '#96969e', alignSelf: 'center' }}>Share:</span>
              <button type="button" className={styles.primaryButton} onClick={() => startSharing('desktop')}>
                Whole desktop
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => startSharing('window')}>
                One window
              </button>
            </div>
          )}

          {isHelper && (
            <video ref={videoRef} autoPlay muted style={{ width: '100%', borderRadius: 10, background: '#000', marginBottom: 12 }} />
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Control grants</div>
            {GRANT_KINDS.map(({ kind, label }) => {
              const grant = grants.find((g) => g.kind === kind);
              return (
                <div key={kind} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12.5 }}>
                  <div>
                    {label}
                    {grant && <span style={{ color: '#96969e' }}> — {grant.status}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isHelper && !grant && (
                      <button type="button" className={styles.primaryButton} style={{ fontSize: 11.5, padding: '3px 8px' }} onClick={() => requestGrant(kind)}>
                        Request
                      </button>
                    )}
                    {isRequester && grant?.status === 'requested' && (
                      <>
                        <button type="button" className={styles.primaryButton} style={{ fontSize: 11.5, padding: '3px 8px' }} onClick={() => decideGrant(grant.id, 'granted')}>
                          Approve
                        </button>
                        <button type="button" className={styles.primaryButton} style={{ fontSize: 11.5, padding: '3px 8px' }} onClick={() => decideGrant(grant.id, 'denied')}>
                          Deny
                        </button>
                      </>
                    )}
                    {grant?.status === 'granted' && (
                      <button type="button" className={styles.primaryButton} style={{ fontSize: 11.5, padding: '3px 8px' }} onClick={() => revokeGrant(grant.id)}>
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {terminalActive && (
            <div>
              <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Shared terminal</div>
              <pre
                style={{
                  background: '#0b0c10',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  maxHeight: 220,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {terminalOutput || (isHelper ? 'Not started yet.' : 'Waiting for the helper to start a shared terminal…')}
              </pre>
              {isHelper && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" className={styles.primaryButton} onClick={() => controlHelper.current?.startTerminal()}>
                    Start
                  </button>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Type a command and press Enter…"
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        controlHelper.current?.sendTerminalInput(terminalInput + '\n');
                        setTerminalInput('');
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
