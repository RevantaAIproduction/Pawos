import type { RunEvidence, TicketHistoryEntry } from '../../organization/TicketEvidenceService';

const SOURCE_LABELS: Record<string, string> = { jira: 'Jira', linear: 'Linear', github: 'GitHub', azureDevOps: 'Azure DevOps' };

export function ticketSourceLabel(source: string | null): string {
  return source ? SOURCE_LABELS[source] ?? source : 'Direct task';
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'busy' | 'muted' }> = {
  completed: { label: 'Fixed', tone: 'ok' },
  verified: { label: 'Verified', tone: 'ok' },
  implementation_complete: { label: 'Checking', tone: 'busy' },
  awaiting_verification: { label: 'Checking', tone: 'busy' },
  queued: { label: 'Queued', tone: 'busy' },
  abandoned: { label: 'Abandoned', tone: 'muted' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  retry_limit_reached: { label: 'Stopped', tone: 'bad' },
  blocked: { label: 'Blocked', tone: 'bad' },
  waiting_for_permission: { label: 'Waiting', tone: 'busy' },
  waiting_for_topup: { label: 'Needs credits', tone: 'busy' },
};

/** Plain words for a run's status; anything still in progress reads "Running". */
export function ticketStatus(status: string): { label: string; tone: 'ok' | 'bad' | 'busy' | 'muted' } {
  return STATUS[status] ?? { label: 'Running', tone: 'busy' };
}

/** "#PAWOS-12 · Fix checkout layout" / "Fix checkout layout" / "Autonomous task". */
export function ticketHeading(entry: Pick<TicketHistoryEntry, 'ticketId' | 'ticketTitle'>): string {
  const parts = [entry.ticketId ? `#${entry.ticketId}` : null, entry.ticketTitle?.trim() || null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Autonomous task';
}

export type RunEvidenceGroups = {
  /** Screenshots (web page, app window, device) — shown as thumbnails. */
  images: RunEvidence[];
  /** Output/log evidence — shown as text, never as a screenshot. */
  outputs: RunEvidence[];
};

/** A run's evidence split into screenshots and output, each before-then-after in capture order. */
export function groupRunEvidence(evidence: RunEvidence[], runId: string): RunEvidenceGroups {
  const mine = evidence.filter((e) => e.runId === runId).sort((a, b) => (a.phase === b.phase ? a.capturedAt - b.capturedAt : a.phase === 'before' ? -1 : 1));
  return { images: mine.filter((e) => e.kind === 'image'), outputs: mine.filter((e) => e.kind === 'output') };
}
