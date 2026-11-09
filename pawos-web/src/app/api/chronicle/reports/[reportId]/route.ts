import { NextResponse } from "next/server";
import { requireAccount, rejectCrossOrigin } from "../../../../../lib/account/api";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
type Context = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, context: Context) {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { reportId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  const { data, error } = await guard.account.supabase.from("chronicle_reports")
    .select("id, project_name, created_at, share_token, shared_at, report_data")
    .eq("id", reportId).eq("user_id", guard.account.user.id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, message: "Report could not be loaded." }, { status: 503, headers: noStore });
  if (!data) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, report: data }, { headers: noStore });
}

export async function DELETE(request: Request, context: Context) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { reportId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  const { data, error } = await guard.account.supabase.from("chronicle_reports").delete().eq("id", reportId).eq("user_id", guard.account.user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, message: "Report could not be deleted." }, { status: 503, headers: noStore });
  if (!data) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
