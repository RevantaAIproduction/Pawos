import * as fs from 'fs';

/**
 * Real Gemini audio-understanding calls for the Intelligence Layer
 * (architecture doc §11) — same fetch + inline_data + responseSchema shape
 * already used by GeminiSttProvider.ts (renderer, mic transcription) and
 * analyzeUiReference.ts (vision), adapted to run from the main process
 * (reads a real audio file from disk instead of a browser Blob) so a
 * captured recording's transcript/summary/action-items/signals are all
 * real model output, never invented.
 */

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function mimeTypeForAudioPath(audioPath: string): string {
  if (audioPath.endsWith('.webm')) return 'audio/webm';
  if (audioPath.endsWith('.ogg')) return 'audio/ogg';
  if (audioPath.endsWith('.mp3')) return 'audio/mp3';
  if (audioPath.endsWith('.wav')) return 'audio/wav';
  return 'audio/webm';
}

async function callGemini(params: { apiKey: string; parts: unknown[]; responseSchema: unknown; model?: string; baseUrl?: string }): Promise<any> {
  const { apiKey, parts, responseSchema, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL } = params;
  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as any;
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Gemini returned an unexpected response.');
  }
}

export type TranscriptSegment = { speaker: string; text: string; atSeconds: number };
export type TranscriptionResult = { segments: TranscriptSegment[]; plainText: string; detectedParticipants: string[] };

/** Real transcription of a captured audio file — speaker-tagged where the model can tell speakers apart, plain text always. */
export async function transcribeCommunicationAudio(params: { apiKey: string; audioPath: string; model?: string; baseUrl?: string }): Promise<TranscriptionResult> {
  const audioBuffer = fs.readFileSync(params.audioPath);
  const base64Audio = audioBuffer.toString('base64');
  const mimeType = mimeTypeForAudioPath(params.audioPath);

  const prompt = `Transcribe this real recorded conversation exactly as spoken. Identify distinct speakers as "Speaker 1," "Speaker 2," etc. (or their actual names if stated aloud during the recording) and tag each segment with its approximate start time in seconds. Also list every distinct participant name/label you identified.`;

  const parsed = await callGemini({
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Audio } }],
    responseSchema: {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          items: {
            type: 'object',
            properties: { speaker: { type: 'string' }, text: { type: 'string' }, atSeconds: { type: 'number' } },
            required: ['speaker', 'text', 'atSeconds'],
          },
        },
        detectedParticipants: { type: 'array', items: { type: 'string' } },
      },
      required: ['segments', 'detectedParticipants'],
    },
  });

  const segments: TranscriptSegment[] = Array.isArray(parsed.segments)
    ? parsed.segments.map((s: any) => ({ speaker: String(s.speaker ?? 'Speaker'), text: String(s.text ?? ''), atSeconds: Number(s.atSeconds ?? 0) }))
    : [];

  return {
    segments,
    // Timestamps embedded directly in the plain-text transcript (not just
    // the structured `segments` array) so every downstream extraction call
    // (summary/action items/follow-ups/decisions/signals) can naturally
    // cite a real atSeconds value back from the same text it's reading —
    // every piece of evidence stays traceable to a real transcript moment.
    plainText: segments.map((s) => `[${s.atSeconds}s][${s.speaker}] ${s.text}`).join('\n'),
    detectedParticipants: Array.isArray(parsed.detectedParticipants) ? parsed.detectedParticipants.map(String) : [],
  };
}

export type SummaryResult = {
  headline: string;
  summary: string;
  keyPoints: string[];
  /** Meeting Follow-up Intelligence — longer-form narrative plus honestly-surfaced gaps. Empty arrays mean genuinely none were found in the transcript, never a placeholder. */
  executiveSummary: string;
  risks: string[];
  openQuestions: string[];
  suggestedNextAgenda: string[];
};

export async function summarizeCommunication(params: { apiKey: string; transcript: string; title: string; model?: string; baseUrl?: string }): Promise<SummaryResult> {
  const prompt = `Summarize this real conversation transcript titled "${params.title}." Produce:
- headline: one line
- summary: a plain-language summary, a few sentences
- keyPoints: a short list of key points actually discussed
- executiveSummary: a longer-form narrative summary suitable for sharing with a colleague who wasn't there
- risks: real risks or concerns actually raised in the conversation (empty array if genuinely none)
- openQuestions: real questions that came up but were not resolved in the conversation (empty array if genuinely none)
- suggestedNextAgenda: a short, reasonable agenda for a plausible next meeting, grounded in what was actually discussed and left open (empty array if there's no clear follow-up meeting implied)
Never invent anything not in the transcript — an empty array is the honest answer when nothing qualifies.\n\nTranscript:\n${params.transcript.slice(0, 20000)}`;
  const parsed = await callGemini({
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    parts: [{ text: prompt }],
    responseSchema: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        summary: { type: 'string' },
        keyPoints: { type: 'array', items: { type: 'string' } },
        executiveSummary: { type: 'string' },
        risks: { type: 'array', items: { type: 'string' } },
        openQuestions: { type: 'array', items: { type: 'string' } },
        suggestedNextAgenda: { type: 'array', items: { type: 'string' } },
      },
      required: ['headline', 'summary', 'keyPoints', 'executiveSummary', 'risks', 'openQuestions', 'suggestedNextAgenda'],
    },
  });
  return {
    headline: String(parsed.headline ?? ''),
    summary: String(parsed.summary ?? ''),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
    executiveSummary: String(parsed.executiveSummary ?? ''),
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.map(String) : [],
    suggestedNextAgenda: Array.isArray(parsed.suggestedNextAgenda) ? parsed.suggestedNextAgenda.map(String) : [],
  };
}

