import React, { useEffect, useRef, useState } from 'react';
import styles from './communicationWorkspace.module.css';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { CommunicationRecord, CommunicationRuntimeEvent } from '../../shared/communication/CommunicationTypes';
import type { CommunicationWorkspaceState } from './CommunicationWorkspaceTypes';

function emptyState(communicationId: string): CommunicationWorkspaceState {
  return {
    communicationId,
    status: 'recording',
    recordingMode: null,
    regions: {
      liveTranscript: null,
      participants: null,
      detectedTopics: null,
      actionItems: null,
      evidence: { durationSeconds: 0, lastWriteAt: null },
      speakerTimeline: null,
      decisions: null,
      visualContext: null,
    },
  };
}

/**
 * Communication Workspace (architecture doc §14, desktop-first
 * Communication Intelligence Runtime) — direct sibling of
 * WorkspaceRuntime.tsx's region-filling discipline: every region is either
 * real, evented data or absent, never placeholder chrome. Deliberately
 * self-contained (subscribes to communication:event directly, mounted
 * unconditionally) rather than threaded through Task Card's activeTask
 * detection, so a live capture's status is visible independent of
 * whichever Task Card entry happens to be showing.
 *
 * Honest gaps: `detectedTopics` stays empty (would need live, mid-
 * recording transcription — this session's transcription runs once,
 * after the recording stops). `speakerTimeline` only ever populates once
 * processing completes (it's derived from the finished transcript, not
 * streamed live — no meeting SDK integration exists to report speaker
 * changes mid-call). `visualContext` only reflects THIS device's own
 * foreground window (real application-switch evidence), never a claim
 * about the other meeting participants' screens. All three are shown as
 * absent regions rather than faked.
 */
