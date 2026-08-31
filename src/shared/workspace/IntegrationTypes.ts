/**
 * Shared types for workspace integrations.
 * Defines Mail, Slack, Drive, Calendar integration connection and status.
 */

export type IntegrationServiceType = 'gmail' | 'slack' | 'googleDrive' | 'googleCalendar';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

export interface IntegrationConnection {
  id: string;
  userId: string;
  service: IntegrationServiceType;
  status: IntegrationStatus;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  connectedAt: number;
  disconnectedAt?: number;
  error?: string;
}

export interface IntegrationStatusInfo {
  service: IntegrationServiceType;
  status: IntegrationStatus;
  displayName: string;
  email?: string;
  connectedAt?: number;
  error?: string;
}

export interface IntegrationConnectRequest {
  service: IntegrationServiceType;
  accessToken: string;
  refreshToken?: string;
  email?: string;
  expiresAt?: number;
}

export interface IntegrationConnectResult {
  ok: boolean;
  reason?: string;
  connection?: IntegrationConnection;
}

export interface IntegrationListResult {
  ok: boolean;
  connections: IntegrationConnection[];
}

export interface IntegrationDisconnectResult {
  ok: boolean;
  reason?: string;
}