export type ExtractedActionItem = { description: string; owner: string | null; dueHint: string | null; atSeconds: number | null };
export type ExtractedFollowUp = { reason: string; suggestedAction: string; suggestedWhen: string | null; atSeconds: number | null };
export type ExtractedDecision = { description: string; decidedBy: string | null; atSeconds: number | null };

export async function extractActionItems(params: { apiKey: string; transcript: string; model?: string; baseUrl?: string }): Promise<{ actionItems: ExtractedActionItem[]; followUps: ExtractedFollowUp[]; decisions: ExtractedDecision[] }> {
  const prompt = `From this real conversation transcript (each line prefixed with its real [Ns] timestamp), extract:
- concrete action items (things someone committed to doing)
- follow-ups (things worth checking back on later, with the real reason from the transcript)
- decisions (things the participants actually agreed on or decided)
Only include items genuinely present in the transcript — never invent one. If there are none of a kind, return an empty array for it. For every item, set atSeconds to the real [Ns] timestamp from the line it came from (or null if you genuinely can't tell).\n\nTranscript:\n${params.transcript.slice(0, 20000)}`;
  const parsed = await callGemini({
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    parts: [{ text: prompt }],
    responseSchema: {
      type: 'object',
      properties: {
        actionItems: {
          type: 'array',
          items: { type: 'object', properties: { description: { type: 'string' }, owner: { type: 'string' }, dueHint: { type: 'string' }, atSeconds: { type: 'number' } }, required: ['description'] },
        },
        followUps: {
          type: 'array',
          items: { type: 'object', properties: { reason: { type: 'string' }, suggestedAction: { type: 'string' }, suggestedWhen: { type: 'string' }, atSeconds: { type: 'number' } }, required: ['reason', 'suggestedAction'] },
        },
        decisions: {
          type: 'array',
          items: { type: 'object', properties: { description: { type: 'string' }, decidedBy: { type: 'string' }, atSeconds: { type: 'number' } }, required: ['description'] },
        },
      },
      required: ['actionItems', 'followUps', 'decisions'],
    },
  });
  return {
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((a: any) => ({ description: String(a.description ?? ''), owner: a.owner ? String(a.owner) : null, dueHint: a.dueHint ? String(a.dueHint) : null, atSeconds: typeof a.atSeconds === 'number' ? a.atSeconds : null }))
      : [],
    followUps: Array.isArray(parsed.followUps)
      ? parsed.followUps.map((f: any) => ({ reason: String(f.reason ?? ''), suggestedAction: String(f.suggestedAction ?? ''), suggestedWhen: f.suggestedWhen ? String(f.suggestedWhen) : null, atSeconds: typeof f.atSeconds === 'number' ? f.atSeconds : null }))
      : [],
    decisions: Array.isArray(parsed.decisions)
      ? parsed.decisions.map((d: any) => ({ description: String(d.description ?? ''), decidedBy: d.decidedBy ? String(d.decidedBy) : null, atSeconds: typeof d.atSeconds === 'number' ? d.atSeconds : null }))
      : [],
  };
}

export type ExtractedSignal = { kind: 'buyingSignal' | 'decisionMaker' | 'interestLevel' | 'objection' | 'risk'; participant: string | null; evidence: string; confidence: 'low' | 'medium' | 'high'; atSeconds: number | null };

/** Business-context signals — always empty for a personal conversation (the model simply finds none), never gated behind a separate mode/flag (architecture doc §11.3). */
export async function detectCommunicationSignals(params: { apiKey: string; transcript: string; model?: string; baseUrl?: string }): Promise<ExtractedSignal[]> {
  const prompt = `From this real conversation transcript (each line prefixed with its real [Ns] timestamp), identify any real business signals: buying signals, likely decision-makers, interest level, objections, or risks. Every signal MUST include the actual quote or close paraphrase from the transcript that shows it (the "evidence" field) and the real [Ns] timestamp it came from (atSeconds, or null if you genuinely can't tell) — never report a signal you can't point to real text for. If this is a personal, non-business conversation, return an empty array — do not force signals that aren't there.\n\nTranscript:\n${params.transcript.slice(0, 20000)}`;
  const parsed = await callGemini({
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    parts: [{ text: prompt }],
    responseSchema: {
      type: 'object',
      properties: {
        signals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['buyingSignal', 'decisionMaker', 'interestLevel', 'objection', 'risk'] },
              participant: { type: 'string' },
              evidence: { type: 'string' },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              atSeconds: { type: 'number' },
            },
            required: ['kind', 'evidence', 'confidence'],
          },
        },
      },
      required: ['signals'],
    },
  });
  const signals = Array.isArray(parsed.signals) ? parsed.signals : [];
  return signals.map((s: any) => ({
    kind: s.kind,
    participant: s.participant ? String(s.participant) : null,
    evidence: String(s.evidence ?? ''),
    confidence: s.confidence ?? 'low',
    atSeconds: typeof s.atSeconds === 'number' ? s.atSeconds : null,
  }));
}
