import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAccount, rejectCrossOrigin } from "../../../../../../lib/account/api";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
type Context = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, context: Context) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { reportId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  const token = randomBytes(32).toString("hex");
  const { data, error } = await guard.account.supabase.rpc("chronicle_set_report_share", { p_report_id: reportId, p_share_token: token });
  if (error) return NextResponse.json({ ok: false, message: "Sharing could not be enabled." }, { status: 503, headers: noStore });
  if (data !== true) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, shareToken: token }, { headers: noStore });
}

export async function DELETE(request: Request, context: Context) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { reportId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  const { data, error } = await guard.account.supabase.rpc("chronicle_set_report_share", { p_report_id: reportId, p_share_token: null });
  if (error) return NextResponse.json({ ok: false, message: "Sharing could not be disabled." }, { status: 503, headers: noStore });
  if (data !== true) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
