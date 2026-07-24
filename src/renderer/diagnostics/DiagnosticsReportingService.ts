import { getSupabaseClient } from '../auth/supabaseClient';

export type DiagnosticReportType =
  | 'bug'
  | 'featureRequest'
  | 'crash'
  | 'uiException'
  | 'apiFailure'
  | 'updateFailure'
  | 'runtimeFailure'
  | 'authFailure'
  | 'billingIssue'
  | 'aiProviderFailure'
  | 'userFeedback'
  | 'performanceWarning'
  | 'supportRating';

export type DiagnosticReportSource = 'desktop' | 'website' | 'mobile' | 'api' | 'runtime' | 'companion';

export type DiagnosticComponent =
  | 'development'
  | 'communication'
  | 'research'
  | 'office'
  | 'cloud'
  | 'companion'
  | 'billing'
  | 'authentication'
  | 'electron'
  | 'backend';

export type DiagnosticLifecycleStatus = 'new' | 'investigating' | 'aiFixing' | 'waitingPermission' | 'resolved' | 'closed';

export type SubmitDiagnosticReportInput = {
  type: DiagnosticReportType;
  reportSource: DiagnosticReportSource;
  component: DiagnosticComponent;
  summary: string;
  details?: Record<string, unknown>;
  appVersion: string;
  os: string;
  /** A stable signature used to merge repeat occurrences into one issue. Defaults to a hash of type+component+summary. */
  fingerprint?: string;
  severity?: string;
};

function defaultFingerprint(input: SubmitDiagnosticReportInput): string {
  return `${input.type}:${input.component}:${input.summary}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The single ingestion pipe for bug/feature reports now, and crashes/
 * exceptions/failures/support ratings in later phases — inserts via
 * getSupabaseClient() (same pattern as auth and OrganizationService), so
 * platform admins get real Supabase-backed visibility rather than email
 * being the source of truth.
 */
export const diagnosticsReportingService = {
  async submitReport(input: SubmitDiagnosticReportInput): Promise<void> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data: issueId, error: issueError } = await supabase.rpc('upsert_diagnostic_issue', {
      p_fingerprint: input.fingerprint ?? defaultFingerprint(input),
      p_type: input.type,
      p_report_source: input.reportSource,
      p_component: input.component,
      p_summary: input.summary,
      p_app_version: input.appVersion,
    });
    if (issueError) throw issueError;

    const { error: reportError } = await supabase.from('diagnostic_reports').insert({
      issue_id: issueId,
      user_id: userData.user?.id ?? null,
      email: userData.user?.email ?? null,
      type: input.type,
      report_source: input.reportSource,
      component: input.component,
      severity: input.severity ?? null,
      summary: input.summary,
      details: input.details ?? {},
      app_version: input.appVersion,
      os: input.os,
    });
    if (reportError) throw reportError;
  },
};
