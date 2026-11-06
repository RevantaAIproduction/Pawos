import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../../lib/account/api";
import { finishAutonomousWork } from "../../../../../../lib/autonomous/localAutonomous";
import { autonomousFailure } from "../../../../../../lib/autonomous/respond";

type RouteProps = { params: Promise<{ runId: string }> };

/**
 * POST /api/web/autonomous/runs/<run id>
 *   { outcome: "completed", filesChanged, linesChanged, prUrl?, comment?, commentConfirmed? }
 *   { outcome: "failed" | "cancelled" }
 * Ends one of the account's own runs through the desktop's billing functions: a completed ticket is
 * charged once, by change size; a failed run costs nothing.
 */
export async function POST(request: Request, props: RouteProps) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { runId } = await props.params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    return NextResponse.json({ ok: true, ...(await finishAutonomousWork(guard.account, runId, body)) });
  } catch (error) {
    return autonomousFailure(error);
  }
}
