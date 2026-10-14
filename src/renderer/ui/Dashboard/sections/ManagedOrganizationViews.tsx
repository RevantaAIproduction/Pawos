import React, { useMemo, useState } from 'react';
import styles from '../dashboard.module.css';
import type { OrganizationMember, OrgRole } from '../../../../shared/organization/OrganizationTypes';

/**
 * The organization screen for Team and Enterprise: an identity summary, a tab bar, and a member
 * directory. These are presentation only — every value comes from the organization and member
 * records the screen already holds, every action is a callback, and nothing here adds a member,
 * buys a seat or starts a checkout (members and seats on these plans are arranged with PawOS).
 */

const border = '1px solid rgba(var(--pawos-overlay-rgb), 0.1)';
const muted: React.CSSProperties = { color: 'rgba(var(--pawos-overlay-rgb), 0.6)' };
const label: React.CSSProperties = { fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', ...muted };

/** Up to two initials from a name, or from the part of an email before the "@". */
export function initialsOf(nameOrEmail: string | null | undefined): string {
  const text = (nameOrEmail ?? '').trim();
  if (!text) return '?';
  const base = text.includes('@') && !text.includes(' ') ? text.split('@')[0] ?? text : text;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? base).slice(0, 2);
  return letters.toUpperCase();
}

/** A steady hue for a person, from their email — the same person always gets the same colour. */
export function avatarHue(seed: string | null | undefined): number {
  let hash = 0;
  for (const ch of (seed ?? '').toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  // Kept in the blue–violet range of the PawOS accent.
  return 205 + (hash % 80);
}

export function MemberAvatar({ name, email, size = 30 }: { name: string | null; email: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      data-testid="member-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
        color: '#fff',
        background: `hsl(${avatarHue(email)} 45% 42%)`,
      }}
    >
      {initialsOf(name || email)}
    </span>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'warn' }) {
  const tones: Record<string, React.CSSProperties> = {
    neutral: { background: 'rgba(var(--pawos-overlay-rgb), 0.07)', color: 'rgba(var(--pawos-overlay-rgb), 0.8)' },
    accent: { background: 'rgba(var(--pawos-accent-rgb), 0.16)', color: 'var(--pawos-fg)', border: '1px solid rgba(var(--pawos-accent-rgb), 0.45)' },
    good: { background: 'rgba(76, 175, 120, 0.14)', color: '#8ce0a8' },
    warn: { background: 'rgba(224, 194, 140, 0.14)', color: '#e0c28c' },
  };
  return (
    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', ...tones[tone] }}>{children}</span>
  );
}

