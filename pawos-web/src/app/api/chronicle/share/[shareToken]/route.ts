import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(shareToken)) return NextResponse.json({ ok: false, message: "This shared report is unavailable." }, { status: 404, headers: noStore });
  let supabase;
  try { supabase = await createClient(); } catch { return NextResponse.json({ ok: false, message: "Shared reports are temporarily unavailable." }, { status: 503, headers: noStore }); }
  const { data, error } = await supabase.rpc("chronicle_get_shared_report", { p_share_token: shareToken });
  if (error || !data) return NextResponse.json({ ok: false, message: "This shared report is unavailable." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, report: data }, { headers: noStore });
}
