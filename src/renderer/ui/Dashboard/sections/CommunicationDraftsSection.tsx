import React, { useEffect, useMemo, useState } from 'react';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import type { EmailDraft, EmailPreferences, EmailProviderKind, CommunicationSummary, ActionItem, Decision, FollowUp, ParticipantRecord, SessionTimelineEntry } from '../../../../shared/communication/CommunicationTypes';
import type { SessionCategory } from '../../../../shared/communication/SessionCategory';
import { SESSION_CATEGORY_LABELS, SESSION_TIMELINE_KIND_LABELS } from '../../../../shared/communication/SessionCategory';
import { aiProviderConfigStore } from '../../../ai/AIProviderConfigStore';

type TranscriptSegment = { speaker: string; text: string; atSeconds: number };

type DraftEntry = {
  communicationId: string;
  title: string;
  sessionCategory: SessionCategory;
  summary: CommunicationSummary;
  actionItems: ActionItem[];
  decisions: Decision[];
  followUps: FollowUp[];
  timeline: SessionTimelineEntry[];
  participants: ParticipantRecord[];
  transcriptSegments: TranscriptSegment[];
  attachmentPaths: string[];
  draft: EmailDraft | null;
};

function formatSeconds(atSeconds: number): string {
  const total = Math.max(0, Math.round(atSeconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const PROVIDER_OPTIONS: { value: EmailProviderKind; label: string }[] = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'microsoft365', label: 'Microsoft 365' },
  { value: 'googleWorkspace', label: 'Google Workspace' },
  { value: 'default', label: 'Default Mail App' },
];

function formatStatus(draft: EmailDraft | null): string {
  if (!draft) return 'no follow-up drafted yet';
  const sent = draft.recipients.filter((r) => draft.recipientStatus?.[r]?.status === 'sent').length;
  const pending = draft.recipients.length - sent;
  const parts: string[] = [];
  if (sent) parts.push(`${sent} sent`);
  if (pending) parts.push(`${pending} pending`);
  if (draft.keptPrivate) parts.push('kept private');
  return parts.join(' / ') || 'no recipients yet';
}

function CategoryBadge({ category }: { category: SessionCategory }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', color: '#c9c9d1' }}>
      {SESSION_CATEGORY_LABELS[category]}
    </span>
  );
}

type SequentialState = { queue: string[]; index: number; phase: 'confirming' | 'paused' | 'done' } | null;
type BatchState = { opened: string[]; phase: 'opened' } | null;

