import { randomUUID } from 'crypto';
import { connectorRegistry } from './ConnectorRegistry';
import { connectivityEventBus } from './EventBus';
import type { NormalizedConnectivityEvent } from '../../shared/connectivity/ConnectivityTypes';

export const CONNECTIVITY_PUBLIC_BASE_URL_ENV_VAR = 'CONNECTIVITY_PUBLIC_BASE_URL';

export interface WebhookEventRecord {
  id: string;
  connectorId: string;
  rawPayload: string;
  /** The framework-defined "connector not registered" behavior lives here,
   *  not as a thrown error — an unrecognized connector id still gets its
   *  raw payload recorded (audited) for later inspection, exactly like a
   *  registered one; this flag is the only difference, mirroring the clean
   *  501 the eventual pawos-web webhook route returns for the same case. */
  connectorRegistered: boolean;
  /** Always false here — signature verification needs a specific
   *  provider's algorithm/secret and is explicitly left to that
   *  connector's own webhook handling, never performed in this class. */
  verified: boolean;
  /** Always false here — turning a raw payload into something
   *  event-bus-ready requires knowing that provider's payload shape,
   *  which is provider-specific parsing this class never does. */
  processed: boolean;
  receivedAt: number;
}

export type WebhookLogOutcome = 'recorded' | 'connectorNotRegistered' | 'dispatched';

export interface WebhookLogRecord {
  id: string;
  connectorId: string;
  outcome: WebhookLogOutcome;
  detail?: string;
  occurredAt: number;
}

/**
 * Generic webhook plumbing shared by every connector — none of it knows a
 * specific provider's payload shape, signature scheme, or event names.
 * Every connector gets the exact same URL pattern, the exact same
 * record-then-log flow, and the exact same Event Bus hookup; the only
 * provider-specific work (verifying a signature, parsing a payload into a
 * `NormalizedConnectivityEvent`) is explicitly left to that connector's own
 * future webhook handler, which calls `dispatchToEventBus()` only after it
 * has done that work itself.
 */
class WebhookManager {
  private events: WebhookEventRecord[] = [];
  private logs: WebhookLogRecord[] = [];

  /** Pure URL construction from a configurable base — never a hardcoded
   *  domain, so the same runtime works unchanged across local dev, staging,
   *  self-hosted installs, and production. */
  getWebhookUrl(connectorId: string): string {
    const base = process.env[CONNECTIVITY_PUBLIC_BASE_URL_ENV_VAR];
    if (!base) {
      throw new Error(`Missing environment variable '${CONNECTIVITY_PUBLIC_BASE_URL_ENV_VAR}' required to generate a webhook URL.`);
    }
    return `${base.replace(/\/+$/, '')}/api/connectivity/webhooks/${connectorId}`;
  }

  /** Whether the Connections UI should let "Connect" register the webhook
   *  automatically, or must instead show the URL from `getWebhookUrl()`
   *  with manual setup instructions — read straight from the connector's
   *  own declaration, never guessed. */
  getWebhookRegistrationMode(connectorId: string): 'automatic' | 'manual' | undefined {
    return connectorRegistry.get(connectorId)?.definition.webhookRegistration;
  }

  /** Records the raw payload first, before anything else happens to it —
   *  true whether or not the connector is registered. Never parses
   *  `rawPayload`; that's provider-specific and stays out of this class. */
  recordWebhookEvent(connectorId: string, rawPayload: string): WebhookEventRecord {
    const connectorRegistered = Boolean(connectorRegistry.get(connectorId));
    const record: WebhookEventRecord = {
      id: randomUUID(),
      connectorId,
      rawPayload,
      connectorRegistered,
      verified: false,
      processed: false,
      receivedAt: Date.now(),
    };
    this.events.push(record);
    return record;
  }

  recordWebhookLog(connectorId: string, outcome: WebhookLogOutcome, detail?: string): WebhookLogRecord {
    const record: WebhookLogRecord = { id: randomUUID(), connectorId, outcome, detail, occurredAt: Date.now() };
    this.logs.push(record);
    return record;
  }

  /** Pure passthrough to the shared Event Bus — publishing an
   *  already-normalized event is a separate, later step from recording the
   *  raw delivery above. Nothing in this class turns one into the other. */
  dispatchToEventBus(event: NormalizedConnectivityEvent): void {
    connectivityEventBus.publish(event);
  }

  listEvents(connectorId?: string): WebhookEventRecord[] {
    return connectorId ? this.events.filter((e) => e.connectorId === connectorId) : [...this.events];
  }

  listLogs(connectorId?: string): WebhookLogRecord[] {
    return connectorId ? this.logs.filter((l) => l.connectorId === connectorId) : [...this.logs];
  }
}

export const webhookManager = new WebhookManager();
