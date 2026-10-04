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
