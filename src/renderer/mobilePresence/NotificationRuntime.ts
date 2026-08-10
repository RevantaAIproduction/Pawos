import { getSupabaseClient } from '../auth/supabaseClient';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { crossDeviceRuntimeClient } from './CrossDeviceRuntimeClient';
import { trustedDeviceService } from './TrustedDeviceService';
import type { CrossDeviceEvent, CrossDeviceEventType, PushNotificationPayload } from '../../shared/mobilePresence/MobilePresenceTypes';

/**
 * Every CrossDeviceEventType meant to actually page a phone with a
 * notification, as opposed to the Cross Device Runtime's own internal
 * plumbing events (presenceUpdate, desktopStatus, devicePaired,
 * deviceRevoked, conversationMessage — the latter belongs to Conversation
 * Sync, MOB-8, not a push notification).
 */
const NOTIFIABLE_EVENT_TYPES: ReadonlySet<CrossDeviceEventType> = new Set([
  'taskCompleted',
  'executionCompleted',
  'workflowCompleted',
  'approvalRequired',
  'meetingReminder',
  'plannerUpdate',
  'intelligenceUpdate',
  'securityAlert',
  'organizationAlert',
  'deploymentAlert',
  'billingAlert',
  'connectorAlert',
]);

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

/** Pure, testable — builds the human-readable notification from a raw event. Never fabricates detail the event doesn't actually carry: falls back to a generic-but-honest body rather than inventing specifics. */
export function formatNotification(event: CrossDeviceEvent): PushNotificationPayload {
  const summary = stringField(event.payload, 'summary');
  const name = stringField(event.payload, 'name') ?? stringField(event.payload, 'title');
  switch (event.eventType) {
    case 'taskCompleted':
      return { title: 'Task completed', body: summary ?? 'A task finished on your desktop.', eventType: event.eventType };
    case 'executionCompleted':
      return { title: 'Execution finished', body: summary ?? 'PawOS finished running a command on your desktop.', eventType: event.eventType };
    case 'workflowCompleted':
      return { title: 'Workflow completed', body: summary ?? (name ? `"${name}" finished.` : 'A workflow finished on your desktop.'), eventType: event.eventType };
    case 'approvalRequired':
      return { title: 'Approval needed', body: summary ?? 'PawOS needs your approval to continue.', eventType: event.eventType };
    case 'meetingReminder':
      return { title: 'Meeting reminder', body: summary ?? (name ? `${name} is starting soon.` : 'A meeting is starting soon.'), eventType: event.eventType };
    case 'plannerUpdate':
      return { title: 'Plan updated', body: summary ?? 'Your execution plan changed.', eventType: event.eventType };
    case 'intelligenceUpdate':
      return { title: 'New report ready', body: summary ?? 'A new intelligence report is ready to review.', eventType: event.eventType };
    case 'securityAlert':
      return { title: 'Security alert', body: summary ?? 'PawOS flagged a security event.', eventType: event.eventType };
    case 'organizationAlert':
      return { title: 'Organization alert', body: summary ?? 'There is an update in your organization.', eventType: event.eventType };
    case 'deploymentAlert':
      return { title: 'Deployment alert', body: summary ?? 'There is an update on a deployment.', eventType: event.eventType };
    case 'billingAlert':
      return { title: 'Billing alert', body: summary ?? 'There is a billing update on your account.', eventType: event.eventType };
    case 'connectorAlert':
      return { title: 'Connector alert', body: summary ?? 'One of your connected tools needs attention.', eventType: event.eventType };
    default:
      return { title: 'PawOS', body: 'You have a new update.', eventType: event.eventType };
  }
}

/**
 * Notification Runtime (MOB-7) — consumes the Cross Device Runtime's live
 * event stream (built in MOB-6) and turns qualifying events into real Web
 * Push notifications on every currently-paired, push-capable device. The
 * actual send happens in the main process (see PushNotificationService.ts);
 * this only decides *whether* and *to whom*, then hands off over IPC.
 */
export function startNotificationDispatcher(userId: string): () => void {
  return crossDeviceRuntimeClient.subscribeToEvents(userId, (event) => {
    if (!NOTIFIABLE_EVENT_TYPES.has(event.eventType)) return;
    void dispatch(event);
  });
}

async function dispatch(event: CrossDeviceEvent): Promise<void> {
  const devices = await trustedDeviceService.list().catch(() => []);
  const pushable = devices.filter((d) => d.status === 'active' && d.capabilities.pushNotifications);
  if (pushable.length === 0) return;

  const notification = formatNotification(event);
  const supabase = await getSupabaseClient();

  for (const device of pushable) {
    const { data, error } = await supabase
      .from('device_push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('device_id', device.id)
      .returns<{ id: string; endpoint: string; p256dh: string; auth_key: string }[]>();
    if (error || !data) continue;

    for (const row of data) {
      const result = await ipc.notificationsSendPush(
        { endpoint: row.endpoint, p256dh: row.p256dh, authKey: row.auth_key },
        notification
      );
      if (result.expired) {
        await supabase.from('device_push_subscriptions').delete().eq('id', row.id);
      }
    }
  }
}