function Fact({ name, children, testId }: { name: string; children: React.ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} style={{ minWidth: 0 }}>
      <div style={label}>{name}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3, overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

export interface OrganizationSummary {
  name: string;
  /** 'Team' | 'Enterprise' */
  plan: string;
  /** The organization's short id (its slug), for the copy action. */
  organizationId: string;
  domain: string;
  ownerName: string | null;
  ownerEmail: string | null;
  activeMembers: number;
  pendingMembers: number;
  /** Seats on record; null when PawOS has not recorded a seat count for this organization. */
  seatCount: number | null;
}

export function OrganizationSummaryCard({
  summary,
  logo,
  canContact,
  onContact,
  onCopyId,
  copied,
}: {
  summary: OrganizationSummary;
  /** The organization's logo, or its initials when it has none. */
  logo: React.ReactNode;
  canContact: boolean;
  onContact: () => void;
  onCopyId: () => void;
  copied: boolean;
}) {
  const seats =
    summary.seatCount && summary.seatCount > 0 ? `${summary.activeMembers} of ${summary.seatCount} seats in use` : `${summary.activeMembers} active`;
  return (
    <div className={styles.card} data-testid="org-summary">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {logo}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, overflowWrap: 'anywhere' }}>{summary.name}</h2>
            <Badge tone="accent">{summary.plan}</Badge>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 4, ...muted }}>
            {summary.domain ? `@${summary.domain}` : 'Organization'} · {seats}
            {summary.pendingMembers > 0 ? ` · ${summary.pendingMembers} pending` : ''}
          </div>
        </div>
        {canContact && (
          <button type="button" className={styles.primaryButton} onClick={onContact} data-testid="org-contact-pawos">
            Contact PawOS
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginTop: 18, paddingTop: 16, borderTop: border }}>
        {(summary.ownerName || summary.ownerEmail) && (
          <Fact name="Owner" testId="org-owner">
            {summary.ownerName ?? summary.ownerEmail}
            {summary.ownerName && summary.ownerEmail && <div style={{ fontSize: 12, fontWeight: 400, ...muted }}>{summary.ownerEmail}</div>}
          </Fact>
        )}
        <Fact name="Members" testId="org-members-count">
          {summary.activeMembers}
          {summary.pendingMembers > 0 && <span style={{ fontWeight: 400, ...muted }}> + {summary.pendingMembers} pending</span>}
        </Fact>
        {summary.seatCount !== null && summary.seatCount > 0 && (
          <Fact name="Seats" testId="org-seats">
            {summary.activeMembers} of {summary.seatCount} in use
          </Fact>
        )}
        {summary.domain && <Fact name="Domain">@{summary.domain}</Fact>}
        <Fact name="Organization ID">
          <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{summary.organizationId}</span>
          <button
            type="button"
            onClick={onCopyId}
            aria-label="Copy organization ID"
            style={{ marginLeft: 8, fontSize: 11, background: 'none', border: 'none', color: 'var(--pawos-accent, #7c9cff)', cursor: 'pointer', padding: 0 }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </Fact>
      </div>
    </div>
  );
}

export interface OrganizationTab {
  id: string;
  label: string;
}

