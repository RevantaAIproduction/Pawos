import { NextResponse } from "next/server";
import { requireAccount } from "../../../../../lib/account/api";
import { imageAllowance } from "../../../../../lib/webImages/imageGeneration";

/** GET /api/web/images/allowance — the price of an image for this account, and Paw Go's free images left. */
export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, ...(await imageAllowance(guard.account)) });
  } catch {
    return NextResponse.json({ ok: false, code: "failed", message: "Image generation isn't available right now." }, { status: 503 });
  }
}
