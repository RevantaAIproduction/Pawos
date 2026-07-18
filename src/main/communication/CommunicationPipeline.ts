import { EventEmitter } from 'events';
import type { CommunicationPipelineStage, CommunicationRuntimeEvent, SessionTimelineEntry, SpeakerTimelineEntry } from '../../shared/communication/CommunicationTypes';
import { communicationSessionStore } from './CommunicationSessionStore';
import { communicationIntelligenceStore } from './CommunicationIntelligenceStore';
import { communicationMemoryStore } from './CommunicationMemoryStore';
import { communicationSearchIndexStore } from './CommunicationSearchIndexStore';
import { transcribeCommunicationAudio, summarizeCommunication, extractActionItems, detectCommunicationSignals, type TranscriptSegment } from './CommunicationTranscription';

/** Real speaker timeline, derived from the transcript's own segments — consecutive same-speaker segments are merged into one entry, never invented turn-taking beyond what was actually transcribed. */
function deriveSpeakerTimeline(segments: TranscriptSegment[]): SpeakerTimelineEntry[] {
  const timeline: SpeakerTimelineEntry[] = [];
  for (const segment of segments) {
    const last = timeline[timeline.length - 1];
    if (last && last.speaker === segment.speaker) {
      last.endedAtSeconds = segment.atSeconds;
    } else {
      timeline.push({ speaker: segment.speaker, startedAtSeconds: segment.atSeconds, endedAtSeconds: segment.atSeconds });
    }
  }
  return timeline;
}

/**
 * The canonical per-session timeline (timeline.json, session storage
 * architecture) — a real merge of everything that carries a genuine
 * atSeconds: transcript speaker turns, action items, decisions, follow-ups,
 * signals, and visual evidence. Never a second source of truth — every
 * entry is derived from data already written elsewhere (transcript.json,
 * action-items.json, etc.), just merged and sorted chronologically so the
 * whole session's evidence trail reads as one timeline.
 */
function buildSessionTimeline(communicationId: string, segments: TranscriptSegment[]): SessionTimelineEntry[] {
  const entries: SessionTimelineEntry[] = [];

  for (const segment of segments) {
    entries.push({ atSeconds: segment.atSeconds, kind: 'transcriptSegment', description: `${segment.speaker}: ${segment.text}`, refId: null });
  }
  for (const item of communicationIntelligenceStore.getActionItems(communicationId)) {
    entries.push({ atSeconds: item.atSeconds ?? 0, kind: 'actionItem', description: item.description, refId: item.id });
  }
  for (const decision of communicationIntelligenceStore.getDecisions(communicationId)) {
    entries.push({ atSeconds: decision.atSeconds ?? 0, kind: 'decision', description: decision.description, refId: decision.id });
  }
  for (const followUp of communicationIntelligenceStore.listFollowUps().filter((f) => f.communicationId === communicationId)) {
    entries.push({ atSeconds: followUp.atSeconds ?? 0, kind: 'followUp', description: followUp.reason, refId: followUp.id });
  }
  for (const signal of communicationIntelligenceStore.getSignals(communicationId)) {
    entries.push({ atSeconds: signal.atSeconds ?? 0, kind: 'signal', description: signal.evidence, refId: null });
  }
  const record = communicationSessionStore.get(communicationId);
  for (const event of record?.visualEvidence ?? []) {
    entries.push({ atSeconds: event.atSeconds, kind: 'visualEvidence', description: event.description, refId: null });
  }

  return entries.sort((a, b) => a.atSeconds - b.atSeconds);
}

/**
 * The post-capture pipeline — transcribing -> summarizing ->
 * extractingActionItems -> detectingSignals -> updatingMemory -> done.
 * Each stage's completion is written to CommunicationRecord.pipelineStage
 * BEFORE the next stage starts (architecture doc §18) — this is what makes
 * crash recovery real: a relaunch resumes from the last completed stage,
 * never restarts a stage that already produced real output, and a record
 * is only ever reported 'completed' once pipelineStage === 'done'.
 */
class CommunicationPipeline extends EventEmitter {
  private emitEvent(event: CommunicationRuntimeEvent): void {
    this.emit('event', event);
  }

