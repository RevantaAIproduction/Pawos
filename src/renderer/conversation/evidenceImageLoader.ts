import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../auth/supabaseClient';
import { ticketEvidenceService } from '../organization/TicketEvidenceService';

/**
 * A captured evidence image's bytes (base64), by evidence id: the local evidence folder first (a cache),
 * then — for evidence saved on a ticket run — the durable copy in the private ticket-evidence bucket.
 * Null when neither has it (e.g. chat-only evidence whose local file was removed).
 */
export async function loadEvidenceImage(ref: { evidenceId: string; runId?: string }): Promise<string | null> {
  const local = await ipc.evidenceReadImage(ref.evidenceId).catch(() => null);
  if (local?.base64) return local.base64;
  if (!ref.runId) return null;
  try {
    const supabase = await getSupabaseClient();
    const { data } = await supabase.from('autonomous_run_evidence').select('storage_path').eq('id', ref.evidenceId).maybeSingle<{ storage_path: string | null }>();
    return data?.storage_path ? await ticketEvidenceService.downloadImage(data.storage_path) : null;
  } catch {
    return null;
  }
}
