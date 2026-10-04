import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../lib/account/api";
import { WebChatError, sendMessage } from "../../../../lib/webChat/webChat";

/**
 * POST /api/web-chat/messages { chatId?, content, requestId?, attachment?, recoverOnly? }
 * Send one message in PawOS Web chat. Signed-in accounts only. The tier, the web capability, the
 * Paw Go message cap and the usage allowance are all resolved and enforced on the server (see
 * lib/webChat/webChat.ts and lib/webPolicy/webCapabilities.ts); nothing in the body can widen them.
 *
 * `requestId` makes the call safe to retry: if the same id was already processed, the stored reply
 * comes back and nothing is sent, charged or counted again. `recoverOnly: true` only performs that
 * lookup — a client uses it after a dropped connection to ask "did my last message arrive?".
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const result = await sendMessage(guard.account, {
      chatId: body?.chatId,
      content: body?.content,
      requestId: body?.requestId,
      recoverOnly: body?.recoverOnly,
      attachment: body?.attachment,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof WebChatError) {
      return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    }
    console.error("[web-chat] unexpected failure");
    return NextResponse.json({ ok: false, code: "failed", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
