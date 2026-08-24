import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { organizationService, type PendingInvite } from '../../../organization/OrganizationService';
import { canManageBilling, canManageMembers } from '../../../../shared/organization/OrgPermissions';
import { isPersonalEmailDomain } from '../../../../shared/organization/PersonalEmailDomains';
import type { OrganizationRecord, OrganizationMember, OrgRole, OrgTier } from '../../../../shared/organization/OrganizationTypes';
import type { SeatTier } from '../../../../shared/billing/BillingTypes';
import type { AuthUser } from '../../../auth/AuthTypes';
import { getSupabaseClient } from '../../../auth/supabaseClient';
import { NativeBillingCheckoutModal, type NativeBillingCheckoutIntent } from '../../billing/NativeBillingCheckoutModal';
import { RolesCapabilityCard } from './RolesCapabilityCard';
import { OrganizationWorkspaceCard } from './OrganizationWorkspaceCard';
import { AuditLogCard } from './AuditLogCard';
import { CrmCard } from './CrmCard';
import { CreditPoolCard } from './CreditPoolCard';
import { ActivityDashboardCard } from './ActivityDashboardCard';
import { TemporaryPermissionCard } from './TemporaryPermissionCard';
import { RemoteAssistancePanel } from './RemoteAssistancePanel';
import { GovernancePolicyCard } from './GovernancePolicyCard';
import { ApprovalQueueCard } from './ApprovalQueueCard';
import { CredentialVaultCard } from './CredentialVaultCard';
import { SsoSettingsCard } from './SsoSettingsCard';
import { AutonomousTaskBillingCard } from './AutonomousTaskBillingCard';
import { OrganizationRolesCard } from './OrganizationRolesCard';
import { credentialVaultService } from '../../../organization/CredentialVaultService';
import { SectionHub, SectionDetail, type SectionTileDef } from '../SectionHub';
import {
  builtinJobRoleRef,
  customJobRoleRef,
  builtInOrgJobRolesByDepartment,
  ORG_JOB_ROLE_DEPARTMENTS,
  ORG_JOB_ROLE_DEPARTMENT_LABELS,
  type OrgJobRole,
} from '../../../../shared/organization/OrgJobRoles';
import {
  GaugeIcon,
  DesktopIcon,
  ShieldIcon,
  HistoryIcon,
  OfficeIcon,
  OrganizationIcon,
  CardIcon,
  SecurityIcon,
  PlugIcon,
  LanguageIcon,
  BarsIcon,
  AccountIcon,
} from '../NavIcons';

const ORG_SECTION_TILES: SectionTileDef[] = [
  { id: 'activity', title: 'Activity Dashboard', description: 'Live task and project activity across the organization.', icon: GaugeIcon },
  { id: 'remoteAssistance', title: 'Remote Assistance', description: 'Screen share and remote control sessions between teammates.', icon: DesktopIcon },
  { id: 'roles', title: 'Roles & Capabilities', description: 'What each role can do in this organization.', icon: ShieldIcon },
  { id: 'jobRoles', title: 'Organization Roles', description: 'Job titles and departments for each teammate — independent of billing and permissions.', icon: AccountIcon },
  { id: 'temporaryPermissions', title: 'Temporary Permissions', description: 'Grant a capability to a member for a limited time.', icon: HistoryIcon },
  { id: 'workspace', title: 'Workspace', description: 'Shared containers for projects, documents, and research.', icon: OfficeIcon },
  { id: 'crm', title: 'Organization CRM', description: 'Contacts, companies, and meeting notes shared to the org.', icon: OrganizationIcon },
  { id: 'credits', title: 'Credits & Billing', description: 'Credit pool and the Autonomous Ticket System balance.', icon: CardIcon },
  { id: 'governance', title: 'Governance & Approvals', description: 'Require approval before a member can take an action.', icon: SecurityIcon },
  { id: 'credentialVault', title: 'Credential Vault', description: 'Shared connector credentials for the organization.', icon: PlugIcon },
  { id: 'sso', title: 'Single Sign-On', description: 'Federated identity for Team and Enterprise plans.', icon: LanguageIcon },
  { id: 'auditLog', title: 'Audit Log', description: 'A record of security-relevant actions taken in this organization.', icon: BarsIcon },
];

