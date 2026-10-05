import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../Dashboard/dashboard.module.css';
import { UsageCreditsPanel } from '../Dashboard/sections/UsageCreditsPanel';
import { getGivablePawCompute, givePawCompute, listPawComputeGifts, type PawComputeGift } from '../../organization/orgPawCompute';
import type { OrganizationMember } from '../../../shared/organization/OrganizationTypes';

const PRESETS = [100, 500, 1000, 2000];

const inputStyle: React.CSSProperties = {
  background: 'rgba(var(--pawos-overlay-rgb), 0.04)',
  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
  borderRadius: 8,
  color: 'inherit',
  padding: '8px 10px',
  fontSize: 13,
};

function formatPc(value: number): string {
  return `${value.toLocaleString('en-US')} PC`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function memberName(members: OrganizationMember[], userId: string): string {
  const member = members.find((m) => m.userId === userId);
  return member ? member.displayName || member.email : 'A former member';
}

/**
 * Organization admins (owner / billing administrators): buy Paw Compute, then give some of it to a
 * member. The member can spend it on PawOS Desktop and PawOS Web like their own.
 */
export function GivePawComputePanel({
  organizationId,
  organizationName,
  members,
  currentUserId,
  userEmail,
}: {
  organizationId: string;
  organizationName: string;
  members: OrganizationMember[];
  currentUserId: string;
  userEmail: string;
}) {
  const [givable, setGivable] = useState<number | null>(null);
  const [gifts, setGifts] = useState<PawComputeGift[]>([]);
  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('500');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const recipients = useMemo(
    () => members.filter((m): m is OrganizationMember & { userId: string } => m.status === 'active' && !!m.userId && m.userId !== currentUserId),
    [members, currentUserId]
  );

  const refresh = useCallback(async () => {
    const [left, history] = await Promise.all([getGivablePawCompute().catch(() => null), listPawComputeGifts(organizationId).catch(() => [])]);
    setGivable(left);
    setGifts(history);
  }, [organizationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pc = Math.floor(Number(amount));
  const canGive = !!memberId && Number.isFinite(pc) && pc > 0 && givable !== null && pc <= givable && !busy;

  const give = async () => {
    if (!canGive) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { givableLeft } = await givePawCompute(organizationId, memberId, pc, note);
      setGivable(givableLeft);
      setDone(`Gave ${formatPc(pc)} to ${memberName(members, memberId)}.`);
      setNote('');
      setGifts(await listPawComputeGifts(organizationId).catch(() => gifts));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Paw Compute couldn’t be given. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const totalGiven = gifts.reduce((sum, gift) => sum + gift.pc, 0);

  return (
    <div data-testid="give-paw-compute">
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Give Paw Compute to members</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Buy Paw Compute for {organizationName}, then give it to the members who need more. They can use it on PawOS Desktop and PawOS
          Web, on top of their own seat.
        </p>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 24, fontWeight: 600 }} data-testid="givable-pc">
            {givable === null ? '…' : formatPc(givable)}
          </span>
          <span className={styles.cardBody}>available to give</span>
        </div>

        {recipients.length === 0 ? (
          <p className={styles.cardBody} style={{ marginTop: 14 }}>
            Members appear here once they’ve joined {organizationName}.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              Member
              <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)} data-testid="give-member">
                <option value="">Choose a member</option>
                {recipients.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName ? `${m.displayName} (${m.email})` : m.email}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <label htmlFor="give-amount">Amount (PC)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  id="give-amount"
                  style={{ ...inputStyle, width: 140 }}
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="give-amount"
                />
                {PRESETS.map((preset) => (
                  <button key={preset} type="button" className={styles.chip} onClick={() => setAmount(String(preset))}>
                    {preset.toLocaleString('en-US')}
                  </button>
                ))}
              </div>
            </div>
            <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              Note (optional)
              <input style={inputStyle} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. For the release week" />
            </label>
            {givable !== null && pc > givable && (
              <p className={styles.cardBody} style={{ color: '#e0c28c' }}>
                That’s more than you have to give. Buy more Paw Compute below.
              </p>
            )}
            {error && <p style={{ color: '#e08c8c', fontSize: 12.5 }}>{error}</p>}
            {done && <p style={{ color: '#8ce0a8', fontSize: 12.5 }}>{done}</p>}
            <div>
              <button type="button" className={styles.primaryButton} disabled={!canGive} onClick={() => void give()} data-testid="give-submit">
                {busy ? 'Giving…' : 'Give Paw Compute'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <UsageCreditsPanel userEmail={userEmail} onPaymentComplete={() => void refresh()} />
      </div>

      <div className={styles.card} style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h3 className={styles.cardTitle}>Given to members</h3>
          {gifts.length > 0 && <span className={styles.cardBody}>{formatPc(totalGiven)} in total</span>}
        </div>
        {gifts.length === 0 ? (
          <p className={styles.cardBody} style={{ marginTop: 8 }}>
            Nothing given yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column' }}>
            {gifts.map((gift) => (
              <li
                key={gift.id}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)', fontSize: 13 }}
              >
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{memberName(members, gift.givenTo)}</strong>
                  <span style={{ opacity: 0.6 }}>
                    {' '}
                    · {formatWhen(gift.createdAt)}
                    {gift.givenBy !== currentUserId ? ` · by ${memberName(members, gift.givenBy)}` : ''}
                    {gift.note ? ` · ${gift.note}` : ''}
                  </span>
                </span>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatPc(gift.pc)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Members: what their organization has given them. Shown with their own usage. */
export function GivenToYouCard({ organizationId, currentUserId, members }: { organizationId: string; currentUserId: string; members?: OrganizationMember[] }) {
  const [gifts, setGifts] = useState<PawComputeGift[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPawComputeGifts(organizationId)
      .then((all) => {
        if (!cancelled) setGifts(all.filter((gift) => gift.givenTo === currentUserId));
      })
      .catch(() => {
        if (!cancelled) setGifts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, currentUserId]);

  if (!gifts || gifts.length === 0) return null;
  const total = gifts.reduce((sum, gift) => sum + gift.pc, 0);
  return (
    <div className={styles.card} style={{ marginTop: 16 }} data-testid="given-to-you">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h3 className={styles.cardTitle}>Given to you by your organization</h3>
        <span className={styles.cardBody}>{formatPc(total)}</span>
      </div>
      <p className={styles.cardBody} style={{ marginTop: 6 }}>
        Extra Paw Compute from your admins, on top of your seat. It’s included in your usage above and works on Desktop and Web.
      </p>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
        {gifts.map((gift) => (
          <li key={gift.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 13 }}>
            <span style={{ opacity: 0.75 }}>
              {formatWhen(gift.createdAt)}
              {members ? ` · from ${memberName(members, gift.givenBy)}` : ''}
              {gift.note ? ` · ${gift.note}` : ''}
            </span>
            <span style={{ fontWeight: 600 }}>{formatPc(gift.pc)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
