/**
 * The browser's note of a send whose answer it has not seen yet. It exists so a reload, a suspended
 * tab or a dropped connection can ask the server "did this arrive?" with the same request id.
 * It holds the message text only — never a token, a key or a file's content — and the server stays
 * the source of truth: this note is discarded as soon as the server answers either way.
 */
export interface PendingSend {
  requestId: string;
  chatId: string | null;
  content: string;
  attachmentName: string | null;
}

export const PENDING_SEND_KEY = "pawos:web-chat:pending";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // crypto.randomUUID needs a secure context; getRandomValues does not.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readPendingSend(store: Store): PendingSend | null {
  try {
    const parsed = JSON.parse(store.getItem(PENDING_SEND_KEY) ?? "null") as Partial<PendingSend> | null;
    if (!parsed || typeof parsed.requestId !== "string" || typeof parsed.content !== "string") return null;
    return {
      requestId: parsed.requestId,
      chatId: typeof parsed.chatId === "string" ? parsed.chatId : null,
      content: parsed.content,
      attachmentName: typeof parsed.attachmentName === "string" ? parsed.attachmentName : null,
    };
  } catch {
    return null;
  }
}

export function writePendingSend(store: Store, pending: PendingSend | null): void {
  try {
    if (pending) store.setItem(PENDING_SEND_KEY, JSON.stringify(pending));
    else store.removeItem(PENDING_SEND_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked site data). Sending still works without it.
  }
}

/** Delay before automatic retry number `attempt` (1-based), or null when it is time to stop and ask. */
export function retryDelayMs(attempt: number): number | null {
  const delays = [1500, 4000, 10_000];
  return attempt >= 1 && attempt <= delays.length ? delays[attempt - 1] : null;
}

/**
 * What a send's HTTP answer means for the pending message — the one decision table the chat uses
 * after every attempt, so a dropped connection can never be mistaken for a refusal:
 *  - delivered: the server has the exchange (now or from before) — show its reply;
 *  - processing: the server has the message and is still answering — ask again shortly;
 *  - notReceived: the server never stored it (asked with recoverOnly) — give the text back;
 *  - rejected: the server answered and refused it (limit, validation…) — give the text back;
 *  - uncertain: no answer, or a proxy error page — the server may or may not have it, so retry
 *    with the same request id.
 */
export type SendOutcome = "delivered" | "processing" | "notReceived" | "rejected" | "uncertain";

export function classifySendResponse(status: number | null, data: { ok?: boolean; code?: string; reply?: string; chatId?: string }, recoverOnly: boolean): SendOutcome {
  if (status === null) return "uncertain";
  if (status === 202 && data.code === "processing") return "processing";
  // An error page from something in between (no code of ours) is as uncertain as no answer.
  if (status >= 500 && !data.code) return "uncertain";
  if (status >= 200 && status < 300 && data.ok && data.reply && data.chatId) return "delivered";
  if (recoverOnly && status === 404 && data.code === "not_found") return "notReceived";
  return "rejected";
}

/** Delay before asking again about a send the server is still answering, or null to stop asking automatically. */
export function processingPollDelayMs(attempt: number): number | null {
  if (attempt < 1 || attempt > 40) return null; // ~4 minutes, beyond the server's claim lease
  return Math.min(6000, 1000 + attempt * 500);
}
