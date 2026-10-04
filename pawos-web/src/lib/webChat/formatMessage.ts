/**
 * Splits a chat message into prose and fenced code blocks, so the thread can render code in a
 * horizontally scrollable block instead of letting a long line push the page sideways on a phone.
 * Purely presentational: the text is rendered as text either way, never as HTML.
 */
export type MessageSegment = { kind: "text"; text: string } | { kind: "code"; language: string | null; text: string };

const FENCE = /```([A-Za-z0-9_+#.-]*)[^\n]*\n([\s\S]*?)(?:\n```|```|$)/g;

const ATTACHMENT = /\n\nAttached file: ([^\n]+)\n(`{3,})\n[\s\S]*\n\2$/;

/**
 * Separates what the user typed from the file block the server appended to it (see webChat.ts), so
 * the thread can show the file as a named chip instead of printing the whole file back.
 */
export function splitAttachment(content: string): { text: string; attachmentName: string | null } {
  const match = ATTACHMENT.exec(content);
  if (!match) return { text: content, attachmentName: null };
  return { text: content.slice(0, match.index), attachmentName: match[1] };
}

export function splitMessage(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;
  for (const match of content.matchAll(FENCE)) {
    const start = match.index ?? 0;
    const before = content.slice(cursor, start).trim();
    if (before) segments.push({ kind: "text", text: before });
    segments.push({ kind: "code", language: match[1] || null, text: match[2].replace(/\n+$/, "") });
    cursor = start + match[0].length;
  }
  const rest = content.slice(cursor).trim();
  if (rest) segments.push({ kind: "text", text: rest });
  return segments.length > 0 ? segments : [{ kind: "text", text: content }];
}
