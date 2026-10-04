import { NextResponse } from "next/server";
import { requireAccount } from "../../../../../lib/account/api";
import { refreshCodeChange } from "../../../../../lib/webCode/changeWatch";

type RouteProps = { params: Promise<{ requestId: string }> };

/**
 * GET /api/web/changes/<request id> — one of the signed-in account's code changes, as the task
 * panel shows it: its steps, the pushed commit, the preview URL and how the checks are doing.
 * Asking also lets the server check GitHub (throttled) and, if the repository's checks failed,
 * start an automatic fix within the plan's limits. Another account's change is 404.
 */
export async function GET(_request: Request, props: RouteProps) {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { requestId } = await props.params;
  const change = await refreshCodeChange(guard.account, requestId).catch(() => null);
  if (!change) return NextResponse.json({ ok: false, code: "not_found", message: "That change doesn't exist." }, { status: 404 });
  return NextResponse.json({ ok: true, change }, { headers: { "Cache-Control": "no-store" } });
}
