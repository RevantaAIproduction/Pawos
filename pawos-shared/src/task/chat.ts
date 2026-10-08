import { PawosApiError, type SendOutcome } from "../api/pawosClient";
import type { ChatAttachment, SendResult } from "../api/types";

/**
 * Sends one message to Paw through the existing PawOS Web chat (POST /api/web-chat/messages) and
 * returns its reply. Like a task, a message is sent once: if the connection drops, or PawOS says it
 * is still answering, the same request id is only ever asked about again (recoverOnly) — so a
 * message is never answered, counted or charged twice.
 */
export interface ChatClient {
  sendChat(content: string, requestId: string, chatId?: string | null, attachment?: ChatAttachment | null): Promise<SendOutcome>;
  recoverSend(requestId: string): Promise<SendOutcome>;
}

export interface ChatOptions {
  client: ChatClient;
  content: string;
  requestId: string;
  /** The conversation to continue, or null to start one. */
  chatId?: string | null;
  /** A text file to send with the message. */
  attachment?: ChatAttachment | null;
  sleep?: (ms: number) => Promise<void>;
  /** How long to keep asking about a message PawOS is still answering. */
  waitMs?: number;
  now?: () => number;
}

const ASK_AGAIN_MS = 2_000;
/** PawOS holds a message's claim for 150 seconds; after that it is either answered or was never stored. */
const WAIT_MS = 160 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;

export async function sendChatMessage(options: ChatOptions): Promise<SendResult> {
  const { client, content, requestId } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.waitMs ?? WAIT_MS);
  let recoveries = 0;
  let attempt: () => Promise<SendOutcome> = () => client.sendChat(content, requestId, options.chatId ?? null, options.attachment ?? null);

  for (;;) {
    let outcome: SendOutcome;
    try {
      outcome = await attempt();
    } catch (error) {
      // No answer at all: PawOS may well have the message. Ask about it — never send it again.
      if (!(error instanceof PawosApiError) || !error.uncertain || recoveries >= MAX_RECOVERY_ATTEMPTS) throw error;
      // Out of time as well: stop here rather than keep asking a PawOS that isn't answering.
      if (now() >= deadline) throw new PawosApiError("network", "PawOS didn't answer in time. Your message was not sent again; check PawOS Web for the reply, or try again.", null, "timeout");
      recoveries += 1;
      outcome = { kind: "processing" };
    }
    if (outcome.kind === "delivered") return outcome.result;
    if (outcome.kind === "notReceived") throw new PawosApiError("rejected", "PawOS didn't receive the message. Send it again.", 404, "not_found");
    if (now() >= deadline) throw new PawosApiError("server", "PawOS is taking longer than expected to answer. Your message was not sent again; check PawOS Web for the reply.", null, "processing");
    await sleep(ASK_AGAIN_MS);
    attempt = () => client.recoverSend(requestId);
  }
}
