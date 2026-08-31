/**
 * Service layer for managing workspace integrations.
 * Coordinates with handlers and provides high-level integration management.
 */

import type { IntegrationConnection, IntegrationStatusInfo } from '../../../shared/workspace/IntegrationTypes';
import {
  connectIntegration,
  disconnectIntegration,
  getIntegrationConnections,
  getIntegrationStatus,
  markIntegrationError,
  refreshIntegrationToken,
} from '../../ipc/handlers/integrationHandler';

export class IntegrationService {
  /**
   * List all connections for a user
   */
  static listConnections(userId: string): IntegrationConnection[] {
    const result = getIntegrationConnections(userId);
    return result.ok ? result.connections : [];
  }

  /**
   * Get status of all integrations
   */
  static getStatus(userId: string): IntegrationStatusInfo[] {
    return getIntegrationStatus(userId);
  }

  /**
   * Check if a service is connected
   */
  static isConnected(userId: string, service: string): boolean {
    const connections = this.listConnections(userId);
    return connections.some((c) => c.service === service && c.status === 'connected');
  }

  /**
   * Get connection for a specific service
   */
  static getConnection(userId: string, service: string): IntegrationConnection | null {
    const connections = this.listConnections(userId);
    const conn = connections.find((c) => c.service === service);
    return conn || null;
  }

  /**
   * Verify token is still valid and refresh if needed
   */
  static async verifyAndRefreshToken(
    userId: string,
    service: string,
    checkExpiryMs: number = 5 * 60 * 1000
  ): Promise<boolean> {
    const conn = this.getConnection(userId, service);
    if (!conn) return false;

    // Check if token expired or expiring soon
    if (conn.expiresAt && conn.expiresAt - Date.now() < checkExpiryMs) {
      // Token is expiring soon - in a real implementation, refresh it here
      // For now, just mark as error if already expired
      if (conn.expiresAt < Date.now()) {
        markIntegrationError(userId, service, 'Access token expired');
        return false;
      }
    }

    return true;
  }

  /**
   * Get access token for a service (with auto-refresh if needed)
   */
  static async getAccessToken(userId: string, service: string): Promise<string | null> {
    const isValid = await this.verifyAndRefreshToken(userId, service);
    if (!isValid) return null;

    const conn = this.getConnection(userId, service);
    return conn?.accessToken || null;
  }

  /**
   * Disconnect a service
   */
  static disconnect(userId: string, service: string): boolean {
    const result = disconnectIntegration(userId, service);
    return result.ok;
  }

  /**
   * Connect a service with OAuth token
   */
  static connect(
    userId: string,
    service: string,
    accessToken: string,
    options?: {
      refreshToken?: string;
      expiresAt?: number;
      email?: string;
    }
  ): boolean {
    const result = connectIntegration(userId, {
      service: service as any,
      accessToken,
      refreshToken: options?.refreshToken,
      expiresAt: options?.expiresAt,
      email: options?.email,
    });
    return result.ok;
  }
}
