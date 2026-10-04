import { NextResponse } from "next/server";
import { requireAccount } from "../../../../lib/account/api";
import { DesktopHandoffError, buildDesktopHandoff } from "../../../../lib/webPolicy/desktopHandoff";

/**
 * GET /api/web/handoff?chat=<id> — what "Continue in PawOS Desktop" needs for one of the signed-in
 * account's own web chats: the link that opens PawOS Desktop, and the conversation as text to bring
 * along. Built from the stored conversation, never from anything the browser holds. 404 for a chat
 * that isn't the account's; 403 if the plan didn't include the capability.
 */
export async function GET(request: Request) {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    const handoff = await buildDesktopHandoff(guard.account, new URL(request.url).searchParams.get("chat"));
    return NextResponse.json({ ok: true, handoff });
  } catch (error) {
    if (error instanceof DesktopHandoffError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, code: "failed", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
