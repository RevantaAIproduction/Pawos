import { NextResponse } from "next/server";
import { requireAccount, rejectCrossOrigin } from "../../../../../../lib/account/api";
import type { ChronicleReport } from "../../../../../../lib/chronicle/reportSchema";
import { readChronicleRequestText } from "../../../../../../lib/chronicle/requestBody";

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
  const raw = await readChronicleRequestText(request, 4096);
  if (raw === null) return NextResponse.json({ ok: false, message: "Question is too long or not valid UTF-8." }, { status: 413, headers: noStore });
  let body: unknown;
  try { body = JSON.parse(raw || "{}"); } catch { return NextResponse.json({ ok: false, message: "Question is invalid." }, { status: 400, headers: noStore }); }
  const question = typeof (body as {question?:unknown})?.question === "string" ? String((body as {question:string}).question).trim().slice(0, 500) : "";
  if (!question) return NextResponse.json({ ok: false, message: "Enter a question about this report." }, { status: 400, headers: noStore });
  const { data, error } = await guard.account.supabase.from("chronicle_reports").select("report_data").eq("id", reportId).eq("user_id", guard.account.user.id).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, message: "Report not found." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true, answer: answerFromReport(question, data.report_data as ChronicleReport) }, { headers: noStore });
}

function answerFromReport(question: string, report: ChronicleReport): string {
  const q = question.toLowerCase();
  const git = report.git;
  if (/\b(ai|agent|model|prompt|copilot|claude|codex|gemini)\b/.test(q)) {
    const metrics = report.agents.metrics;
    const sessions = Number(metrics.sessionCount);
    if (!sessions) return "No supported, repository-associated agent sessions were included. Chronicle cannot infer agent usage from an installation or configuration.";
    if (/\b(model|preferred)\b/.test(q)) {
      const models = Object.entries(metrics.modelCounts as Record<string, number>).sort((a, b) => b[1] - a[1]);
      return models.length ? "Recorded model identifiers by session: " + models.map(([name, amount]) => name + " (" + amount.toLocaleString("en-US") + ")").join(", ") + ". These are identifiers present in session records, not a quality ranking." : "The approved session records did not expose model identifiers.";
    }
    if (/\b(concurrent|overlap|parallel)\b/.test(q)) return "The highest observed overlap was " + Number(metrics.maxConcurrentSessions).toLocaleString("en-US") + " distinct session records with intersecting timestamps. This is not proof of separate agents or human collaboration.";
    if (/\b(longest|duration|long)\b/.test(q)) return metrics.longestSessionSeconds === null ? "Session start and end timestamps were not both available, so duration could not be measured." : "The longest session with usable timestamps lasted about " + Math.round(Number(metrics.longestSessionSeconds) / 60).toLocaleString("en-US") + " minutes.";
    if (/\b(fail|error|recover|recovery)\b/.test(q)) return "Approved records contain " + Number(metrics.failureSignals).toLocaleString("en-US") + " explicit tool failure signal(s). Chronicle does not yet reliably classify failure-to-recovery sequences.";
    if (/\b(prompt|planning|steer|course|correction)\b/.test(q)) return "Across " + sessions.toLocaleString("en-US") + " approved sessions, Chronicle observed " + Number(metrics.planningSignals).toLocaleString("en-US") + " planning-language signals and " + Number(metrics.correctionSignals).toLocaleString("en-US") + " correction-language signals. These are lexical signals, not a judgement of prompt quality.";
    return "Chronicle included " + sessions.toLocaleString("en-US") + " approved local agent sessions from " + Object.entries(metrics.sourceCounts as Record<string, number>).map(([name, amount]) => name + " (" + amount.toLocaleString("en-US") + ")").join(", ") + ". Raw prompts, replies and tool output were excluded from this report.";
  }
  if (/\b(author|who wrote|manual|human|collaborat)/.test(q)) return "Authorship is unknown. Git commit metadata alone cannot establish whether work was performed manually, by an agent, or collaboratively.";
  if (/\b(insert|added|addition|lines? added)\b/.test(q)) return `The observed Git history contains ${Number(git.insertions).toLocaleString()} line insertions. This is a repository diff total, not an author-specific contribution count.`;
  if (/\b(delet|removed|lines? removed)\b/.test(q)) return `The observed Git history contains ${Number(git.deletions).toLocaleString()} line deletions. This is a repository diff total, not an author-specific contribution count.`;
  if (/\b(branch|branches)\b/.test(q)) return `Chronicle found ${Number(git.currentBranchCount).toLocaleString()} current Git branches. It does not infer branch creation dates.`;
  if (/\b(merge|merged)\b/.test(q)) return `The observed history contains ${Number(git.mergeCommitCount).toLocaleString()} merge commits.`;
  if (/\b(category|categories|file type|file types)\b/.test(q)) return git.fileCategories.length ? `Observed file-change categories: ${git.fileCategories.map((item) => `${item.category} (${Number(item.changes).toLocaleString("en-US")})`).join(", ")}. These are counts per changed file per commit, not unique files.` : "No changed-file categories were recorded in this report.";
  if (/\b(file|files|change|changed)\b/.test(q)) return `The observed history contains ${Number(git.fileChanges).toLocaleString()} file-change records across ${Number(git.commitCount).toLocaleString()} commits. The count is not unique files.`;
  if (/\b(commit|commits|history)\b/.test(q)) return `Chronicle observed ${Number(git.commitCount).toLocaleString()} Git commits. ${git.historyTruncated ? "The report is limited to the latest 2,000 commits." : ""} Git activity does not establish who authored the work.`;
  if (/\b(test|build|ci|verify|verification)\b/.test(q)) return "This report does not include test, build, or CI run outcomes. Those execution adapters are not implemented in this release.";
  if (/\b(project|name|built)\b/.test(q)) return `${report.project.displayName} has ${Number(git.commitCount).toLocaleString()} commits in the observed Git history, with ${Number(git.fileChanges).toLocaleString()} file-change records.`;
  return "I can answer from the Git counts, additions/deletions, current branch and merge totals, file categories, and source coverage in this report. The report does not include source code, agent sessions, or verification results.";
}
