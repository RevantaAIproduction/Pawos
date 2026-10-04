import { NextResponse } from "next/server";
import { requireAccount } from "../../../../lib/account/api";
import { WebChatError, getAllowance, getChatMessages, listChats } from "../../../../lib/webChat/webChat";

/**
 * GET /api/web-chat/chats — the signed-in account's web chats and its message allowance.
 * GET /api/web-chat/chats?chat=<id> — also returns that chat's messages (404 if it isn't theirs).
 */
export async function GET(request: Request) {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const chatId = new URL(request.url).searchParams.get("chat");
  try {
    const [chats, allowance] = await Promise.all([listChats(guard.account), getAllowance(guard.account)]);
    if (!chatId) return NextResponse.json({ ok: true, chats, allowance });
    const messages = await getChatMessages(guard.account, chatId);
    if (!messages) return NextResponse.json({ ok: false, code: "chat_not_found", message: "That chat doesn't exist." }, { status: 404 });
    return NextResponse.json({ ok: true, chats, allowance, messages });
  } catch (error) {
    const status = error instanceof WebChatError ? error.status : 500;
    return NextResponse.json({ ok: false, code: "failed", message: "Could not load your chats." }, { status });
  }
}