  /** Runs (or resumes) the full pipeline for one communication. Never throws — a failed stage leaves the record at its last successfully completed stage with status 'failed', so a later manual retry (or resumeInterrupted) can pick up exactly where it left off instead of restarting from scratch. */
  async run(communicationId: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, error: 'Communication not found.' };
    if (record.pipelineStage === 'done') return { ok: true };

    try {
      if (record.pipelineStage === 'transcribing' || !record.transcriptPath) {
        if (!record.audioPath) throw new Error('No audio to transcribe.');
        const transcription = await transcribeCommunicationAudio({ apiKey, audioPath: record.audioPath });
        const transcriptPath = communicationSessionStore.writeTextFile(communicationId, 'transcript.txt', transcription.plainText);
        communicationSessionStore.writeTextFile(communicationId, 'transcript.json', JSON.stringify(transcription, null, 2));
        communicationSessionStore.update(communicationId, {
          transcriptPath,
          pipelineStage: 'summarizing',
          speakerTimeline: deriveSpeakerTimeline(transcription.segments),
          meetingMetadata: record.meetingMetadata
            ? { ...record.meetingMetadata, participants: transcription.detectedParticipants.map((name) => ({ name, joinedAt: null, leftAt: null })) }
            : undefined,
        });
        this.emitEvent({ type: 'pipelineStageChanged', communicationId, stage: 'summarizing' });
        this.emitEvent({ type: 'transcriptUpdated', communicationId, latestText: transcription.plainText });
        for (const name of transcription.detectedParticipants) this.emitEvent({ type: 'participantDetected', communicationId, participant: name });
      }

      const afterTranscribe = communicationSessionStore.get(communicationId)!;
      const transcriptText = afterTranscribe.transcriptPath ? communicationSessionStore.readTextFile(afterTranscribe.transcriptPath) ?? '' : '';

      if (afterTranscribe.pipelineStage === 'summarizing') {
        const summaryResult = await summarizeCommunication({ apiKey, transcript: transcriptText, title: afterTranscribe.title });
        const summaryMd = [
          `# ${summaryResult.headline}`,
          '',
          summaryResult.summary,
          '',
          summaryResult.keyPoints.map((k) => `- ${k}`).join('\n'),
          '',
          '## Executive Summary',
          summaryResult.executiveSummary,
          summaryResult.risks.length ? `\n## Risks\n${summaryResult.risks.map((r) => `- ${r}`).join('\n')}` : '',
          summaryResult.openQuestions.length ? `\n## Open Questions\n${summaryResult.openQuestions.map((q) => `- ${q}`).join('\n')}` : '',
          summaryResult.suggestedNextAgenda.length ? `\n## Suggested Next Meeting Agenda\n${summaryResult.suggestedNextAgenda.map((a) => `- ${a}`).join('\n')}` : '',
        ].join('\n');
        const summaryPath = communicationSessionStore.writeTextFile(communicationId, 'summary.md', summaryMd);
        communicationIntelligenceStore.setSummary({
          communicationId,
          headline: summaryResult.headline,
          summary: summaryResult.summary,
          keyPoints: summaryResult.keyPoints,
          generatedAt: Date.now(),
          model: 'gemini-flash-latest',
          executiveSummary: summaryResult.executiveSummary,
          risks: summaryResult.risks,
          openQuestions: summaryResult.openQuestions,
          suggestedNextAgenda: summaryResult.suggestedNextAgenda,
        });
        communicationSessionStore.update(communicationId, { summaryPath, pipelineStage: 'extractingActionItems' });
        this.emitEvent({ type: 'pipelineStageChanged', communicationId, stage: 'extractingActionItems' });
      }

      if (communicationSessionStore.get(communicationId)!.pipelineStage === 'extractingActionItems') {
        const { actionItems, followUps, decisions } = await extractActionItems({ apiKey, transcript: transcriptText });
        const createdItems = communicationIntelligenceStore.addActionItems(communicationId, actionItems);
        communicationIntelligenceStore.addFollowUps(communicationId, followUps);
        const createdDecisions = communicationIntelligenceStore.addDecisions(communicationId, decisions);
        for (const item of createdItems) this.emitEvent({ type: 'actionItemDetected', communicationId, actionItem: item });
        for (const decision of createdDecisions) this.emitEvent({ type: 'decisionDetected', communicationId, decision });
        communicationSessionStore.update(communicationId, { pipelineStage: 'detectingSignals' });
        this.emitEvent({ type: 'pipelineStageChanged', communicationId, stage: 'detectingSignals' });
      }

      if (communicationSessionStore.get(communicationId)!.pipelineStage === 'detectingSignals') {
        const signals = await detectCommunicationSignals({ apiKey, transcript: transcriptText });
        communicationIntelligenceStore.addSignals(signals.map((s) => ({ ...s, communicationId })));
        communicationSessionStore.update(communicationId, { pipelineStage: 'updatingMemory' });
        this.emitEvent({ type: 'pipelineStageChanged', communicationId, stage: 'updatingMemory' });
      }

      if (communicationSessionStore.get(communicationId)!.pipelineStage === 'updatingMemory') {
        const finalRecord = communicationSessionStore.get(communicationId)!;
        const participantNames = finalRecord.meetingMetadata?.participants.map((p) => p.name) ?? [];
        const { participantIds, companyId, projectId } = communicationMemoryStore.linkCommunication({ communicationId, participantNames });
        communicationSessionStore.update(communicationId, {
          participants: participantIds,
          companies: companyId ? [companyId] : [],
          projects: projectId ? [projectId] : [],
          pipelineStage: 'done' as CommunicationPipelineStage,
          status: 'completed',
        });

        // Canonical per-session timeline — merges transcript + action
        // items + decisions + follow-ups + signals + visual evidence,
        // reading transcript.json fresh (not the in-memory transcription
        // object) so this works identically on a resumed/recovered run.
        const transcription = communicationSessionStore.readSessionJson<{ segments: TranscriptSegment[] }>(communicationId, 'transcript.json');
        const timeline = buildSessionTimeline(communicationId, transcription?.segments ?? []);
        communicationSessionStore.writeSessionJson(communicationId, 'timeline.json', timeline);

        // Relationship Intelligence — real, evidence-based health/topic
        // recompute for every participant and company this session just
        // linked to, never invented from the company/participant name alone.
        for (const pid of participantIds) {
          await communicationMemoryStore.recomputeParticipantIntelligence(pid, apiKey);
          communicationSearchIndexStore.indexContact(pid);
        }
        if (companyId) {
          await communicationMemoryStore.recomputeCompanyIntelligence(companyId, apiKey);
          communicationSearchIndexStore.indexCompany(companyId);
        }

        communicationSearchIndexStore.indexSession(communicationId);

        this.emitEvent({ type: 'captureStatusChanged', communicationId, status: 'completed' });
        this.emitEvent({ type: 'processingComplete', communicationId });
      }

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Deliberately does NOT advance pipelineStage or mark 'completed' —
      // the record stays exactly where it last succeeded so resuming (or a
      // manual retry) picks up from there, never from scratch, and never
      // silently reports success for unfinished work.
      communicationSessionStore.update(communicationId, { status: 'failed' });
      this.emitEvent({ type: 'captureStatusChanged', communicationId, status: 'failed' });
      return { ok: false, error: message };
    }
  }

  /** Crash recovery entry point (architecture doc §18) — scans for every record whose pipeline never reached 'done' and resumes each one from its last completed stage. */
  async resumeInterrupted(apiKey: string | undefined): Promise<string[]> {
    const unfinished = communicationSessionStore.listUnfinished();
    const resumed: string[] = [];
    for (const record of unfinished) {
      if (record.status === 'recording') {
        // A recording that never finalized (app closed mid-capture) — the
        // partial audio is already on disk (never buffered-only in memory,
        // see the capture plugins), so it's marked interrupted rather than
        // silently resumed as if it were a normal stop.
        communicationSessionStore.update(record.id, { status: 'interrupted', endedAt: record.endedAt ?? Date.now() });
        continue;
      }
      if (!apiKey) continue; // Can't run the AI pipeline stages without a key — leave the record as-is for a later manual retry.
      resumed.push(record.id);
      await this.run(record.id, apiKey);
    }
    return resumed;
  }
}

export const communicationPipeline = new CommunicationPipeline();
