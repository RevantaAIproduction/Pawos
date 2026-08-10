import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { setVapidDetailsMock, sendNotificationMock } = vi.hoisted(() => ({
  setVapidDetailsMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe('pushNotificationService', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    setVapidDetailsMock.mockReset();
    sendNotificationMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('reports unconfigured and never calls sendNotification when VAPID keys are absent', async () => {
    const { pushNotificationService } = await import('./PushNotificationService');

    expect(pushNotificationService.isConfigured()).toBe(false);

    const result = await pushNotificationService.send({ endpoint: 'https://push.example/x', p256dh: 'p', authKey: 'a' }, { title: 't', body: 'b' });

    expect(result).toEqual({ delivered: false, expired: false, error: expect.stringContaining('not configured') });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('sends a real notification once VAPID keys are configured', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    sendNotificationMock.mockResolvedValueOnce(undefined);
    const { pushNotificationService } = await import('./PushNotificationService');

    const result = await pushNotificationService.send(
      { endpoint: 'https://push.example/x', p256dh: 'p', authKey: 'a' },
      { title: 'Task completed', body: 'done' }
    );

    expect(setVapidDetailsMock).toHaveBeenCalledWith('mailto:support@pawos.app', 'pub', 'priv');
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify({ title: 'Task completed', body: 'done' })
    );
    expect(result).toEqual({ delivered: true, expired: false });
  });

  it('reports expired: true when the push service returns 410 Gone, so the caller knows to delete the subscription', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const { pushNotificationService } = await import('./PushNotificationService');

    const result = await pushNotificationService.send({ endpoint: 'https://push.example/x', p256dh: 'p', authKey: 'a' }, { title: 't', body: 'b' });

    expect(result.delivered).toBe(false);
    expect(result.expired).toBe(true);
  });

  it('reports expired: false for a transient failure (e.g. 500), so the caller keeps the subscription', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error('Server error'), { statusCode: 500 }));
    const { pushNotificationService } = await import('./PushNotificationService');

    const result = await pushNotificationService.send({ endpoint: 'https://push.example/x', p256dh: 'p', authKey: 'a' }, { title: 't', body: 'b' });

    expect(result.delivered).toBe(false);
    expect(result.expired).toBe(false);
  });
});
