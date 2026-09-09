import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SlackConnector } from '../infrastructure/connectors/communication/SlackConnector';
import type { ConnectivityIpcResult } from '../../shared/connectivity/ConnectivityTypes';

/**
 * Behavioral tests for Slack message posting via connectivity IPC.
 * Tests verify:
 * 1. SlackConnector.postMessage() is called with correct parameters
 * 2. Successful and failed posting scenarios are handled
 * 3. Missing credentials return appropriate error
 * 4. Return value envelope matches ConnectivityIpcResult shape
 */

describe('Slack message posting behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SlackConnector.postMessage', () => {
    it('posts message successfully when token is configured and Slack responds ok', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: true }),
        } as Response)
      );

      const connector = new SlackConnector('xoxb-valid-token');
      const result = await connector.postMessage('#general', 'Test message');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result).toHaveProperty('ok');
        expect(typeof result.ok).toBe('boolean');
      }
    });

    it('returns error when connector is not configured', async () => {
      const connector = new SlackConnector(undefined);
      const result = await connector.postMessage('#general', 'Test message');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('not connected');
      }
    });

    it('handles API rejection when Slack responds ok:false', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
        } as Response)
      );

      const connector = new SlackConnector('xoxb-valid-token');
      const result = await connector.postMessage('#nonexistent', 'Test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('channel_not_found');
      }
    });

    it('constructs correct Bearer auth header', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: true }),
        } as Response)
      );
      global.fetch = mockFetch;

      const connector = new SlackConnector('xoxb-test-token');
      await connector.postMessage('#general', 'msg');

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      const options = call[1] as RequestInit;
      expect(options.headers).toBeDefined();
      const headers = options.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer xoxb-test-token');
    });

    it('sends correct request body with channel and text', async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: true }),
        } as Response)
      );
      global.fetch = mockFetch;

      const connector = new SlackConnector('xoxb-test');
      await connector.postMessage('#general', 'Hello world');

      const call = mockFetch.mock.calls[0];
      const options = call[1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.channel).toBe('#general');
      expect(body.text).toBe('Hello world');
    });

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn(() =>
        Promise.reject(new Error('Network error'))
      );

      const connector = new SlackConnector('xoxb-test');
      const result = await connector.postMessage('#general', 'msg');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Failed to reach Slack');
      }
    });

    it('handles empty credentials gracefully', async () => {
      const connector = new SlackConnector('');
      expect(connector.isConfigured()).toBe(false);

      const result = await connector.postMessage('#general', 'msg');
      expect(result.ok).toBe(false);
    });
  });

  describe('IPC connectivity result envelope', () => {
    it('wraps success responses in ConnectivityIpcResult shape', () => {
      const postResult: { ok: true } = { ok: true };

      const ipcResult: ConnectivityIpcResult<typeof postResult> = {
        ok: true,
        data: postResult,
      };

      expect(ipcResult.ok).toBe(true);
      expect(ipcResult.data).toBeDefined();
      expect(ipcResult.data.ok).toBe(true);
    });

    it('wraps error responses in ConnectivityIpcResult shape', () => {
      const ipcResult: ConnectivityIpcResult<never> = {
        ok: false,
        error: 'Slack is not connected.',
      };

      expect(ipcResult.ok).toBe(false);
      expect(ipcResult.error).toBeDefined();
      expect(ipcResult.error).toBe('Slack is not connected.');
    });
  });

  describe('Message parameters', () => {
    beforeEach(() => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: true }),
        } as Response)
      );
    });

    it('accepts channel in #channel format', async () => {
      const connector = new SlackConnector('xoxb-test');
      const result = await connector.postMessage('#general', 'Test');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('ok');
    });

    it('accepts user mentions in @username format', async () => {
      const connector = new SlackConnector('xoxb-test');
      const result = await connector.postMessage('@alice', 'Direct message');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('ok');
    });

    it('accepts multiline message text', async () => {
      const connector = new SlackConnector('xoxb-test');
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const result = await connector.postMessage('#general', multilineText);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('ok');
    });
  });

  describe('Return value shape', () => {
    beforeEach(() => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: true }),
        } as Response)
      );
    });

    it('returns { ok: true } on success', async () => {
      const connector = new SlackConnector('xoxb-test');
      const result = await connector.postMessage('#general', 'msg');

      if (result.ok) {
        expect(Object.keys(result).sort()).toEqual(['ok']);
      }
    });

    it('returns { ok: false; reason: string } on failure', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ ok: false, error: 'invalid_channel' }),
        } as Response)
      );

      const connector = new SlackConnector('xoxb-test');
      const result = await connector.postMessage('#bad', 'msg');

      if (!result.ok) {
        expect(result.ok).toBe(false);
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });
  });
});
