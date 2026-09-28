import { getSupabaseClient } from '../auth/supabaseClient';
import type { EvidenceItem } from '../../shared/evidence/EvidenceTypes';

const BUCKET = 'ticket-evidence';
/** Signed links for viewing are short-lived; the bucket itself is never public. */
const SIGNED_URL_SECONDS = 600;

/** One evidence row as the Ticket Wallet history reads it (autonomous_run_evidence). */
export type RunEvidence = {
  id: string;
  runId: string;
  phase: 'before' | 'after';
  kind: 'image' | 'output';
  provider: string;
  label: string;
  targetDescription: string;
  storagePath: string | null;
  output: { source: string; status: number | null; text: string } | null;
  pageSignals: { title: string; consoleErrors: string[]; failedRequests: string[] } | null;
  capturedAt: number;
};

/** One ticket in the Ticket Wallet history (autonomous_task_runs). */
export type TicketHistoryEntry = {
  runId: string;
  ticketSource: string | null;
  ticketId: string | null;
  ticketTitle: string | null;
  status: string;
  chargedUsd: number;
  fixSummary: string | null;
  filesChanged: number | null;
  linesChanged: number | null;
  prUrl: string | null;
  createdAt: number;
  completedAt: number | null;
};

type HistoryRow = {
  id: string;
  ticket_source: string | null;
  ticket_id: string | null;
  ticket_title: string | null;
  status: string;
  charged_usd: number | string | null;
  fix_summary: string | null;
  files_changed: number | null;
  lines_changed: number | null;
  pr_url: string | null;
  created_at: string;
  completed_at: string | null;
};

type EvidenceRow = {
  id: string;
  run_id: string;
  phase: 'before' | 'after';
  kind: 'image' | 'output';
  provider: string;
  label: string;
  target_description: string;
  storage_path: string | null;
  output_source: string | null;
  output_status: number | null;
  output_text: string | null;
  page_signals: RunEvidence['pageSignals'];
  captured_at: string;
};

function toEvidence(row: EvidenceRow): RunEvidence {
  return {
    id: row.id,
    runId: row.run_id,
    phase: row.phase,
    kind: row.kind,
    provider: row.provider,
    label: row.label,
    targetDescription: row.target_description,
    storagePath: row.storage_path,
    output: row.kind === 'output' ? { source: row.output_source ?? '', status: row.output_status, text: row.output_text ?? '' } : null,
    pageSignals: row.page_signals,
    capturedAt: Date.parse(row.captured_at),
  };
}

function base64ToBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Durable ticket evidence: the run record (autonomous_task_runs) stays the source of truth; evidence rows
 * hang off it (autonomous_run_evidence) and images live in the private ticket-evidence bucket at
 * <owner>/<run>/<evidence>.png. Every write is best-effort — evidence is optional, so a failure here is
 * logged and never affects a run's outcome, status or charge.
 */
export const ticketEvidenceService = {
  /** Uploads (images) and attaches one captured evidence item to its run. Resolves false instead of throwing. */
  async persistEvidence(runId: string, evidence: EvidenceItem, imageBase64?: string): Promise<boolean> {
    try {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return false;

      let storagePath: string | null = null;
      if (evidence.kind === 'image') {
        if (!imageBase64) return false;
        storagePath = `${userId}/${runId}/${evidence.id}.png`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, base64ToBlob(imageBase64), { contentType: 'image/png', upsert: false });
        // Already uploaded (a retried save) is fine; anything else stops here.
        if (uploadError && !/exists|duplicate/i.test(uploadError.message)) throw uploadError;
      }

      const { error } = await supabase.rpc('add_autonomous_run_evidence', {
        p_id: evidence.id,
        p_run_id: runId,
        p_phase: evidence.phase,
        p_kind: evidence.kind,
        p_provider: evidence.provider,
        p_label: evidence.label,
        p_target_description: evidence.targetDescription,
        p_storage_path: storagePath,
        p_output_source: evidence.output?.source ?? null,
        p_output_status: evidence.output?.status ?? null,
        p_output_text: evidence.output?.text ?? null,
        p_page_signals: evidence.pageSignals ?? null,
        p_captured_at: new Date(evidence.capturedAt).toISOString(),
      });
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn('[ticket-evidence] Could not save evidence to the run (optional, continuing):', error instanceof Error ? error.message : error);
      return false;
    }
  },

  /** Ticket title / what was fixed, on the run the caller owns. Descriptive only — never billing or status. */
  async recordRunDetails(runId: string, details: { ticketTitle?: string | null; fixSummary?: string | null }): Promise<void> {
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.rpc('record_autonomous_run_details', {
        p_run_id: runId,
        p_ticket_title: details.ticketTitle ?? null,
        p_fix_summary: details.fixSummary ?? null,
      });
      if (error) throw error;
    } catch (error) {
      console.warn('[ticket-evidence] Could not record run details (optional, continuing):', error instanceof Error ? error.message : error);
    }
  },

  /**
   * The Ticket Wallet history, straight from the run records (the source of truth) — the caller's own
   * personal runs, newest first. Read-only.
   */
  async listRunHistory(limit = 20): Promise<TicketHistoryEntry[]> {
    const supabase = await getSupabaseClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];
    const { data, error } = await supabase
      .from('autonomous_task_runs')
      .select('id, ticket_source, ticket_id, ticket_title, status, charged_usd, fix_summary, files_changed, lines_changed, pr_url, created_at, completed_at')
      .eq('user_id', auth.user.id)
      .is('organization_id', null)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<HistoryRow[]>();
    if (error) throw error;
    return (data ?? []).map((row) => ({
      runId: row.id,
      ticketSource: row.ticket_source,
      ticketId: row.ticket_id,
      ticketTitle: row.ticket_title,
      status: row.status,
      chargedUsd: Number(row.charged_usd ?? 0),
      fixSummary: row.fix_summary,
      filesChanged: row.files_changed,
      linesChanged: row.lines_changed,
      prUrl: row.pr_url,
      createdAt: Date.parse(row.created_at),
      completedAt: row.completed_at ? Date.parse(row.completed_at) : null,
    }));
  },

  /** Evidence for these runs, oldest first per run. Only the caller's own (RLS). */
  async listForRuns(runIds: string[]): Promise<RunEvidence[]> {
    if (runIds.length === 0) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('autonomous_run_evidence').select('*').in('run_id', runIds).order('captured_at', { ascending: true }).returns<EvidenceRow[]>();
    if (error) throw error;
    return (data ?? []).map(toEvidence);
  },

  /** Short-lived viewing links for stored images (path → url). Missing entries = not viewable. */
  async signedUrls(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw error;
    const urls: Record<string, string> = {};
    for (const entry of data ?? []) if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
    return urls;
  },

  /** One stored image's bytes (base64) — for reopened chats and for the AI's inspect_evidence when the local copy is gone. */
  async downloadImage(storagePath: string): Promise<string | null> {
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
      if (error || !data) return null;
      return await blobToBase64(data);
    } catch {
      return null;
    }
  },
};
