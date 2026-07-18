/**
 * Real follow-up email drafting — grounded entirely in the real summary,
 * action items, and decisions already extracted for one session (never
 * invented content). Same fetch + responseSchema discipline as
 * CommunicationTranscription.ts. Only ever produces a DRAFT — Paw never
 * sends anything itself; the human always opens the compose window
 * (openMailComposeWindow) and clicks Send themselves.
 */

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export type DraftEmailInput = {
  apiKey: string;
  title: string;
  headline: string;
  summary: string;
  actionItems: { description: string; owner: string | null }[];
  decisions: { description: string }[];
  senderName?: string;
  model?: string;
  baseUrl?: string;
};

export type DraftEmailResult = { subject: string; body: string };

export async function draftFollowupEmail(params: DraftEmailInput): Promise<DraftEmailResult> {
  const prompt = `Draft a short, professional follow-up email based on this real conversation titled "${params.title}". Never invent facts not in the material below.

Headline: ${params.headline}
Summary: ${params.summary}
Real action items: ${params.actionItems.length ? params.actionItems.map((a) => `- ${a.description}${a.owner ? ` (${a.owner})` : ''}`).join('\n') : 'none'}
Real decisions: ${params.decisions.length ? params.decisions.map((d) => `- ${d.description}`).join('\n') : 'none'}

Write a real subject line and a real plain-text email body thanking the recipient for the conversation, briefly recapping what was actually discussed, and listing the real action items/decisions above if any exist. Keep it concise and natural, not robotic. Sign off as "${params.senderName || 'the sender'}" only if a real name was given, otherwise leave the sign-off generic.`;

  const res = await fetch(`${params.baseUrl ?? DEFAULT_BASE_URL}/models/${params.model ?? DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(params.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] },
      },
    }),
  });
  if (!res.ok) throw new Error(`Email draft request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as any;
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(text);
  return { subject: String(parsed.subject ?? `Follow-up: ${params.title}`), body: String(parsed.body ?? '') };
}