const TEAM_ROLES: OrgRole[] = ['owner', 'billingAdministrator', 'workspaceAdministrator', 'member'];
const ENTERPRISE_ROLES: OrgRole[] = [
  'organizationOwner',
  'organizationAdministrator',
  'itAdministrator',
  'securityAdministrator',
  'billingAdministrator',
  'departmentManager',
  'member',
];

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

export function OrganizationSection({ user, onOpenSupportMessages }: { user: AuthUser; onOpenSupportMessages: () => void }) {
  const [tier, setTier] = useState<'go' | 'pro' | 'proMax' | 'team' | 'enterprise' | null>(null);
  const [org, setOrg] = useState<OrganizationRecord | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [inviteSeatTier, setInviteSeatTier] = useState<SeatTier>('standard');
  const [reassigningMemberId, setReassigningMemberId] = useState<string | null>(null);
  const [reassignEmailInput, setReassignEmailInput] = useState('');
  const [seatRequestMessage, setSeatRequestMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatCheckoutIntent, setSeatCheckoutIntent] = useState<NativeBillingCheckoutIntent | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [customJobRoles, setCustomJobRoles] = useState<OrgJobRole[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    if (user.isGuest) return;
    ipc.billingGetSubscription().then((s) => setTier(s.tier)).catch(() => {});
  }, [user.isGuest]);

  // billingSyncTierFromOrganization() was previously only ever called from
  // acceptInvite() below — an existing owner who already created their
  // organization in an earlier session never had their local tier
  // re-synced from it, so after any app restart the local billing store
  // (main-process, independent of Supabase) could fall back to its
  // pre-organization tier and this section would show "Create your
  // organization" even though the organization genuinely exists. Fetching
  // memberships is safe for any signed-in non-guest user regardless of
  // local tier — RLS simply returns no rows for someone who isn't a member
  // of anything — so this re-syncs tier from the real membership whenever
  // one exists, and does nothing for individual accounts with no org.
  useEffect(() => {
    if (user.isGuest) return;
    let cancelled = false;

    async function resyncTierFromOrganization() {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
        if (cancelled) return;
        try {
          const orgs = await organizationService.getMyOrganizations();
          const mine = orgs[0] ?? null;
          if (mine) {
            // P0-3 security fix: the main process independently re-verifies real, active membership
            // and the organization's real tier against Supabase using this token — mine.tier is never
            // trusted directly. See OrganizationTierVerification.ts.
            const supabase = await getSupabaseClient();
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (accessToken) {
              const synced = await ipc.billingSyncTierFromOrganization(accessToken, mine.id);
              if (!cancelled) setTier(synced.tier);
            }
            return;
          }
        } catch {
          return;
        }
      }
    }

    resyncTierFromOrganization();
    return () => {
      cancelled = true;
    };
  }, [user.isGuest]);

  useEffect(() => {
    if (tier !== 'team' && tier !== 'enterprise') return;
    let cancelled = false;

    // A fresh sign-in (especially the Google→Supabase session bridge in
    // GoogleAuthProvider.linkSupabaseSession) can resolve its own promise
    // slightly before the Supabase client's session is fully live for
    // subsequent requests — the very first fetch here can transiently see
    // no organizations even though the user genuinely owns one. Retry a
    // couple of times with a short backoff before accepting "no
    // organization" as real, so this self-heals instead of requiring a
    // manual tab remount or app reload.
    async function fetchWithRetry() {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
        if (cancelled) return;
        try {
          const orgs = await organizationService.getMyOrganizations();
          const mine = orgs[0] ?? null;
          if (mine) {
            if (cancelled) return;
            setOrg(mine);
            const members = await organizationService.getMembers(mine.id);
            if (!cancelled) setMembers(members);
            return;
          }
          if (attempt === 2 && !cancelled) setOrg(null);
        } catch (e) {
          if (!cancelled) setError(getErrorMessage(e));
          return;
        }
      }
    }

    fetchWithRetry();
    return () => {
      cancelled = true;
    };
  }, [tier]);

  // Phase 6: once this device knows which org it's in, pull down any
  // credentials the org has shared (GitHub/Vercel/etc.) into this device's
  // own local Infrastructure Runtime connectors — best-effort, silent, and
  // additive to bootstrap.ts's env-var wiring, never blocking on it.
  useEffect(() => {
    if (!org) return;
    credentialVaultService.applyAllToLocalConnectors(org.id).catch(() => {});
  }, [org]);

  // Refetch custom Organization Roles whenever the org loads and whenever the
  // detail panel closes (so edits made in OrganizationRolesCard — rename,
  // archive, create — show up immediately in the Members list's role select
  // and the role filter without needing a full reload).
  useEffect(() => {
    if (!org) return;
    organizationService.listCustomJobRoles(org.id).then(setCustomJobRoles).catch(() => {});
  }, [org, selectedSection]);

  // Zero-friction onboarding: a pending seat assigned to this account's email is claimed
  // automatically the moment we discover it — no Accept/Decline step. Pending invites are keyed by
  // email, not by the invitee's current tier — a brand-new invitee starts on Go, so this can't
  // be gated behind the team/enterprise tier check below.
  useEffect(() => {
    if (user.isGuest) return;
    organizationService
      .listMyPendingInvites()
      .then(setPendingInvites)
      .catch(() => {});
  }, [user.isGuest]);

  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (user.isGuest || pendingInvites.length === 0 || org || claiming) return;
    let cancelled = false;

    async function claimAllPendingSeats() {
      setClaiming(true);
      setError(null);
      try {
        for (const invite of pendingInvites) {
          await organizationService.acceptInvite(invite.organizationId);
        }
        const [orgs, invites] = await Promise.all([
          organizationService.getMyOrganizations(),
          organizationService.listMyPendingInvites(),
        ]);
        if (cancelled) return;
        const mine = orgs[0] ?? null;
        setOrg(mine);
        setPendingInvites(invites);
        if (mine) {
          setMembers(await organizationService.getMembers(mine.id));
          const supabase = await getSupabaseClient();
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (accessToken) {
            const synced = await ipc.billingSyncTierFromOrganization(accessToken, mine.id);
            if (!cancelled) setTier(synced.tier);
          }
        }
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setClaiming(false);
      }
    }

    claimAllPendingSeats();
    return () => {
      cancelled = true;
    };
  }, [pendingInvites, org, user.isGuest, claiming]);

  if (user.isGuest) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>No organization on a guest session</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Organizations require a real account on Team or Enterprise. Create a free account first.
        </p>
      </div>
    );
  }

  if (pendingInvites.length > 0 && !org) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Joining {pendingInvites[0]?.organizationName}…</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          A seat was assigned to your email — it's being activated automatically, no action needed.
        </p>
        {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  if (tier !== 'team' && tier !== 'enterprise') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Organizations are available on Team and Enterprise</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Upgrade to Team or Enterprise to create an organization, invite teammates, and assign roles.
        </p>
        <p className={styles.cardBody} style={{ marginTop: 10, fontSize: 12 }}>
          Team and Enterprise are designed for organizations — use your company email address. Personal
          email providers (Gmail, Outlook, Yahoo, etc.) aren't supported for organization workspaces.
        </p>
      </div>
    );
  }

  const roleOptions = tier === 'enterprise' ? ENTERPRISE_ROLES : TEAM_ROLES;
  const ownerRole: OrgRole = tier === 'enterprise' ? 'organizationOwner' : 'owner';
  const myMembership = members.find((m) => m.email.toLowerCase() === user.email?.toLowerCase());
  const myRole: OrgRole = myMembership?.role ?? (org?.ownerUserId === user.id ? ownerRole : 'member');

  async function createOrganization() {
    if (!newOrgName.trim() || !tier) return;
    setBusy(true);
    setError(null);
    try {
      const created = await organizationService.createOrganization(newOrgName.trim(), tier as OrgTier);
      setOrg(created);
      setMembers(await organizationService.getMembers(created.id));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function inviteMember() {
    if (!org || !inviteEmail.trim()) return;
    const invitedDomain = inviteEmail.trim().split('@')[1]?.toLowerCase();
    if (!invitedDomain || invitedDomain !== org.domain) {
      setError(`This organization only accepts teammates with an @${org.domain} email.`);
      return;
    }

    // Seat-limit gate: if the org has a configured seat count, check whether adding one more
    // member would exceed it. If so, require the admin to purchase an additional seat first.
    if (org.seatCount && org.seatCount > 0) {
      const activeMemberCount = members.filter((m) => m.status === 'active').length;
      if (activeMemberCount >= org.seatCount) {
        setSeatCheckoutIntent({
          kind: 'additionalSeat',
          organizationId: org.id,
          seatTier: inviteSeatTier,
          inviteEmail: inviteEmail.trim(),
          inviteRole: inviteRole,
        });
        return;
      }
    }

    await doInviteMember(inviteEmail.trim(), inviteRole, tier === 'team' ? inviteSeatTier : undefined);
  }

  async function doInviteMember(email: string, role: OrgRole, seatTier?: SeatTier) {
    if (!org) return;
    setBusy(true);
    setError(null);
    try {
      const member = await organizationService.inviteMember(org.id, email, role, seatTier);
      setMembers((prev) => [...prev, member]);
      setInviteEmail('');
      try {
        await ipc.mailSendOrganizationInvite({
          to: member.email,
          organizationName: org.name,
          role,
          inviterName: user.name,
        });
      } catch {
        // best-effort — the invite record itself is already created and visible in Members
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(memberId: string, role: OrgRole) {
    await organizationService.updateMemberRole(memberId, role);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
  }

  async function removeMember(memberId: string) {
    await organizationService.removeMember(memberId);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, status: 'removed' } : m)));
  }

  async function assignJobRole(memberId: string, jobRoleRef: string | null) {
    await organizationService.assignMemberJobRole(memberId, jobRoleRef);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, jobRoleRef } : m)));
  }

  async function requestSeatChange(member: OrganizationMember) {
    if (!org) return;
    const currentSeat = member.seatTier === 'premium' ? 'Premium' : 'Standard';
    const requestedSeat = currentSeat === 'Premium' ? 'Standard' : 'Premium';
    const reason = window.prompt(
      `Requesting a change from ${currentSeat} to ${requestedSeat} for ${member.email}. Add a short reason (optional):`,
      ''
    );
    if (reason === null) return; // user cancelled
    setBusy(true);
    setError(null);
    try {
      const summary = `Seat change request\nOrganization: ${org.name} (${org.slug})\nMember: ${member.email}\nCurrent seat: ${currentSeat}\nRequested seat: ${requestedSeat}\nReason: ${reason || '(none given)'}`;
      const created = await ipc.helpCreateConversation(summary);
      await ipc.helpAddTurn(created.id, { role: 'user', content: summary, timestamp: Date.now() });
      await ipc.helpUpdateConversation(created.id, {
        status: 'waitingPermission',
        needsPermission: true,
        currentState: 'Waiting for a PawOS admin to review this seat change request.',
      });
      setSeatRequestMessage('Request submitted — opening Messages…');
      onOpenSupportMessages();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reassignPendingSeat(memberId: string) {
    const newEmail = reassignEmailInput.trim();
    const invitedDomain = newEmail.split('@')[1]?.toLowerCase();
    if (!org || !invitedDomain || invitedDomain !== org.domain) {
      setError(`This organization only accepts teammates with an @${org?.domain} email.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await organizationService.reassignPendingMemberEmail(memberId, newEmail);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, email: newEmail } : m)));
      setReassigningMemberId(null);
      setReassignEmailInput('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function jobRoleSelectGroups(currentRef: string | null) {
    const groups: { label: string; options: { value: string; label: string }[] }[] = ORG_JOB_ROLE_DEPARTMENTS.map((dept) => ({
      label: ORG_JOB_ROLE_DEPARTMENT_LABELS[dept],
      options: builtInOrgJobRolesByDepartment(dept).map((r) => ({ value: builtinJobRoleRef(r.key), label: r.label })),
    }));
    const activeCustom = customJobRoles.filter((r) => !r.archived || customJobRoleRef(r.id) === currentRef);
    if (activeCustom.length > 0) {
      groups.push({
        label: 'Custom',
        options: activeCustom.map((r) => ({ value: customJobRoleRef(r.id), label: r.archived ? `${r.name} (archived)` : r.name })),
      });
    }
    return groups;
  }

  const myDomain = user.email?.split('@')[1]?.toLowerCase() ?? '';
  const myDomainIsPersonal = !myDomain || isPersonalEmailDomain(myDomain);

  if (!org) {
    if (myDomainIsPersonal) {
      return (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Team and Enterprise are designed for organizations</h3>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>
            Use your company email address to create or join an organization. Personal email providers
            (such as Gmail, Outlook, Yahoo, etc.) aren't supported for organization workspaces.
          </p>
          <p className={styles.cardBody} style={{ marginTop: 10, fontSize: 12 }}>
            You're signed in as <strong>{user.email ?? 'this account'}</strong>
            {myDomain && (
              <>
                {' '}(@{myDomain})
              </>
            )}
            . Sign in with a company email to continue.
          </p>
        </div>
      );
    }

    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Create your organization</h3>
        <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
          Your {tier === 'enterprise' ? 'Enterprise' : 'Team'} plan includes one organization with a real,
          human-readable ID (like ORG-RVT-001) and role-based member management. It will be scoped to your
          email domain — only teammates with an <strong>@{myDomain}</strong> email will be invitable.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Organization name" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} />
          <button type="button" className={styles.primaryButton} disabled={busy || !newOrgName.trim()} onClick={createOrganization}>
            Create organization
          </button>
        </div>
        {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>General</h3>
        <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
          <div>
            <p className={styles.cardBody}>Name</p>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{org.name}</p>
          </div>
          <div>
            <p className={styles.cardBody}>Organization ID</p>
            <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace' }}>{org.slug}</p>
          </div>
          <div>
            <p className={styles.cardBody}>Domain</p>
            <p style={{ fontSize: 14, fontWeight: 600 }}>@{org.domain}</p>
          </div>
          <div>
            <p className={styles.cardBody}>Plan</p>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{tier === 'enterprise' ? 'Enterprise' : 'Team'}</p>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h3 className={styles.cardTitle}>Members</h3>
            {org.seatCount && org.seatCount > 0 && (
              <span style={{ fontSize: 12, color: members.filter((m) => m.status === 'active').length >= org.seatCount! ? '#e08c8c' : '#96969e' }}>
                {members.filter((m) => m.status === 'active').length} / {org.seatCount} seats in use
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#96969e' }}>Filter by role</span>
            <select style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              {jobRoleSelectGroups(null).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {members.filter((m) => m.status !== 'removed' && (roleFilter === 'all' || m.jobRoleRef === roleFilter)).map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>{m.displayName ?? m.email}</div>
                {reassigningMemberId === m.id ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                    <input
                      style={{ ...inputStyle, fontSize: 12, padding: '4px 8px' }}
                      placeholder={`teammate@${org?.domain}`}
                      value={reassignEmailInput}
                      onChange={(e) => setReassignEmailInput(e.target.value)}
                    />
                    <button type="button" className={styles.primaryButton} disabled={busy || !reassignEmailInput.trim()} onClick={() => reassignPendingSeat(m.id)}>
                      Save
                    </button>
                    <button type="button" onClick={() => { setReassigningMemberId(null); setReassignEmailInput(''); }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#96969e' }}>
                    {m.email} · {m.status === 'invited' ? 'Pending — awaiting sign-in' : 'Active'}
                    {m.status === 'invited' && canManageMembers(myRole) && (
                      <button
                        type="button"
                        onClick={() => { setReassigningMemberId(m.id); setReassignEmailInput(m.email); }}
                        style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: 'var(--pawos-accent, #7c9cff)', cursor: 'pointer', padding: 0 }}
                      >
                        Reassign seat
                      </button>
                    )}
                  </div>
                )}
              </div>
              {tier === 'team' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      color: '#c8c8d2',
                      whiteSpace: 'nowrap',
                    }}
                    title="Seat type is fixed at invite time. Changing it goes through a support-approved request, never edited directly here."
                  >
                    {m.seatTier === 'premium' ? 'Premium seat' : 'Standard seat'}
                  </span>
                  {m.status !== 'invited' && canManageBilling(myRole) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => requestSeatChange(m)}
                      style={{ fontSize: 10.5, background: 'none', border: 'none', color: 'var(--pawos-accent, #7c9cff)', cursor: 'pointer', padding: 0 }}
                    >
                      {m.seatTier === 'premium' ? 'Request downgrade' : 'Request upgrade'}
                    </button>
                  )}
                </div>
              )}
              <select
                style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
                value={m.jobRoleRef ?? ''}
                disabled={!canManageMembers(myRole)}
                onChange={(e) => assignJobRole(m.id, e.target.value || null)}
                title="Organization Role (job title) — independent of seat type and permission role"
              >
                <option value="">— No role —</option>
                {jobRoleSelectGroups(m.jobRoleRef).map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                style={inputStyle}
                value={m.role}
                disabled={!canManageMembers(myRole)}
                onChange={(e) => changeRole(m.id, e.target.value as OrgRole)}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {canManageMembers(myRole) && (
                <button type="button" className={styles.primaryButton} onClick={() => removeMember(m.id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {members.filter((m) => m.status !== 'removed').length === 0 && (
            <p className={styles.cardBody}>No members yet — invite your first teammate below.</p>
          )}
          {members.filter((m) => m.status !== 'removed').length > 0 &&
            members.filter((m) => m.status !== 'removed' && (roleFilter === 'all' || m.jobRoleRef === roleFilter)).length === 0 && (
              <p className={styles.cardBody}>No members have that role yet.</p>
            )}
        </div>

        {canManageMembers(myRole) && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder={`teammate@${org.domain}`} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              {tier === 'team' && (
                <select style={inputStyle} value={inviteSeatTier} onChange={(e) => setInviteSeatTier(e.target.value as SeatTier)}>
                  <option value="standard">Standard seat ($20/mo)</option>
                  <option value="premium">Premium seat ($100/mo)</option>
                </select>
              )}
              <select style={inputStyle} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button type="button" className={styles.primaryButton} disabled={busy || !inviteEmail.trim()} onClick={inviteMember}>
                Invite
              </button>
            </div>
            <p className={styles.cardBody} style={{ marginTop: 6, fontSize: 12 }}>
              Only @{org.domain} emails can be invited to this organization.
              {tier === 'team' && ' Choose Standard or Premium for their seat rate.'}
              {org.seatCount && org.seatCount > 0 && members.filter((m) => m.status === 'active').length >= org.seatCount && (
                <span style={{ marginLeft: 6, color: '#e0c28c' }}>
                  All seats in use — clicking Invite will prompt you to purchase an additional seat first.
                </span>
              )}
            </p>
          </div>
        )}
        {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
        {seatRequestMessage && <p style={{ color: '#8ce0a8', fontSize: 12.5, marginTop: 10 }}>{seatRequestMessage}</p>}
        {!canManageBilling(myRole) && (
          <p className={styles.cardBody} style={{ marginTop: 10 }}>
            Billing is managed by your organization's owner or billing administrator.
          </p>
        )}
      </div>

      {selectedSection ? (
        <SectionDetail
          title={ORG_SECTION_TILES.find((t) => t.id === selectedSection)?.title ?? ''}
          onBack={() => setSelectedSection(null)}
        >
          {selectedSection === 'activity' && <ActivityDashboardCard organizationId={org.id} orgMembers={members} />}
          {selectedSection === 'remoteAssistance' && (
            <RemoteAssistancePanel organizationId={org.id} workspaceId={null} currentUser={user} orgMembers={members} />
          )}
          {selectedSection === 'roles' && <RolesCapabilityCard organizationId={org.id} roleOptions={roleOptions} />}
          {selectedSection === 'jobRoles' && <OrganizationRolesCard organizationId={org.id} orgMembers={members} />}
          {selectedSection === 'temporaryPermissions' && (
            <TemporaryPermissionCard organizationId={org.id} orgMembers={members} />
          )}
          {selectedSection === 'workspace' && (
            <OrganizationWorkspaceCard organizationId={org.id} orgMembers={members} currentUser={user} />
          )}
          {selectedSection === 'crm' && <CrmCard organizationId={org.id} />}
          {selectedSection === 'credits' && (
            <>
              <CreditPoolCard organizationId={org.id} orgMembers={members} />
              <AutonomousTaskBillingCard organizationId={org.id} />
            </>
          )}
          {selectedSection === 'governance' && (
            <>
              <GovernancePolicyCard organizationId={org.id} />
              <ApprovalQueueCard organizationId={org.id} />
            </>
          )}
          {selectedSection === 'credentialVault' && <CredentialVaultCard organizationId={org.id} />}
          {selectedSection === 'sso' && (
            <SsoSettingsCard organizationId={org.id} tier={tier === 'enterprise' ? 'enterprise' : 'team'} />
          )}
          {selectedSection === 'auditLog' && <AuditLogCard organizationId={org.id} />}
        </SectionDetail>
      ) : (
        <SectionHub tiles={ORG_SECTION_TILES} onSelect={setSelectedSection} />
      )}
      {seatCheckoutIntent && (
        <NativeBillingCheckoutModal
          intent={seatCheckoutIntent}
          onClose={() => setSeatCheckoutIntent(null)}
          onSuccess={() => {
            setSeatCheckoutIntent(null);
            // Refresh the org to pick up the updated seat_count, then invite the member
            if (seatCheckoutIntent.kind === 'additionalSeat') {
              const { inviteEmail, inviteRole, seatTier } = seatCheckoutIntent;
              void doInviteMember(inviteEmail, inviteRole as OrgRole, seatTier);
            }
            organizationService.getMyOrganizations().then((orgs) => {
              const mine = orgs[0] ?? null;
              if (mine) setOrg(mine);
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
