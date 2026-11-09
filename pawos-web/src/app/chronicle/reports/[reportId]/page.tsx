import { notFound, redirect } from "next/navigation";
import { getAccountContext } from "../../../../lib/account/accountContext";
import { ChronicleReportView } from "./ChronicleReportView";

export const metadata = { title: "Chronicle Report", robots: { index: false, follow: false } };
export default async function ChronicleReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const account = await getAccountContext();
  if (!account) redirect("/login?next=%2Fchronicle%2Freports");
  const { reportId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) notFound();
  const { data, error } = await account.supabase.from("chronicle_reports").select("id,project_name,created_at,share_token,report_data").eq("id", reportId).eq("user_id", account.user.id).maybeSingle();
  if (error || !data) notFound();
  return <ChronicleReportView saved={data as never} />;
}
