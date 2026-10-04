import { NextResponse } from "next/server";
import { rejectCrossOrigin, requireAccount } from "../../../../../lib/account/api";
import { WebChatError } from "../../../../../lib/webChat/errors";
import { clearRepository, getCodeChangeReadiness, selectRepository } from "../../../../../lib/webCode/repository";

function failure(error: unknown) {
  const failed = error instanceof WebChatError ? error : new WebChatError("failed", "Something went wrong. Please try again.", 500);
  return NextResponse.json({ ok: false, code: failed.code, message: failed.message }, { status: failed.status });
}

/** GET /api/web/github/repository — whether this account can make code changes from the web, and where. */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, readiness: await getCodeChangeReadiness(guard.account) });
  } catch (error) {
    return failure(error);
  }
}

/**
 * PUT /api/web/github/repository { fullName } — select the repository PawOS Web makes code
 * changes in. The server asks GitHub whether the account can push to it before saving it.
 */
export async function PUT(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as { fullName?: unknown } | null;
  try {
    const repository = await selectRepository(guard.account, body?.fullName);
    return NextResponse.json({ ok: true, readiness: await getCodeChangeReadiness(guard.account).catch(() => ({ state: "ready", repository })) });
  } catch (error) {
    return failure(error);
  }
}

/** DELETE /api/web/github/repository — stop making changes in the selected repository. */
export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    await clearRepository(guard.account);
    return NextResponse.json({ ok: true, readiness: await getCodeChangeReadiness(guard.account) });
  } catch (error) {
    return failure(error);
  }
}
