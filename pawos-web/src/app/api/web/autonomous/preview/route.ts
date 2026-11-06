import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../lib/account/api";
import { previewAutonomousWork } from "../../../../../lib/autonomous/localAutonomous";
import { autonomousFailure } from "../../../../../lib/autonomous/respond";

/**
 * POST /api/web/autonomous/preview  { ticket, organizationId? }
 * What starting Autonomous Work on a ticket would involve — the ticket, the Ticket Balance, the price
 * rule — and whether it may start. Reads only; nothing is started or charged.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    return NextResponse.json({ ok: true, ...(await previewAutonomousWork(guard.account, body)) });
  } catch (error) {
    return autonomousFailure(error);
  }
}
