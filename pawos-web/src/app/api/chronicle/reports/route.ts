import { NextResponse } from "next/server";
import { requireAccount, rejectCrossOrigin } from "../../../../lib/account/api";
import { applyChronicleServerVerification, buildChronicleDevelopmentStory, chronicleSnapshotHash, validateChronicleReport } from "../../../../lib/chronicle/reportSchema";
import { readChronicleRequestText } from "../../../../lib/chronicle/requestBody";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
const MAX_UPLOAD_BYTES = 1024 * 1024;

export async function GET() {
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { data, error } = await guard.account.supabase.from("chronicle_reports")
    .select("id, project_name, created_at, share_token, shared_at, report_data")
    .eq("user_id", guard.account.user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: false, message: "Chronicle history could not be loaded." }, { status: 503, headers: noStore });
  return NextResponse.json({ ok: true, reports: data ?? [] }, { headers: noStore });
}

export async function POST(request: Request) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, message: "This report is larger than Chronicle's 1 MB upload limit." }, { status: 413, headers: noStore });
  const raw = await readChronicleRequestText(request, MAX_UPLOAD_BYTES);
  if (raw === null) return NextResponse.json({ ok: false, message: "This report is larger than Chronicle's 1 MB upload limit or is not valid UTF-8." }, { status: 413, headers: noStore });
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, message: "The selected file is not valid JSON." }, { status: 400, headers: noStore }); }
  const result = validateChronicleReport(input);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 400, headers: noStore });
  // Rebuild on the server so even legacy reports cannot smuggle arbitrary narrative text.
  const verified = applyChronicleServerVerification(result.report);
  const report = { ...verified, developmentStory: buildChronicleDevelopmentStory(verified) };
  const snapshotHash = chronicleSnapshotHash(report);
  const { data, error } = await guard.account.supabase.from("chronicle_reports").insert({
    user_id: guard.account.user.id,
    project_id: report.project.localProjectId,
    project_name: report.project.displayName,
    snapshot_hash: snapshotHash,
    report_data: report,
  }).select("id, project_name, created_at").single();
  if (error) {
    console.error("[chronicle-upload] report persistence failed:", error.code ?? "unknown");
    return NextResponse.json({ ok: false, message: "PawOS could not save this report. It remains available in your local Chronicle reports." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ ok: true, report: data }, { status: 201, headers: noStore });
}

export async function DELETE(request: Request) {
  const origin = rejectCrossOrigin(request);
  if (origin) return origin;
  const guard = await requireAccount();
  if (!guard.ok) return guard.response;
  const { data, error } = await guard.account.supabase.from("chronicle_reports").delete().eq("user_id", guard.account.user.id).select("id");
  if (error) return NextResponse.json({ ok: false, message: "Cloud reports could not be deleted." }, { status: 503, headers: noStore });
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 }, { headers: noStore });
}