export function OrganizationTabs({ tabs, active, onSelect }: { tabs: OrganizationTab[]; active: string; onSelect: (id: string) => void }) {
  return (
    <div role="tablist" aria-label="Organization" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={`${styles.chip} ${tab.id === active ? styles.chipActive : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Where member additions used to be: PawOS arranges members and seats for these plans. */
export function ContactPawosNote({ canContact, onContact, withButton }: { canContact: boolean; onContact: () => void; withButton: boolean }) {
  return (
    <div
      data-testid="org-members-managed-note"
      style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: 10, border, background: 'rgba(var(--pawos-overlay-rgb), 0.03)' }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Members and seats are managed by PawOS</div>
        <div style={{ fontSize: 12, marginTop: 3, ...muted }}>
          To add members, change seats, or adjust your plan, billing or credits, contact PawOS. The PawOS team reviews the request and confirms the plan and pricing; changes appear here once they are made.
        </div>
      </div>
      {withButton &&
        (canContact ? (
          <button type="button" className={styles.chip} onClick={onContact}>
            Contact PawOS
          </button>
        ) : (
          <span style={{ fontSize: 12, ...muted }}>Ask your organization’s owner or administrator.</span>
        ))}
    </div>
  );
}

const STATUS: Record<string, { text: string; tone: 'good' | 'warn' | 'neutral' }> = {
  active: { text: 'Active', tone: 'good' },
  invited: { text: 'Pending', tone: 'warn' },
  removed: { text: 'Removed', tone: 'neutral' },
};

/** "12 Oct 2026", or '—' when no date is recorded or it cannot be read. */
export function joinedLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface MemberTableProps {
  members: OrganizationMember[];
  /** Team shows each member's seat type; Enterprise has no seat types. */
  showSeatType: boolean;
  /** Whether the viewer may change roles and remove members (the existing role check). */
  canManage: boolean;
  roleOptions: OrgRole[];
  ownerUserId: string;
  busy?: boolean;
  onChangeRole: (memberId: string, role: OrgRole) => void;
  onRemove: (member: OrganizationMember) => void;
  /** The organization-role (job title) control for a row, from the existing screen. */
  renderJobRole?: (member: OrganizationMember) => React.ReactNode;
}

const cell: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', verticalAlign: 'middle', borderTop: border, fontSize: 13 };
const head: React.CSSProperties = { ...label, padding: '8px 12px', textAlign: 'left', fontWeight: 600 };
const field: React.CSSProperties = {
  background: 'rgba(var(--pawos-overlay-rgb), 0.04)',
  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.12)',
  borderRadius: 8,
  color: 'var(--pawos-fg)',
  padding: '7px 10px',
  fontSize: 12.5,
};

export function MemberTable({ members, showSeatType, canManage, roleOptions, ownerUserId, busy, onChangeRole, onRemove, renderJobRole }: MemberTableProps) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('all');
  const current = useMemo(() => members.filter((m) => m.status !== 'removed'), [members]);
  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return current.filter(
      (m) => (role === 'all' || m.role === role) && (!needle || m.email.toLowerCase().includes(needle) || (m.displayName ?? '').toLowerCase().includes(needle))
    );
  }, [current, search, role]);
  const rolesPresent = useMemo(() => roleOptions.filter((r) => current.some((m) => m.role === r)), [roleOptions, current]);

  return (
    <div data-testid="org-member-table">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          type="search"
          aria-label="Search members"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...field, flex: 1, minWidth: 180 }}
        />
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)} style={field}>
          <option value="all">All roles</option>
          {rolesPresent.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: 'auto', border, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={head}>Member</th>
              <th style={head}>Role</th>
              {showSeatType && <th style={head}>Seat</th>}
              <th style={head}>Status</th>
              <th style={head}>Joined</th>
              {canManage && <th style={{ ...head, textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => {
              const status = STATUS[m.status] ?? { text: m.status, tone: 'neutral' as const };
              const isOwner = m.userId !== null && m.userId === ownerUserId;
              return (
                <tr key={m.id} data-testid="org-member-row">
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <MemberAvatar name={m.displayName} email={m.email} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                          {m.displayName ?? m.email}
                          {isOwner && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, ...muted }}>Owner</span>}
                        </div>
                        {m.displayName && <div style={{ fontSize: 12, overflowWrap: 'anywhere', ...muted }}>{m.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={cell}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                      {canManage && !isOwner ? (
                        <select aria-label={`Role of ${m.email}`} value={m.role} onChange={(e) => onChangeRole(m.id, e.target.value as OrgRole)} style={field}>
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{m.role}</span>
                      )}
                      {renderJobRole?.(m)}
                    </div>
                  </td>
                  {showSeatType && (
                    <td style={cell}>
                      <span title="Seats are allocated by PawOS. Contact PawOS to change a seat.">
                        <Badge>{m.seatTier === 'premium' ? 'Premium' : 'Standard'}</Badge>
                      </span>
                    </td>
                  )}
                  <td style={cell}>
                    <Badge tone={status.tone}>{status.text}</Badge>
                  </td>
                  <td style={{ ...cell, whiteSpace: 'nowrap', ...muted }}>{joinedLabel(m.joinedAt)}</td>
                  {canManage && (
                    <td style={{ ...cell, textAlign: 'right' }}>
                      {/* The owner's own membership is not removed or re-roled from this table. */}
                      {!isOwner && (
                        <button type="button" className={styles.chip} disabled={busy} onClick={() => onRemove(m)} aria-label={`Remove ${m.email}`}>
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {current.length === 0 && (
          <p className={styles.cardBody} style={{ padding: '14px 12px', margin: 0 }} data-testid="org-members-empty">
            No members yet. Contact PawOS to add your team.
          </p>
        )}
        {current.length > 0 && shown.length === 0 && (
          <p className={styles.cardBody} style={{ padding: '14px 12px', margin: 0 }}>
            No members match that search.
          </p>
        )}
      </div>
    </div>
  );
}

/** What to ask before removing someone: who, by name and address. */
export function removalQuestion(member: Pick<OrganizationMember, 'displayName' | 'email'>, organizationName: string): string {
  const who = member.displayName ? `${member.displayName} (${member.email})` : member.email;
  return `Remove ${who} from ${organizationName}? They will lose access to this organization.`;
}