export function CommunicationWorkspaceRuntime() {
  const [state, setState] = useState<CommunicationWorkspaceState | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const lastRealChunkAtRef = useRef<number | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Real evidence, not an optimistic assumption: the 'evidence' region's
    // lastWriteAt only ever advances when CommunicationAudioCapture's
    // MediaRecorder actually produces a chunk — if capture silently stops
    // producing bytes (permission revoked mid-call, a stalled recorder),
    // this timestamp visibly stops updating instead of a timer that keeps
    // ticking regardless of whether anything is really being captured.
    const handleAudioChunk = () => {
      lastRealChunkAtRef.current = Date.now();
    };
    window.addEventListener('pawos:communication-audio-chunk', handleAudioChunk);
    return () => window.removeEventListener('pawos:communication-audio-chunk', handleAudioChunk);
  }, []);

  useEffect(() => {
    const handleEvent = (event: CommunicationRuntimeEvent) => {
      setState((prev) => {
        if (event.type === 'meetingDetected') return prev; // not yet a real recording — nothing for the Workspace to show; ConversationRuntime handles the proactive prompt separately
        if (event.type === 'captureStarted') {
          startedAtRef.current = Date.now();
          lastRealChunkAtRef.current = null;
          return emptyState(event.communicationId);
        }
        if (!prev || prev.communicationId !== event.communicationId) return prev;

        if (event.type === 'captureStatusChanged') {
          return { ...prev, status: event.status };
        }
        if (event.type === 'recordingModeChanged') {
          return { ...prev, recordingMode: event.mode };
        }
        if (event.type === 'transcriptUpdated') {
          const lines = event.latestText.split('\n').slice(-12);
          return { ...prev, regions: { ...prev.regions, liveTranscript: { latestLines: lines } } };
        }
        if (event.type === 'participantDetected') {
          const existing = prev.regions.participants?.names ?? [];
          if (existing.includes(event.participant)) return prev;
          return { ...prev, regions: { ...prev.regions, participants: { names: [...existing, event.participant] } } };
        }
        if (event.type === 'actionItemDetected') {
          const existing = prev.regions.actionItems?.items ?? [];
          return { ...prev, regions: { ...prev.regions, actionItems: { items: [...existing, event.actionItem] } } };
        }
        if (event.type === 'decisionDetected') {
          const existing = prev.regions.decisions?.items ?? [];
          return { ...prev, regions: { ...prev.regions, decisions: { items: [...existing, event.decision] } } };
        }
        if (event.type === 'screenShareChanged') {
          const existing = prev.regions.visualContext?.events ?? [];
          return { ...prev, regions: { ...prev.regions, visualContext: { events: [...existing, event.event] } } };
        }
        if (event.type === 'processingComplete') {
          // Speaker timeline is derived once, after transcription — pull
          // the finished record for it rather than trying to stream it
          // live (there's nothing live to stream from without a real
          // meeting SDK).
          void ipc.actionExecute({ type: 'getCommunication', communicationId: event.communicationId }).then((result) => {
            if (!result.ok) return;
            const record = result.data as CommunicationRecord;
            if (record.speakerTimeline?.length) {
              setState((cur) => (cur && cur.communicationId === event.communicationId ? { ...cur, regions: { ...cur.regions, speakerTimeline: { entries: record.speakerTimeline } } } : cur));
            }
          });
          return { ...prev, status: 'completed' };
        }
        return prev;
      });
    };
    ipc.onCommunicationEvent(handleEvent);
  }, []);

  useEffect(() => {
    if (!state || state.status !== 'recording') {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      return;
    }
    durationTimerRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev || !startedAtRef.current) return prev;
        const durationSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        // lastWriteAt only reflects a real MediaRecorder chunk having
        // actually arrived (pawos:communication-audio-chunk) — never
        // advanced just because the timer ticked, so a stalled/failed
        // capture is visible here instead of a falsely-reassuring clock.
        return { ...prev, regions: { ...prev.regions, evidence: { durationSeconds, lastWriteAt: lastRealChunkAtRef.current } } };
      });
    }, 1000);
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status]);

  if (!state) return null;

  const { regions } = state;

  return (
    <div className={styles.workspace} data-interactive="true">
      <div className={styles.header}>
        <span className={`${styles.statusDot} ${styles[`status_${state.status}`] ?? ''}`} />
        <span className={styles.statusLabel}>
          {state.status === 'recording' && 'Recording'}
          {state.status === 'processing' && 'Processing…'}
          {state.status === 'completed' && 'Processed'}
          {state.status === 'failed' && 'Failed'}
          {state.status === 'interrupted' && 'Interrupted'}
        </span>
        {state.recordingMode === 'meetingParticipant' && <span className={styles.modeBadge}>Joined as participant</span>}
        {state.recordingMode === 'desktopCapture' && <span className={styles.modeBadge}>Desktop capture</span>}
      </div>

      {regions.evidence && (
        <div className={styles.region}>
          <span className={styles.regionLabel}>Evidence</span>
          <span className={styles.evidenceDuration}>{Math.floor(regions.evidence.durationSeconds / 60)}:{String(regions.evidence.durationSeconds % 60).padStart(2, '0')}</span>
          {state.status === 'recording' && regions.evidence.durationSeconds > 4 && Date.now() - (regions.evidence.lastWriteAt ?? 0) > 5000 && (
            <span className={styles.evidenceStalled}>No audio detected — check your microphone</span>
          )}
        </div>
      )}

      {regions.participants && regions.participants.names.length > 0 && (
        <div className={styles.region}>
          <span className={styles.regionLabel}>Participants</span>
          <div className={styles.chipList}>
            {regions.participants.names.map((name) => (
              <span key={name} className={styles.chip}>{name}</span>
            ))}
          </div>
        </div>
      )}

      {regions.liveTranscript && (
        <div className={styles.region}>
          <span className={styles.regionLabel}>Transcript</span>
          <div className={styles.transcript}>
            {regions.liveTranscript.latestLines.map((line, i) => (
              <div key={i} className={styles.transcriptLine}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {regions.speakerTimeline && regions.speakerTimeline.entries.length > 0 && (
        <div className={styles.region}>
          <span className={styles.regionLabel}>Speaker timeline</span>
          <div className={styles.transcript}>
            {regions.speakerTimeline.entries.map((entry, i) => (
              <div key={i} className={styles.transcriptLine}>
                {entry.startedAtSeconds}s{entry.endedAtSeconds !== null && entry.endedAtSeconds !== entry.startedAtSeconds ? `–${entry.endedAtSeconds}s` : ''} — {entry.speaker}
              </div>
            ))}
          </div>
        </div>
      )}

      {regions.visualContext && regions.visualContext.events.length > 0 && (
        <div className={styles.region}>
          <span className={styles.regionLabel}>Visual context</span>
          <div className={styles.transcript}>
            {regions.visualContext.events.map((event, i) => (
              <div key={i} className={styles.transcriptLine}>
                {Math.floor(event.atSeconds / 60)}:{String(event.atSeconds % 60).padStart(2, '0')} — {event.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {regions.actionItems && regions.actionItems.items.length > 0 && (
        <div className={styles.region}>
          <span className={styles.regionLabel}>Action items</span>
          <ul className={styles.actionItemList}>
            {regions.actionItems.items.map((item) => (
              <li key={item.id}>{item.description}</li>
            ))}
          </ul>
        </div>
      )}

      {regions.decisions && regions.decisions.items.length > 0 && (
        <div className={styles.region}>
          <span className={styles.regionLabel}>Decisions</span>
          <ul className={styles.actionItemList}>
            {regions.decisions.items.map((item) => (
              <li key={item.id}>{item.description}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