/** Sequential/Batch follow-up email sending — browser compose only, never an autonomous send. Paw only ever records a recipient as sent in direct response to an explicit user confirmation. */
export function CommunicationDraftsSection() {
  const ipc = useIpcBridge();
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefDisplayName, setPrefDisplayName] = useState('');
  const [prefEmail, setPrefEmail] = useState('');
  const [prefProvider, setPrefProvider] = useState<EmailProviderKind>('default');

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adHoc, setAdHoc] = useState<string[]>([]);
  const [adHocInput, setAdHocInput] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [sequential, setSequential] = useState<SequentialState>(null);
  const [batch, setBatch] = useState<BatchState>(null);
  const [batchMarkSelected, setBatchMarkSelected] = useState<Set<string>>(new Set());
  const [transcriptFilter, setTranscriptFilter] = useState('');

  const refreshDrafts = async () => {
    const result = await ipc.executeAction({ type: 'listEmailDrafts' });
    if (result.ok) setEntries((result.data as { drafts?: DraftEntry[] } | undefined)?.drafts ?? []);
  };

  useEffect(() => {
    refreshDrafts();
    ipc.executeAction({ type: 'getEmailPreferences' }).then((result) => {
      if (result.ok) {
        const prefs = (result.data as { preferences?: EmailPreferences | null } | undefined)?.preferences ?? null;
        setPreferences(prefs);
        if (prefs) {
          setPrefDisplayName(prefs.displayName);
          setPrefEmail(prefs.emailAddress);
          setPrefProvider(prefs.provider);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = entries.find((e) => e.communicationId === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setChecked(new Set(selected.draft?.recipients ?? []));
    setAdHoc([]);
    setAdHocInput('');
    setBatchMode(false);
    setSequential(null);
    setBatch(null);
    setBatchMarkSelected(new Set());
    setTranscriptFilter('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const savePreferences = async () => {
    if (!prefDisplayName.trim() || !prefEmail.trim()) return;
    const result = await ipc.executeAction({ type: 'setEmailPreferences', displayName: prefDisplayName.trim(), emailAddress: prefEmail.trim(), provider: prefProvider });
    if (result.ok) {
      setPreferences((result.data as { preferences?: EmailPreferences } | undefined)?.preferences ?? null);
      setPrefsOpen(false);
    }
  };

  const addAdHoc = () => {
    const value = adHocInput.trim();
    if (!value || adHoc.includes(value) || (selected && selected.draft?.recipients.includes(value))) return;
    setAdHoc((prev) => [...prev, value]);
    setChecked((prev) => new Set(prev).add(value));
    setAdHocInput('');
  };

  const allRecipients = useMemo(() => [...(selected?.draft?.recipients ?? []), ...adHoc], [selected, adHoc]);

  const openCompose = async (recipient: string) => {
    if (!selected || !selected.draft) return;
    await ipc.executeAction({ type: 'openMailComposeWindow', recipient, subject: selected.draft.subject, body: selected.draft.body });
  };

  const draftNow = async () => {
    if (!selected) return;
    const apiKey = aiProviderConfigStore.getApiKey('gemini');
    const result = await ipc.executeAction({ type: 'draftFollowupEmail', communicationId: selected.communicationId, apiKey });
    if (result.ok) await refreshDrafts();
  };

  const runSequentialStart = async (recipients: string[]) => {
    const first = recipients[0];
    if (!selected || first === undefined) return;
    setSequential({ queue: recipients, index: 0, phase: 'confirming' });
    await openCompose(first);
  };

  const sequentialAnswerYes = async () => {
    if (!selected || !selected.draft || !sequential) return;
    const recipient = sequential.queue[sequential.index];
    if (recipient === undefined) return;
    const result = await ipc.executeAction({ type: 'confirmEmailSent', communicationId: selected.communicationId, draftId: selected.draft.id, recipients: [recipient] });
    if (result.ok) await refreshDrafts();
    const nextIndex = sequential.index + 1;
    const next = sequential.queue[nextIndex];
    if (next !== undefined) {
      setSequential({ ...sequential, index: nextIndex, phase: 'confirming' });
      await openCompose(next);
    } else {
      setSequential({ ...sequential, phase: 'done' });
    }
  };

  const sequentialAnswerNotYet = () => {
    if (!sequential) return;
    setSequential({ ...sequential, phase: 'paused' });
  };

  const sequentialResume = async () => {
    if (!sequential) return;
    const current = sequential.queue[sequential.index];
    if (current === undefined) return;
    setSequential({ ...sequential, phase: 'confirming' });
    await openCompose(current);
  };

  const sequentialCancel = () => {
    setSequential(null);
  };

  const runBatchStart = async (recipients: string[]) => {
    if (!selected || recipients.length === 0) return;
    const opened: string[] = [];
    for (const recipient of recipients) {
      // eslint-disable-next-line no-await-in-loop
      await openCompose(recipient);
      opened.push(recipient);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    setBatchMarkSelected(new Set(opened));
    setBatch({ opened, phase: 'opened' });
  };

  const batchMarkAllSent = async () => {
    if (!selected || !selected.draft || !batch) return;
    const result = await ipc.executeAction({ type: 'confirmEmailSent', communicationId: selected.communicationId, draftId: selected.draft.id, recipients: batch.opened });
    if (result.ok) await refreshDrafts();
    setBatch(null);
  };

  const batchMarkSelectedSent = async () => {
    if (!selected || !selected.draft || !batch) return;
    const recipients = batch.opened.filter((r) => batchMarkSelected.has(r));
    if (recipients.length === 0) {
      setBatch(null);
      return;
    }
    const result = await ipc.executeAction({ type: 'confirmEmailSent', communicationId: selected.communicationId, draftId: selected.draft.id, recipients });
    if (result.ok) await refreshDrafts();
    setBatch(null);
  };

  const batchKeepPending = () => {
    setBatch(null);
  };

  const sendWithAll = () => {
    if (batchMode) runBatchStart(allRecipients);
    else runSequentialStart(allRecipients);
  };

  const sendWithSelected = () => {
    const recipients = allRecipients.filter((r) => checked.has(r));
    if (batchMode) runBatchStart(recipients);
    else runSequentialStart(recipients);
  };

  const copyEmail = async () => {
    if (!selected || !selected.draft) return;
    await ipc.executeAction({ type: 'copyTextToClipboard', text: `Subject: ${selected.draft.subject}\n\n${selected.draft.body}` });
  };

  const keepPrivate = async () => {
    if (!selected || !selected.draft) return;
    const result = await ipc.executeAction({ type: 'setEmailDraftPrivate', communicationId: selected.communicationId, draftId: selected.draft.id });
    if (result.ok) await refreshDrafts();
  };

  const toggleChecked = (recipient: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(recipient)) next.delete(recipient);
      else next.add(recipient);
      return next;
    });
  };

  if (entries.length === 0) {
    return (
      <div>
        <PreferencesForm
          open={prefsOpen}
          setOpen={setPrefsOpen}
          preferences={preferences}
          displayName={prefDisplayName}
          setDisplayName={setPrefDisplayName}
          email={prefEmail}
          setEmail={setPrefEmail}
          provider={prefProvider}
          setProvider={setPrefProvider}
          onSave={savePreferences}
        />
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>No meeting summaries yet</h3>
          <p className={styles.emptyBody}>
            Once Paw finishes processing a Virtual Meeting, Phone Call, or In-Person session, its summary shows up here —
            with an optional follow-up email ready to send from your own browser, one recipient at a time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PreferencesForm
        open={prefsOpen}
        setOpen={setPrefsOpen}
        preferences={preferences}
        displayName={prefDisplayName}
        setDisplayName={setPrefDisplayName}
        email={prefEmail}
        setEmail={setPrefEmail}
        provider={prefProvider}
        setProvider={setPrefProvider}
        onSave={savePreferences}
      />

      <div className={styles.mailPreview}>
        <div className={styles.mailPreviewList}>
          {entries.map((entry) => (
            <button
              key={entry.communicationId}
              type="button"
              className={`${styles.mailPreviewItem} ${selectedId === entry.communicationId ? styles.mailPreviewItemActive : ''}`}
              onClick={() => setSelectedId(entry.communicationId)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <CategoryBadge category={entry.sessionCategory} />
                <span>{entry.title}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6c6c74' }}>
                {entry.summary.headline} · {formatStatus(entry.draft)}
              </div>
              {entry.sessionCategory === 'phoneCall' && (
                <div style={{ fontSize: 10.5, color: '#c9a227', marginTop: 2 }}>
                  Real-time phone-call audio capture isn't available yet — this may be a placeholder session.
                </div>
              )}
            </button>
          ))}
        </div>

        <div className={styles.mailPreviewFrame} style={{ padding: selected ? 20 : 0, overflowY: 'auto' }}>
          {!selected && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <p className={styles.cardBody}>Select a draft to review it.</p>
            </div>
          )}
          {selected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <CategoryBadge category={selected.sessionCategory} />
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{selected.title}</h2>
              </div>
              {selected.sessionCategory === 'phoneCall' && (
                <p className={styles.cardBody} style={{ marginBottom: 10, color: '#c9a227', fontSize: 12 }}>
                  Real-time phone-call audio capture isn't available yet — this session may be a placeholder with no
                  real transcript content.
                </p>
              )}

              <h3 className={styles.subheading} style={{ marginBottom: 6 }}>Meeting Summary</h3>
              <p className={styles.cardBody} style={{ marginBottom: 6, fontWeight: 600 }}>{selected.summary.headline}</p>
              <p className={styles.cardBody} style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{selected.summary.summary}</p>
              {selected.summary.keyPoints.length > 0 && (
                <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                  {selected.summary.keyPoints.map((point, i) => (
                    <li key={i} className={styles.cardBody} style={{ marginBottom: 4 }}>{point}</li>
                  ))}
                </ul>
              )}
              {selected.summary.executiveSummary && (
                <>
                  <p className={styles.cardBody} style={{ marginBottom: 4 }}><strong>Executive Summary</strong></p>
                  <p className={styles.cardBody} style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{selected.summary.executiveSummary}</p>
                </>
              )}
              <p className={styles.cardBody} style={{ marginBottom: 4 }}><strong>Risks</strong></p>
              {(selected.summary.risks ?? []).length > 0 ? (
                <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                  {(selected.summary.risks ?? []).map((risk, i) => (
                    <li key={i} className={styles.cardBody} style={{ marginBottom: 4 }}>{risk}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 12 }}>None identified.</p>
              )}
              <p className={styles.cardBody} style={{ marginBottom: 4 }}><strong>Open Questions</strong></p>
              {(selected.summary.openQuestions ?? []).length > 0 ? (
                <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                  {(selected.summary.openQuestions ?? []).map((q, i) => (
                    <li key={i} className={styles.cardBody} style={{ marginBottom: 4 }}>{q}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 12 }}>None identified.</p>
              )}
              <p className={styles.cardBody} style={{ marginBottom: 4 }}><strong>Suggested Next Meeting Agenda</strong></p>
              {(selected.summary.suggestedNextAgenda ?? []).length > 0 ? (
                <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                  {(selected.summary.suggestedNextAgenda ?? []).map((item, i) => (
                    <li key={i} className={styles.cardBody} style={{ marginBottom: 4 }}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 12 }}>None suggested.</p>
              )}
              {selected.actionItems.length > 0 && (
                <>
                  <p className={styles.cardBody} style={{ marginBottom: 4 }}><strong>Action Items</strong></p>
                  <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                    {selected.actionItems.map((item) => (
                      <li key={item.id} className={styles.cardBody} style={{ marginBottom: 4 }}>
                        {item.description}{item.owner ? ` — ${item.owner}` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {selected.decisions.length > 0 && (
                <>
                  <p className={styles.cardBody} style={{ marginBottom: 4 }}><strong>Decisions</strong></p>
                  <ul style={{ margin: '0 0 20px', paddingLeft: 18 }}>
                    {selected.decisions.map((d) => (
                      <li key={d.id} className={styles.cardBody} style={{ marginBottom: 4 }}>{d.description}</li>
                    ))}
                  </ul>
                </>
              )}

              <h3 className={styles.subheading} style={{ marginBottom: 6 }}>Follow-ups</h3>
              {selected.followUps.length > 0 ? (
                <ul style={{ margin: '0 0 16px', paddingLeft: 18 }}>
                  {selected.followUps.map((f) => (
                    <li key={f.id} className={styles.cardBody} style={{ marginBottom: 4 }}>
                      {f.reason} — {f.suggestedAction}{f.suggestedWhen ? ` (${f.suggestedWhen})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 16 }}>No follow-ups identified for this session.</p>
              )}

              <h3 className={styles.subheading} style={{ marginBottom: 6 }}>Participants</h3>
              {selected.participants.length > 0 ? (
                <ul style={{ margin: '0 0 16px', paddingLeft: 18 }}>
                  {selected.participants.map((p) => (
                    <li key={p.id} className={styles.cardBody} style={{ marginBottom: 4 }}>
                      {p.name}{p.role ? ` — ${p.role}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 16 }}>No participants detected for this session.</p>
              )}

              <h3 className={styles.subheading} style={{ marginBottom: 6 }}>Timeline</h3>
              {selected.timeline.length > 0 ? (
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, maxHeight: 200, overflowY: 'auto' }}>
                  {selected.timeline.map((entry, i) => (
                    <li key={i} className={styles.cardBody} style={{ marginBottom: 4, fontSize: 12.5 }}>
                      <span style={{ color: '#8a8a92' }}>[{formatSeconds(entry.atSeconds)}]</span>{' '}
                      <strong>{SESSION_TIMELINE_KIND_LABELS[entry.kind]}:</strong> {entry.description}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 16 }}>No timeline yet — this session may still be processing.</p>
              )}

              <h3 className={styles.subheading} style={{ marginBottom: 6 }}>Transcript</h3>
              {selected.transcriptSegments.length > 0 ? (
                <>
                  <input
                    type="text"
                    placeholder="Filter transcript…"
                    value={transcriptFilter}
                    onChange={(e) => setTranscriptFilter(e.target.value)}
                    style={{ width: '100%', marginBottom: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: '#f5f5f7', fontSize: 12.5 }}
                  />
                  {(() => {
                    const filterLower = transcriptFilter.trim().toLowerCase();
                    const matches = filterLower
                      ? selected.transcriptSegments.filter((s) => s.text.toLowerCase().includes(filterLower))
                      : selected.transcriptSegments;
                    return matches.length > 0 ? (
                      <ul style={{ margin: '0 0 16px', paddingLeft: 18, maxHeight: 200, overflowY: 'auto' }}>
                        {matches.map((s, i) => (
                          <li key={i} className={styles.cardBody} style={{ marginBottom: 4, fontSize: 12.5 }}>
                            <span style={{ color: '#8a8a92' }}>[{formatSeconds(s.atSeconds)}]</span> <strong>{s.speaker}:</strong> {s.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.cardBody} style={{ marginBottom: 16 }}>No matches.</p>
                    );
                  })()}
                </>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 16 }}>No transcript segments available for this session.</p>
              )}

              <h3 className={styles.subheading} style={{ marginBottom: 6 }}>Attachments</h3>
              {selected.attachmentPaths.length > 0 ? (
                <ul style={{ margin: '0 0 16px', paddingLeft: 18 }}>
                  {selected.attachmentPaths.map((path, i) => (
                    <li key={i} className={styles.cardBody} style={{ marginBottom: 4 }}>{path}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.cardBody} style={{ marginBottom: 16 }}>Attachment capture isn't wired up yet — nothing is attached to sessions today.</p>
              )}

              {selected.sessionCategory === 'virtualMeeting' && (
                <>
                  <h3 className={styles.subheading} style={{ marginBottom: 6 }}>Chat / Messages</h3>
                  <p className={styles.cardBody} style={{ marginBottom: 16 }}>
                    Chat and in-meeting messages aren't captured yet — only audio is recorded for virtual meetings.
                  </p>
                </>
              )}

              {!selected.draft && (
                <button type="button" className={styles.chip} onClick={draftNow} style={{ marginBottom: 8 }}>
                  Draft a follow-up email
                </button>
              )}

              {selected.draft && (
                <>
              <h3 className={styles.subheading} style={{ margin: '20px 0 6px' }}>Follow-up Email</h3>
              <p className={styles.cardBody} style={{ marginBottom: 6, fontWeight: 600 }}>{selected.draft.subject}</p>
              <p className={styles.cardBody} style={{ marginBottom: 18, whiteSpace: 'pre-wrap' }}>{selected.draft.body}</p>

              <p className={styles.cardBody} style={{ marginBottom: 6 }}><strong>Recipients</strong></p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {allRecipients.map((r) => {
                  const status = selected.draft?.recipientStatus?.[r];
                  return (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={checked.has(r)} onChange={() => toggleChecked(r)} />
                      <span>{r}</span>
                      <span style={{ fontSize: 11, color: status?.status === 'sent' ? '#7ee787' : '#6c6c74' }}>
                        {status?.status === 'sent' ? `Sent at ${new Date(status.sentAt ?? 0).toLocaleTimeString()}` : 'Pending'}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  type="email"
                  placeholder="Add recipient (e.g. someone who missed the meeting)"
                  value={adHocInput}
                  onChange={(e) => setAdHocInput(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: '#f5f5f7', fontSize: 12.5 }}
                />
                <button type="button" className={styles.chip} onClick={addAdHoc}>Add</button>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#96969e', marginBottom: 16 }}>
                <input type="checkbox" checked={batchMode} onChange={(e) => setBatchMode(e.target.checked)} disabled={(!!sequential && sequential.phase !== 'done') || !!batch} />
                Batch mode — open all compose windows at once instead of one at a time (no per-email confirmation)
              </label>

              {sequential && (
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
                  {sequential.phase !== 'done' ? (
                    <>
                      <p className={styles.cardBody} style={{ marginBottom: 8 }}>
                        Did you send this email to <strong>{sequential.queue[sequential.index]}</strong>?
                      </p>
                      {sequential.phase === 'confirming' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className={styles.chip} onClick={sequentialAnswerYes}>Yes</button>
                          <button type="button" className={styles.chip} onClick={sequentialAnswerNotYet}>Not Yet</button>
                        </div>
                      )}
                      {sequential.phase === 'paused' && (
                        <>
                          <p className={styles.cardBody} style={{ marginBottom: 8 }}>Paused — nothing was recorded.</p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className={styles.chip} onClick={sequentialResume}>Resume</button>
                            <button type="button" className={styles.chip} onClick={sequentialCancel}>Cancel</button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <p className={styles.cardBody}>Done — every recipient in this run has been accounted for.</p>
                  )}
                </div>
              )}

              {batch && (
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p className={styles.cardBody} style={{ marginBottom: 8 }}>Did you send these emails?</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {batch.opened.map((r) => (
                      <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                        <input
                          type="checkbox"
                          checked={batchMarkSelected.has(r)}
                          onChange={() => setBatchMarkSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(r)) next.delete(r); else next.add(r);
                            return next;
                          })}
                        />
                        {r}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className={styles.chip} onClick={batchMarkAllSent}>Mark All as Sent</button>
                    <button type="button" className={styles.chip} onClick={batchMarkSelectedSent}>Mark Selected as Sent</button>
                    <button type="button" className={styles.chip} onClick={batchKeepPending}>Keep as Pending</button>
                  </div>
                </div>
              )}

              {(!sequential || sequential.phase === 'done') && !batch && !selected.draft.keptPrivate && (
                <div className={styles.quickActions}>
                  <button type="button" className={styles.chip} onClick={sendWithAll}>Send with All</button>
                  <button type="button" className={styles.chip} onClick={sendWithSelected}>Send with Selected</button>
                  <button type="button" className={styles.chip} onClick={copyEmail}>Copy Email</button>
                  <button type="button" className={styles.chip} onClick={keepPrivate}>Keep Private</button>
                </div>
              )}
              {selected.draft.keptPrivate && (
                <p className={styles.cardBody}>This draft is kept private — no send controls are shown.</p>
              )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreferencesForm({
  open,
  setOpen,
  preferences,
  displayName,
  setDisplayName,
  email,
  setEmail,
  provider,
  setProvider,
  onSave,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  preferences: EmailPreferences | null;
  displayName: string;
  setDisplayName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  provider: EmailProviderKind;
  setProvider: (v: EmailProviderKind) => void;
  onSave: () => void;
}) {
  return (
    <div style={{ marginBottom: 20, padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <h3 className={styles.subheading} style={{ margin: 0 }}>Email Preferences</h3>
        <span className={styles.cardBody}>{preferences ? preferences.emailAddress : 'Not set'}</span>
      </div>
      <p className={styles.cardBody} style={{ marginTop: 6 }}>
        A simple preference that tells Paw how to open compose windows. This is not a login, authentication, or connected
        account. Paw never stores credentials or authenticates with any email provider.
      </p>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxWidth: 360 }}>
          <input
            type="text"
            placeholder="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: '#f5f5f7', fontSize: 12.5 }}
          />
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: '#f5f5f7', fontSize: 12.5 }}
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as EmailProviderKind)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', color: '#f5f5f7', fontSize: 12.5 }}
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button type="button" className={styles.chip} onClick={onSave} style={{ alignSelf: 'flex-start' }}>Save</button>
        </div>
      )}
    </div>
  );
}
