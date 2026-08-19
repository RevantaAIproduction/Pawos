import type { InfraTicket } from './InfrastructureTypes';

export type UrgencyBucket = 'urgent' | 'high' | 'normal' | 'low' | 'unset';
export type DeadlineBucket = 'overdue' | 'dueToday' | 'dueThisWeek' | 'later' | 'none';

/**
 * Maps each provider's own real priority label onto one shared bucket — never inferred from
 * labels/text (per the user's explicit instruction), only from the structured priority field
 * each connector already reports. A priority string this map doesn't recognize (a custom Jira
 * priority scheme, for instance) honestly falls back to 'unset' rather than guessing.
 */
const PRIORITY_MAP: Record<string, UrgencyBucket> = {
  // Jira
  highest: 'urgent',
  high: 'high',
  medium: 'normal',
  low: 'low',
  lowest: 'low',
  // Linear
  urgent: 'urgent',
};

export function classifyPriority(priority: string | undefined): UrgencyBucket {
  if (!priority) return 'unset';
  return PRIORITY_MAP[priority.trim().toLowerCase()] ?? 'unset';
}

export function classifyDeadline(dueDate: string | undefined, now: number = Date.now()): DeadlineBucket {
  if (!dueDate) return 'none';
  const due = new Date(dueDate).getTime();
  if (Number.isNaN(due)) return 'none';
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = startOfToday.getTime() + 24 * 60 * 60 * 1000;
  const endOfWeek = startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000;
  if (due < startOfToday.getTime()) return 'overdue';
  if (due < startOfTomorrow) return 'dueToday';
  if (due < endOfWeek) return 'dueThisWeek';
  return 'later';
}

export type TicketWithUrgency = InfraTicket & { connectorId: string; urgency: UrgencyBucket; deadline: DeadlineBucket };

export type TicketSummary = {
  total: number;
  byUrgency: Record<UrgencyBucket, number>;
  byDeadline: Record<DeadlineBucket, number>;
  /** The single most attention-worthy ticket (overdue or urgent, ranked before due-soon, ranked
   *  before high priority) — undefined when nothing qualifies, never a fabricated pick. */
  topPriority?: TicketWithUrgency;
};

const URGENCY_RANK: Record<UrgencyBucket, number> = { urgent: 0, high: 1, normal: 2, low: 3, unset: 4 };
const DEADLINE_RANK: Record<DeadlineBucket, number> = { overdue: 0, dueToday: 1, dueThisWeek: 2, later: 3, none: 4 };

/** Pure, deterministic — never fires an LLM call, never guesses beyond the real fields each
 *  connector already reports. */
export function summarizeTickets(tickets: Array<InfraTicket & { connectorId: string }>, now: number = Date.now()): TicketSummary {
  const byUrgency: Record<UrgencyBucket, number> = { urgent: 0, high: 0, normal: 0, low: 0, unset: 0 };
  const byDeadline: Record<DeadlineBucket, number> = { overdue: 0, dueToday: 0, dueThisWeek: 0, later: 0, none: 0 };
  const classified: TicketWithUrgency[] = tickets.map((t) => {
    const urgency = classifyPriority(t.priority);
    const deadline = classifyDeadline(t.dueDate, now);
    byUrgency[urgency] += 1;
    byDeadline[deadline] += 1;
    return { ...t, urgency, deadline };
  });

  // Ranks by (deadline urgency, priority urgency) as a lexicographic pair — overdue beats
  // due-today beats due-this-week beats everything else; ties broken by real priority.
  let topPriority: TicketWithUrgency | undefined;
  for (const t of classified) {
    if (!topPriority) {
      topPriority = t;
      continue;
    }
    const a: [number, number] = [DEADLINE_RANK[t.deadline], URGENCY_RANK[t.urgency]];
    const b: [number, number] = [DEADLINE_RANK[topPriority.deadline], URGENCY_RANK[topPriority.urgency]];
    if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) topPriority = t;
  }
  // Only surface a "top priority" pick when it's genuinely worth surfacing — overdue, due soon, or
  // urgent/high priority. A pile of unranked/low-priority tickets never produces a fabricated pick.
  const worthSurfacing =
    topPriority && (topPriority.deadline === 'overdue' || topPriority.deadline === 'dueToday' || topPriority.deadline === 'dueThisWeek' || topPriority.urgency === 'urgent' || topPriority.urgency === 'high');

  return { total: tickets.length, byUrgency, byDeadline, topPriority: worthSurfacing ? topPriority : undefined };
}
