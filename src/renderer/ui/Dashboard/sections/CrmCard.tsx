import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { crmService } from '../../../organization/CrmService';
import { orgSyncBridge } from '../../../organization/OrgSyncBridge';
import type { OrgCompany, OrgContact, OrgMeetingSummary, OrgFollowUp } from '../../../../shared/organization/CrmTypes';
import type { ParticipantRecord, CompanyRecord, CommunicationSummary } from '../../../../shared/communication/CommunicationTypes';

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
 * Phase 1 — organization-shared CRM. This is a deliberate, opt-in
 * projection of local Communication Runtime data (see OrgSyncBridge):
 * a member picks one of their own local contacts/companies/meeting
 * summaries to share; nothing syncs automatically or in the background.
 * Visible to every active org member (organization CRM visibility);
 * sharing is open to any member, editing others' shares requires
 * crm.manage.
 */
export function CrmCard({ organizationId }: { organizationId: string }) {
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [contacts, setContacts] = useState<OrgContact[]>([]);
  const [summaries, setSummaries] = useState<OrgMeetingSummary[]>([]);
  const [followUps, setFollowUps] = useState<OrgFollowUp[]>([]);

  const [localParticipants, setLocalParticipants] = useState<ParticipantRecord[]>([]);
  const [localCompanies, setLocalCompanies] = useState<CompanyRecord[]>([]);
  const [localSummaries, setLocalSummaries] = useState<CommunicationSummary[]>([]);

  const [pickedParticipantId, setPickedParticipantId] = useState('');
  const [pickedCompanyId, setPickedCompanyId] = useState('');
  const [pickedSummaryId, setPickedSummaryId] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([
      crmService.listCompanies(organizationId),
      crmService.listContacts(organizationId),
      crmService.listMeetingSummaries(organizationId),
      crmService.listFollowUps(organizationId),
    ])
      .then(([c, p, s, f]) => {
        setCompanies(c);
        setContacts(p);
        setSummaries(s);
        setFollowUps(f);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }

  useEffect(reload, [organizationId]);

  useEffect(() => {
    Promise.all([orgSyncBridge.listShareableParticipants(), orgSyncBridge.listShareableCompanies(), orgSyncBridge.listShareableSummaries()])
      .then(([p, c, s]) => {
        setLocalParticipants(p);
        setLocalCompanies(c);
        setLocalSummaries(s);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  async function shareCompany() {
    const local = localCompanies.find((c) => c.id === pickedCompanyId);
    if (!local) return;
    setError(null);
    try {
      await orgSyncBridge.shareCompany(organizationId, local);
      setPickedCompanyId('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function shareContact() {
    const local = localParticipants.find((p) => p.id === pickedParticipantId);
    if (!local) return;
    setError(null);
    try {
      await orgSyncBridge.shareParticipant(organizationId, local);
      setPickedParticipantId('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function shareSummary() {
    const local = localSummaries.find((s) => s.communicationId === pickedSummaryId);
    if (!local) return;
    setError(null);
    try {
      await orgSyncBridge.shareMeetingSummary(organizationId, local);
      setPickedSummaryId('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Organization CRM</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Contacts, companies, and meeting notes your team has chosen to share into this organization. Sharing is manual —
        your local Communication Runtime data is never uploaded automatically.
      </p>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Companies ({companies.length})</div>
        {companies.map((c) => (
          <div key={c.id} style={rowStyle}>
            {c.name} {c.domain && <span style={{ color: '#96969e' }}>({c.domain})</span>}
          </div>
        ))}
        {localCompanies.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={pickedCompanyId} onChange={(e) => setPickedCompanyId(e.target.value)}>
              <option value="">Share a local company…</option>
              {localCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className={styles.primaryButton} disabled={!pickedCompanyId} onClick={shareCompany}>
              Share
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Contacts ({contacts.length})</div>
        {contacts.map((c) => (
          <div key={c.id} style={rowStyle}>
            {c.name} {c.role && <span style={{ color: '#96969e' }}>— {c.role}</span>}
          </div>
        ))}
        {localParticipants.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={pickedParticipantId} onChange={(e) => setPickedParticipantId(e.target.value)}>
              <option value="">Share a local contact…</option>
              {localParticipants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className={styles.primaryButton} disabled={!pickedParticipantId} onClick={shareContact}>
              Share
            </button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Meeting summaries ({summaries.length})</div>
        {summaries.map((s) => (
          <div key={s.id} style={rowStyle}>
            {s.headline} <span style={{ color: '#96969e' }}>{new Date(s.occurredAt).toLocaleDateString()}</span>
          </div>
        ))}
        {localSummaries.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={pickedSummaryId} onChange={(e) => setPickedSummaryId(e.target.value)}>
              <option value="">Share a local meeting summary…</option>
              {localSummaries.map((s) => (
                <option key={s.communicationId} value={s.communicationId}>
                  {s.headline}
                </option>
              ))}
            </select>
            <button type="button" className={styles.primaryButton} disabled={!pickedSummaryId} onClick={shareSummary}>
              Share
            </button>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Follow-ups ({followUps.length})</div>
        {followUps.length === 0 && <p className={styles.cardBody}>No shared follow-ups yet.</p>}
        {followUps.map((f) => (
          <div key={f.id} style={rowStyle}>
            {f.description} <span style={{ color: '#96969e' }}>{f.status}</span>
          </div>
        ))}
      </div>

      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
