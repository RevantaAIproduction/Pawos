import type { AccountContext } from "../account/accountContext";
import { getChatMessages, type WebChatMessage } from "../webChat/webChat";
import { WEB_POLICY, WebCapabilityError, requireWebCapability } from "./webCapabilities";

/**
 * "Continue in PawOS Desktop" — taking a web conversation to the desktop app, where the work that
 * needs the user's machine can actually be done.
 *
 * What it does TODAY:
 *  - the server checks the session, the `web.continueInDesktop` capability and that the chat is
 *    the account's own, then builds the hand-off from the STORED conversation (the web_chats id is
 *    the canonical, account-authorized identifier — there is no second conversation store);
 *  - `desktopUrl` is pawos://jump/new-chat, a link the desktop app already handles (it opens a new
 *    chat); the browser copies `transcript` so the user can paste it there.
 * The link carries no token, no account id and no conversation content.
 *
 * The chat itself is already in PawOS Desktop too: chats are one history across the account
 * (supabase/migrations/20261004050000_account_chats.sql; the desktop app lists the account's chats
 * and continues them as the same chat). This hand-off is the quick way to bring Desktop forward with
 * the conversation in hand.
 */

export const DESKTOP_NEW_CHAT_URL = "pawos://jump/new-chat";

export interface DesktopHandoff {
  chatId: string;
  title: string;
  desktopUrl: string;
  /** The conversation as plain text to paste into PawOS Desktop (most recent part if it is long). */
  transcript: string;
  truncated: boolean;
}

export class DesktopHandoffError extends Error {
  constructor(
    readonly code: "capability_locked" | "chat_not_found",
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function line(message: WebChatMessage): string {
  const photos = (message.attachments ?? []).map((photo) => `\n[Attached photo: ${photo.name}]`).join("");
  return `${message.role === "user" ? "Me" : "Paw (PawOS Web)"}:\n${message.content}${photos}`;
}

/** Builds the transcript from the end, so the most recent messages are kept when it must be cut. */
export function buildTranscript(title: string, messages: WebChatMessage[], maxChars: number = WEB_POLICY.handoffTranscriptChars): { transcript: string; truncated: boolean } {
  const header = `Continuing a conversation from PawOS Web: "${title}"\n\n`;
  const parts: string[] = [];
  let length = header.length;
  let truncated = false;
  for (let index = messages.length - 1; index >= 0; index--) {
    const part = line(messages[index]);
    if (length + part.length + 2 > maxChars) {
      truncated = true;
      break;
    }
    parts.unshift(part);
    length += part.length + 2;
  }
  const note = truncated ? "(Earlier messages left out.)\n\n" : "";
  return { transcript: `${header}${note}${parts.join("\n\n")}`.trim(), truncated };
}

export async function buildDesktopHandoff(account: AccountContext, chatId: unknown): Promise<DesktopHandoff> {
  try {
    requireWebCapability(account, "web.continueInDesktop");
  } catch (error) {
    throw new DesktopHandoffError("capability_locked", error instanceof WebCapabilityError ? error.message : "Not available.", 403);
  }
  const id = typeof chatId === "string" ? chatId : "";
  const messages = id ? await getChatMessages(account, id) : null;
  if (!messages) throw new DesktopHandoffError("chat_not_found", "That chat doesn't exist.", 404);
  const chat = await account.supabase.from("web_chats").select("title").eq("id", id).eq("user_id", account.user.id).maybeSingle();
  const title = (chat.data as { title?: string } | null)?.title ?? "Web chat";
  return { chatId: id, title, desktopUrl: DESKTOP_NEW_CHAT_URL, ...buildTranscript(title, messages) };
}
