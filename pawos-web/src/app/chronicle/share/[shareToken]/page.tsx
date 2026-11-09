import { notFound } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { ChronicleReportView } from "../../reports/[reportId]/ChronicleReportView";

export const metadata = { title: "Shared Chronicle Report", robots: { index: false, follow: false } };
export default async function SharedChronicleReportPage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  if (!/^[a-f0-9]{64}$/.test(shareToken)) notFound();
  let supabase;
  try { supabase = await createClient(); } catch { notFound(); }
  const { data, error } = await supabase.rpc("chronicle_get_shared_report", { p_share_token: shareToken });
  if (error || !data?.reportData) notFound();
  return <ChronicleReportView saved={{ id: data.reportId, project_name: data.projectName, created_at: data.createdAt, share_token: null, report_data: data.reportData } as never} readOnly />;
}
