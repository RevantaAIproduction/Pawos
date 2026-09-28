import React, { useCallback, useEffect, useState } from 'react';
import styles from './ticketHistory.module.css';
import { ticketEvidenceService, type RunEvidence, type TicketHistoryEntry } from '../../organization/TicketEvidenceService';
import { groupRunEvidence, ticketHeading, ticketSourceLabel, ticketStatus } from './ticketHistoryModel';
import { EvidenceLightbox } from '../../conversation/EvidenceLightbox';
import { outputEvidenceMessage } from '../../conversation/evidenceMessages';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

/** Opens a run's pull request in the browser (http/https links only). */
function openPullRequest(url: string): void {
  if (/^https?:\/\//i.test(url)) void ipc.actionExecute({ type: 'openUrl', url });
}

type Loaded = { entries: TicketHistoryEntry[]; evidence: RunEvidence[]; urls: Record<string, string> };

function outputStatusText(e: RunEvidence): string {
  const firstLine = outputEvidenceMessage(e.phase, e.output ?? { source: '', status: null, text: '' }).split('\n')[0] ?? '';
  return firstLine.replace(/^Output evidence — /, '');
}

/**
 * Ticket Wallet history — built from the run records: ticket, source, status, amount charged, what was
 * fixed, files changed, PR, and the before/after evidence. Screenshot thumbnails open full size;
 * output/log evidence is shown as text and never as a screenshot.
 */
export function TicketHistory() {
  const [state, setState] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const entries = await ticketEvidenceService.listRunHistory(20);
      const evidence = await ticketEvidenceService.listForRuns(entries.map((e) => e.runId));
      const paths = evidence.map((e) => e.storagePath).filter((p): p is string => Boolean(p));
      const urls = await ticketEvidenceService.signedUrls(paths).catch(() => ({}));
      setState({ entries, evidence, urls });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load ticket history.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className={styles.note}>
        Couldn't load ticket history.{' '}
        <button type="button" className={styles.linkBtn} onClick={() => void load()}>Retry</button>
      </div>
    );
  }
  if (!state) return <div className={styles.note}>Loading ticket history…</div>;
  if (state.entries.length === 0) return <div className={styles.note}>No tickets yet.</div>;

  return (
    <div className={styles.list}>
      {state.entries.map((entry) => {
        const status = ticketStatus(entry.status);
        const open = openRunId === entry.runId;
        const { images, outputs } = groupRunEvidence(state.evidence, entry.runId);
        return (
          <div key={entry.runId} className={styles.item}>
            <button type="button" className={styles.row} onClick={() => setOpenRunId(open ? null : entry.runId)} aria-expanded={open}>
              <span className={styles.heading} title={ticketHeading(entry)}>{ticketHeading(entry)}</span>
              <span className={styles.meta}>
                <span className={styles.source}>{ticketSourceLabel(entry.ticketSource)}</span>
                <span className={`${styles.status} ${styles[`tone_${status.tone}`]}`}>{status.label}</span>
                <span className={styles.amount}>${entry.chargedUsd.toFixed(2)}</span>
              </span>
            </button>
            {open && (
              <div className={styles.details}>
                <div className={styles.fixed}>{entry.fixSummary || 'No fix summary recorded.'}</div>
                <div className={styles.facts}>
                  {entry.filesChanged !== null && <span>{entry.filesChanged} file{entry.filesChanged === 1 ? '' : 's'} changed</span>}
                  {entry.linesChanged !== null && <span>{entry.linesChanged} line{entry.linesChanged === 1 ? '' : 's'}</span>}
                  <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                  {entry.prUrl && (
                    <button type="button" className={styles.linkBtn} onClick={() => openPullRequest(entry.prUrl!)}>
                      Pull request
                    </button>
                  )}
                </div>
                {images.length > 0 && (
                  <div className={styles.thumbs}>
                    {images.map((e) => {
                      const url = e.storagePath ? state.urls[e.storagePath] : undefined;
                      const label = `${e.phase === 'before' ? 'Before' : 'After'}: ${e.label}`;
                      return (
                        <figure key={e.id} className={styles.thumb}>
                          <span className={e.phase === 'before' ? styles.before : styles.after}>{e.phase === 'before' ? 'Before' : 'After'}</span>
                          {url ? (
                            <button type="button" className={styles.thumbBtn} onClick={() => setZoom({ src: url, label })} title="Open full size">
                              <img src={url} alt={label} />
                            </button>
                          ) : (
                            <div className={styles.thumbMissing}>Not available</div>
                          )}
                        </figure>
                      );
                    })}
                  </div>
                )}
                {outputs.map((e) => (
                  <div key={e.id} className={styles.output}>
                    <div className={styles.outputHead}>Output evidence — {outputStatusText(e)}</div>
                    <pre>{e.output?.text}</pre>
                  </div>
                ))}
                {images.length === 0 && outputs.length === 0 && <div className={styles.noteSmall}>No evidence captured for this ticket.</div>}
              </div>
            )}
          </div>
        );
      })}
      {zoom && <EvidenceLightbox src={zoom.src} label={zoom.label} onClose={() => setZoom(null)} />}
    </div>
  );
}
