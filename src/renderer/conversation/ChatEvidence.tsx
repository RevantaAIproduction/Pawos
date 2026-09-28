import React, { useEffect, useState } from 'react';
import { loadEvidenceImage } from './evidenceImageLoader';
import { EvidenceLightbox } from './EvidenceLightbox';
import styles from './chatEvidence.module.css';
import type { ChatEvidenceData, ChatEvidenceImage } from './ConversationTypes';

const PROVIDER_LABELS: Record<string, string> = {
  web: 'Web page',
  desktopWindow: 'App window',
  android: 'Android',
  iosSimulator: 'iOS Simulator',
};

function fileName(evidence: ChatEvidenceImage): string {
  if (!evidence.filePath) return `pawos-evidence-${evidence.evidenceId}-${evidence.phase}.png`;
  const stamp = evidence.filePath.split(/[\\/]/).pop()?.replace(/\.png$/, '') ?? evidence.phase;
  return `pawos-evidence-${stamp}.png`;
}

function Shot({ evidence, onOpen }: { evidence: ChatEvidenceImage; onOpen: (path: string) => void }) {
  // A reopened chat has only the reference: load the image (local cache, else the run's stored copy).
  const [src, setSrc] = useState(evidence.imageDataUrl);
  const [missing, setMissing] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    if (evidence.imageDataUrl) {
      setSrc(evidence.imageDataUrl);
      return;
    }
    let cancelled = false;
    void loadEvidenceImage({ evidenceId: evidence.evidenceId, ...(evidence.runId ? { runId: evidence.runId } : {}) }).then((base64) => {
      if (cancelled) return;
      if (base64) setSrc(`data:image/png;base64,${base64}`);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [evidence.evidenceId, evidence.imageDataUrl, evidence.runId]);
  const signals = evidence.pageSignals;
  const problems = (signals?.consoleErrors.length ?? 0) + (signals?.failedRequests.length ?? 0);
  return (
    <figure className={styles.shot}>
      <div className={styles.shotHead}>
        <span className={evidence.phase === 'before' ? styles.phaseBefore : styles.phaseAfter}>{evidence.phase === 'before' ? 'Before' : 'After'}</span>
        <span className={styles.target} title={evidence.targetDescription}>
          {PROVIDER_LABELS[evidence.provider] ?? evidence.provider} · {evidence.targetDescription}
        </span>
      </div>
      {src ? (
        <button type="button" className={styles.imageButton} onClick={() => setZoomed(true)} title="Open full size">
          <img className={styles.image} src={src} alt={`${evidence.phase === 'before' ? 'Before' : 'After'}: ${evidence.label}`} />
        </button>
      ) : (
        <div className={styles.placeholder}>{missing ? 'Screenshot no longer available' : 'Loading screenshot…'}</div>
      )}
      {zoomed && src && <EvidenceLightbox src={src} label={`${evidence.phase === 'before' ? 'Before' : 'After'}: ${evidence.label}`} onClose={() => setZoomed(false)} />}
      <div className={styles.shotFoot}>
        {problems > 0 ? (
          <details className={styles.signals}>
            <summary>
              {signals!.consoleErrors.length > 0 && `${signals!.consoleErrors.length} console error${signals!.consoleErrors.length === 1 ? '' : 's'}`}
              {signals!.consoleErrors.length > 0 && signals!.failedRequests.length > 0 && ' · '}
              {signals!.failedRequests.length > 0 && `${signals!.failedRequests.length} failed request${signals!.failedRequests.length === 1 ? '' : 's'}`}
            </summary>
            <pre>{[...signals!.consoleErrors, ...signals!.failedRequests].join('\n')}</pre>
          </details>
        ) : (
          <span />
        )}
        <a className={styles.download} href={src || undefined} download={fileName(evidence)} title="Download PNG" aria-label="Download PNG">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
        </a>
      </div>
    </figure>
  );
}

/**
 * Ticket evidence in chat: the captured screen (web page, app window, device) — and for an "after",
 * its "before" beside it. Click to open full size; download as PNG. Output/log evidence is not shown
 * here (it's a normal message with a code block — it isn't a screenshot).
 */
export function ChatEvidence({ evidence, onOpenFile }: { evidence: ChatEvidenceData; onOpenFile: (path: string) => void }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>{evidence.label}</div>
      <div className={evidence.before ? styles.pair : styles.single}>
        {evidence.before && <Shot evidence={evidence.before} onOpen={onOpenFile} />}
        <Shot evidence={evidence} onOpen={onOpenFile} />
      </div>
    </div>
  );
}
