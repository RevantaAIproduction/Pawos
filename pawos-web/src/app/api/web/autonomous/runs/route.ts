import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../lib/account/api";
import { startAutonomousWork } from "../../../../../lib/autonomous/localAutonomous";
import { autonomousFailure } from "../../../../../lib/autonomous/respond";

/**
 * POST /api/web/autonomous/runs  { ticket, authorized: true, repository?, organizationId? }
 * Starts an Autonomous Work run for a ticket (or returns the one already running), after the same
 * checks the desktop makes. Refused without the user's authorization.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    return NextResponse.json({ ok: true, ...(await startAutonomousWork(guard.account, body)) });
  } catch (error) {
    return autonomousFailure(error);
  }
}
