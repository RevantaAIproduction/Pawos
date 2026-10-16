import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../lib/account/api";
import { agentTurn } from "../../../../../lib/webAgent/agent";
import { WebChatError } from "../../../../../lib/webChat/errors";

/**
 * POST /api/web/agent/turn — one turn of a task done on the user's own computer (the PawOS CLI's
 * local mode).
 *
 *   { taskId, goal, workspace: { name, branch, files, filesTruncated } }   starts a task
 *   { taskId, result: { id, ok, output, truncated?, denied? } }            reports the tool that was run
 *
 * The answer is the next step: { turn: { kind: "tool", call: { id, name, args }, note } } — a tool
 * from a fixed list for the client to run locally — or { turn: { kind: "finish", summary } }.
 *
 * Signed-in accounts only (session cookie or bearer token, like every Web API route). The plan's
 * capability and its usage are checked here on every turn (lib/webAgent/agent.ts); nothing in the
 * body can widen them. The service makes the model call; it runs nothing on the user's machine.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) as unknown;
  try {
    const outcome = await agentTurn(guard.account, body);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    if (error instanceof WebChatError) {
      // A failure the client may send again carries how long to wait first — in the body for PawOS's
      // own clients, and as the standard header for anything else.
      const retry = error.retryAfterMs !== undefined ? { body: { retryAfterMs: error.retryAfterMs }, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } } : null;
      return NextResponse.json({ ok: false, code: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}), ...(retry?.body ?? {}) }, { status: error.status, ...(retry ? { headers: retry.headers } : {}) });
    }
    console.error("[web-agent] unexpected failure");
    return NextResponse.json({ ok: false, code: "failed", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
