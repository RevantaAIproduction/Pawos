import { randomUUID } from "crypto";

/** What PawOS Web accepts as a request id (webChat.ts REQUEST_ID_PATTERN). */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * A new id for one task. It makes the send safe to repeat (PawOS answers a repeat with the stored
 * result instead of running the change twice) and names the change the progress is polled for.
 */
export function newRequestId(): string {
  return randomUUID();
}
