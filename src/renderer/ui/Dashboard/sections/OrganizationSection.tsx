import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { organizationService, type PendingInvite } from '../../../organization/OrganizationService';
import { canManageBilling, canManageMembers } from '../../../../shared/organization/OrgPermissions';
import { isPersonalEmailDomain } from '../../../../shared/organization/PersonalEmailDomains';
import type { OrganizationRecord, OrganizationMember, OrgRole, OrgTier } from '../../../../shared/organization/OrganizationTypes';
import type { SeatTier } from '../../../../shared/billing/BillingTypes';
import type { AuthUser } from '../../../auth/AuthTypes';
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
import { credentialVaultService } from '../../../organization/CredentialVaultService';

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

export function OrganizationSection({ user }: { user: AuthUser }) {
  const [tier, setTier] = useState<'go' | 'pro' | 'proMax' | 'team' | 'enterprise' | null>(null);
  const [org, setOrg] = useState<OrganizationRecord | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [inviteSeatTier, setInviteSeatTier] = useState<SeatTier>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            const synced = await ipc.billingSyncTierFromOrganization(mine.tier);
            if (!cancelled) setTier(synced.tier);
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

  // Pending invites are keyed by email, not by the invitee's current tier —
  // a brand-new invitee starts on Paw Go and must see (and be able to
  // accept) their invite before their tier is upgraded, so this can't be
  // gated behind the team/enterprise tier check above.
  useEffect(() => {
    if (user.isGuest) return;
    organizationService
      .listMyPendingInvites()
      .then(setPendingInvites)
      .catch(() => {});
  }, [user.isGuest]);

  async function acceptInvite(organizationId: string) {
    setBusy(true);
    setError(null);
    try {
      await organizationService.acceptInvite(organizationId);
      const [orgs, invites] = await Promise.all([
        organizationService.getMyOrganizations(),
        organizationService.listMyPendingInvites(),
      ]);
      const mine = orgs[0] ?? null;
      setOrg(mine);
      setPendingInvites(invites);
      if (mine) {
        setMembers(await organizationService.getMembers(mine.id));
        const synced = await ipc.billingSyncTierFromOrganization(mine.tier);
        setTier(synced.tier);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (user.isGuest) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>No organization on a guest session</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Organizations require a real account on Paw Team or Paw Enterprise. Create a free account first.
        </p>
      </div>
    );
  }

  if (pendingInvites.length > 0 && !org) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {pendingInvites.map((invite) => (
          <div key={invite.organizationId} className={styles.card}>
            <h3 className={styles.cardTitle}>You've been invited to {invite.organizationName}</h3>
            <p className={styles.cardBody} style={{ marginTop: 6 }}>
              {invite.organizationSlug} · Role: {invite.role}
            </p>
            <p className={styles.cardBody} style={{ marginTop: 6, fontSize: 12 }}>
              Accepting adds you to this organization's Team plan — no purchase needed, your teammate's seats cover you.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              style={{ marginTop: 12 }}
              disabled={busy}
              onClick={() => acceptInvite(invite.organizationId)}
            >
              Accept invite
            </button>
            {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (tier !== 'team' && tier !== 'enterprise') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Organizations are available on Paw Team and Paw Enterprise</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Upgrade to Paw Team or Paw Enterprise to create an organization, invite teammates, and assign roles.
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
    setBusy(true);
    setError(null);
    try {
      const member = await organizationService.inviteMember(
        org.id,
        inviteEmail.trim(),
        inviteRole,
        tier === 'team' ? inviteSeatTier : undefined
      );
      setMembers((prev) => [...prev, member]);
      setInviteEmail('');
      try {
        await ipc.mailSendOrganizationInvite({
          to: member.email,
          organizationName: org.name,
          role: inviteRole,
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

  async function changeSeatTier(memberId: string, seatTier: SeatTier) {
    await organizationService.updateMemberSeatTier(memberId, seatTier);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, seatTier } : m)));
  }

  async function removeMember(memberId: string) {
    await organizationService.removeMember(memberId);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, status: 'removed' } : m)));
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
            <p style={{ fontSize: 14, fontWeight: 600 }}>{tier === 'enterprise' ? 'Paw Enterprise' : 'Paw Team'}</p>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Members</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {members.filter((m) => m.status !== 'removed').map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>{m.displayName ?? m.email}</div>
                <div style={{ fontSize: 12, color: '#96969e' }}>{m.email} · {m.status === 'invited' ? 'Invited' : 'Active'}</div>
              </div>
              {tier === 'team' && (
                <select
                  style={inputStyle}
                  value={m.seatTier ?? 'standard'}
                  disabled={!canManageMembers(myRole)}
                  onChange={(e) => changeSeatTier(m.id, e.target.value as SeatTier)}
                >
                  <option value="standard">Standard seat</option>
                  <option value="premium">Premium seat</option>
                </select>
              )}
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
            </p>
          </div>
        )}
        {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
        {!canManageBilling(myRole) && (
          <p className={styles.cardBody} style={{ marginTop: 10 }}>
            Billing is managed by your organization's owner or billing administrator.
          </p>
        )}
      </div>

      <ActivityDashboardCard organizationId={org.id} orgMembers={members} />

      <RemoteAssistancePanel organizationId={org.id} workspaceId={null} currentUser={user} orgMembers={members} />
      <RolesCapabilityCard organizationId={org.id} roleOptions={roleOptions} />
      <TemporaryPermissionCard organizationId={org.id} orgMembers={members} />
      <OrganizationWorkspaceCard organizationId={org.id} orgMembers={members} currentUser={user} />
      <CrmCard organizationId={org.id} />
      <CreditPoolCard organizationId={org.id} orgMembers={members} />
      <AutonomousTaskBillingCard organizationId={org.id} />

      <GovernancePolicyCard organizationId={org.id} />
      <ApprovalQueueCard organizationId={org.id} />
      <CredentialVaultCard organizationId={org.id} />
      <SsoSettingsCard organizationId={org.id} tier={tier === 'enterprise' ? 'enterprise' : 'team'} />

      <AuditLogCard organizationId={org.id} />
    </div>
  );
}
