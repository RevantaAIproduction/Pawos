/**
 * IPC handler for workspace integrations (Mail, Slack, Drive, Calendar).
 * Manages connection state, tokens, and integration status.
 */

import type {
  IntegrationConnection,
  IntegrationConnectRequest,
  IntegrationConnectResult,
  IntegrationDisconnectResult,
  IntegrationListResult,
  IntegrationStatusInfo,
} from '../../../shared/workspace/IntegrationTypes';

// In-memory store for now; should be replaced with persistent SQLite storage
const integrationStore = new Map<string, Map<string, IntegrationConnection>>();

/**
 * Get all connections for a user
 */
export function getIntegrationConnections(userId: string): IntegrationListResult {
  try {
    const userConnections = integrationStore.get(userId) || new Map();
    return {
      ok: true,
      connections: Array.from(userConnections.values()),
    };
  } catch (error) {
    return {
      ok: false,
      connections: [],
    };
  }
}

/**
 * Connect a workspace service
 */
export function connectIntegration(userId: string, request: IntegrationConnectRequest): IntegrationConnectResult {
  try {
    const connection: IntegrationConnection = {
      id: `${request.service}-${Date.now()}`,
      userId,
      service: request.service,
      status: 'connected',
      accessToken: request.accessToken,
      refreshToken: request.refreshToken,
      email: request.email,
      expiresAt: request.expiresAt,
      connectedAt: Date.now(),
    };

    let userConnections = integrationStore.get(userId);
    if (!userConnections) {
      userConnections = new Map();
      integrationStore.set(userId, userConnections);
    }

    // Replace existing connection for this service
    const existingKey = Array.from(userConnections.entries()).find(
      ([, conn]) => conn.service === request.service
    )?.[0];
    if (existingKey) {
      userConnections.delete(existingKey);
    }

    userConnections.set(connection.id, connection);
    return { ok: true, connection };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to connect integration',
    };
  }
}

/**
 * Disconnect a workspace service
 */
export function disconnectIntegration(userId: string, service: string): IntegrationDisconnectResult {
  try {
    const userConnections = integrationStore.get(userId);
    if (!userConnections) {
      return { ok: false, reason: 'No connections found' };
    }

    for (const [key, conn] of userConnections.entries()) {
      if (conn.service === service) {
        userConnections.delete(key);
        return { ok: true };
      }
    }

    return { ok: false, reason: `Service ${service} not connected` };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to disconnect integration',
    };
  }
}

/**
 * Get connection status for all services
 */
export function getIntegrationStatus(userId: string): IntegrationStatusInfo[] {
  const connections = getIntegrationConnections(userId);
  if (!connections.ok) return [];

  const serviceDisplayNames: Record<string, string> = {
    gmail: 'Gmail',
    slack: 'Slack',
    googleDrive: 'Google Drive',
    googleCalendar: 'Google Calendar',
  };

  return connections.connections.map((conn: IntegrationConnection) => ({
    service: conn.service,
    status: conn.status,
    displayName: serviceDisplayNames[conn.service] || conn.service,
    email: conn.email,
    connectedAt: conn.connectedAt,
    error: conn.error,
  }));
}

/**
 * Refresh access token for a service
 */
export function refreshIntegrationToken(
  userId: string,
  service: string,
  newAccessToken: string,
  newRefreshToken?: string,
  expiresAt?: number
): IntegrationConnectResult {
  try {
    const userConnections = integrationStore.get(userId);
    if (!userConnections) {
      return {
        ok: false,
        reason: 'No connections found',
      };
    }

    for (const conn of userConnections.values()) {
      if (conn.service === service) {
        conn.accessToken = newAccessToken;
        if (newRefreshToken) conn.refreshToken = newRefreshToken;
        if (expiresAt) conn.expiresAt = expiresAt;
        conn.status = 'connected';
        conn.error = undefined;
        return { ok: true, connection: conn };
      }
    }

    return {
      ok: false,
      reason: `Service ${service} not connected`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to refresh token',
    };
  }
}

/**
 * Mark integration as errored
 */
export function markIntegrationError(userId: string, service: string, error: string): IntegrationConnectResult {
  try {
    const userConnections = integrationStore.get(userId);
    if (!userConnections) {
      return {
        ok: false,
        reason: 'No connections found',
      };
    }

    for (const conn of userConnections.values()) {
      if (conn.service === service) {
        conn.status = 'error';
        conn.error = error;
        return { ok: true, connection: conn };
      }
    }

    return {
      ok: false,
      reason: `Service ${service} not connected`,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to mark error',
    };
  }
}
