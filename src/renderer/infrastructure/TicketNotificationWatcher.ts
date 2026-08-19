import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { crossDeviceRuntimeClient } from '../mobilePresence/CrossDeviceRuntimeClient';
import { classifyPriority, classifyDeadline, summarizeTickets, type TicketSummary, type TicketWithUrgency } from '../../shared/infrastructure/ticketUrgency';
import type { InfraTicket } from '../../shared/infrastructure/InfrastructureTypes';

const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes — a periodic background check, not real-time

function describeTicket(t: TicketWithUrgency): string {
  const parts: string[] = [`${t.id}: "${t.title}"`];
  if (t.deadline === 'overdue') parts.push('overdue');
  else if (t.deadline === 'dueToday') parts.push('due today');
  else if (t.deadline === 'dueThisWeek') parts.push('due this week');
  if (t.priority) parts.push(`priority: ${t.priority}`);
  if (t.assignee) parts.push(`assigned to ${t.assignee}`);
  if (t.reporter) parts.push(`reported by ${t.reporter}`);
  return parts.join(' — ');
}

/** Pure — builds the desktop/mobile notification body from a real summary. Never fabricates a
 *  reason to notify; only called once the caller has already decided something changed. */
export function buildNotificationBody(summary: TicketSummary): { title: string; body: string } {
  const urgentCount = summary.byUrgency.urgent + summary.byUrgency.high;
  const dueSoonCount = summary.byDeadline.overdue + summary.byDeadline.dueToday + summary.byDeadline.dueThisWeek;
  const title = summary.total === 1 ? '1 ticket assigned to you' : `${summary.total} tickets assigned to you`;
  const countLine = `${urgentCount} urgent/high priority, ${summary.byDeadline.overdue} overdue, ${dueSoonCount} due this week.`;
  const body = summary.topPriority ? `${countLine} Most pressing: ${describeTicket(summary.topPriority)}.` : countLine;
  return { title, body };
}

/** True for a ticket worth ever notifying about — real priority (urgent/high) or a real deadline
 *  that's overdue/due today/due this week. Never a normal/low/unranked ticket. */
function isWorthWatching(t: TicketWithUrgency): boolean {
  return t.urgency === 'urgent' || t.urgency === 'high' || t.deadline === 'overdue' || t.deadline === 'dueToday' || t.deadline === 'dueThisWeek';
}

/**
 * Periodic ticket-urgency check (Ticket Notifications) — reuses ListMyTicketsPlugin (already-real
 * connector data, never fabricated) and the already-built Notification Runtime (MOB-7) pipeline for
 * delivery: `companionShowNotification` for desktop, `crossDeviceRuntimeClient.publish('connectorAlert', ...)`
 * for mobile (picked up automatically by NotificationRuntime.ts's existing dispatcher/push-send
 * pipeline — no new mobile-delivery code needed here). Only notifies once per newly-appearing
 * urgent/overdue/due-soon ticket, never repeats the same ticket every poll.
 */
export function startTicketNotificationWatcher(userId: string): () => void {
  let cancelled = false;
  /** Ticket ids already surfaced as worth-watching, across the lifetime of this watcher — used to
   *  detect genuinely *new* urgency, not to re-notify about a ticket that was already urgent last
   *  check and still is. */
  let seen = new Set<string>();
  let seeded = false;

  async function check(): Promise<void> {
    const result = await ipc.actionExecute({ type: 'listMyTickets' }).catch(() => null);
    if (cancelled || !result || !result.ok) return; // no connector configured, or a transient failure — stay silent, never notify about an error

    const data = result.data as { tickets: Array<InfraTicket & { connectorId: string }> };
    const classified: TicketWithUrgency[] = data.tickets.map((t) => ({ ...t, urgency: classifyPriority(t.priority), deadline: classifyDeadline(t.dueDate) }));
    const watching = classified.filter(isWorthWatching);

    if (!seeded) {
      // First check this session — record current state as a baseline, never fire a notification
      // for tickets that were already sitting there before PawOS started watching.
      seen = new Set(watching.map((t) => t.id));
      seeded = true;
      return;
    }

    const newlyWorrying = watching.filter((t) => !seen.has(t.id));
    seen = new Set(watching.map((t) => t.id)); // also drops ids that resolved/were reassigned, so a re-opened ticket can re-notify later
    if (newlyWorrying.length === 0) return;

    const summary = summarizeTickets(data.tickets);
    const { title, body } = buildNotificationBody(summary);
    void ipc.companionShowNotification(title, body).catch(() => {});
    void crossDeviceRuntimeClient.publish('connectorAlert', 'ticketNotifications', { summary: body, title }, { userId }).catch(() => {});
  }

  void check();
  const interval = setInterval(() => void check(), POLL_INTERVAL_MS);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}
