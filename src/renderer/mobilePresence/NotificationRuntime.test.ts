import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/supabaseClient', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('../services/ipc/ipcBridgeImplementation', () => ({ ipc: {} }));

import { formatNotification } from './NotificationRuntime';
import type { CrossDeviceEvent } from '../../shared/mobilePresence/MobilePresenceTypes';

function makeEvent(eventType: CrossDeviceEvent['eventType'], payload: Record<string, unknown> = {}): CrossDeviceEvent {
  return {
    id: 'event-1',
    userId: 'user-1',
    organizationId: null,
    eventType,
    sourceRuntime: 'test',
    payload,
    createdAt: '2026-01-01T00:00:00Z',
    deliveredAt: null,
  };
}

describe('formatNotification', () => {
  it('uses the real summary from the event payload when present', () => {
    const result = formatNotification(makeEvent('taskCompleted', { summary: 'Deployed the app to staging.' }));
    expect(result).toEqual({ title: 'Task completed', body: 'Deployed the app to staging.', eventType: 'taskCompleted' });
  });

  it('falls back to an honest generic body when no summary is present, never fabricating detail', () => {
    const result = formatNotification(makeEvent('taskCompleted', {}));
    expect(result.body).toBe('A task finished on your desktop.');
  });

  it('incorporates a real name/title field for meeting reminders', () => {
    const result = formatNotification(makeEvent('meetingReminder', { name: 'Standup' }));
    expect(result.body).toBe('Standup is starting soon.');
  });

  it('produces a distinct, correctly-labeled notification for every notifiable event type', () => {
    const types: CrossDeviceEvent['eventType'][] = [
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
    ];
    const titles = types.map((t) => formatNotification(makeEvent(t)).title);
    expect(new Set(titles).size).toBe(types.length);
  });

  it('falls back to a generic-but-honest notification for an event type it does not recognize as notifiable', () => {
    const result = formatNotification(makeEvent('presenceUpdate'));
    expect(result).toEqual({ title: 'PawOS', body: 'You have a new update.', eventType: 'presenceUpdate' });
  });
});
