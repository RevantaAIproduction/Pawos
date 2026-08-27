/**
 * Jira-specific credential metadata store.
 * Stores cloudId and siteUrl derived from OAuth accessible-resources.
 * Keyed by scope to support both user and org-level Jira connections.
 */

import type { ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';

export interface JiraMetadata {
  cloudId: string;
  siteUrl: string;
  siteName: string;
  storedAt: number;
}

function metadataKey(scope: ConnectivityScope): string {
  return `${scope.userId}:${scope.organizationId ?? ''}`;
}

class JiraMetadataStore {
  private metadata = new Map<string, JiraMetadata>();

  async store(scope: ConnectivityScope, data: JiraMetadata): Promise<void> {
    this.metadata.set(metadataKey(scope), {
      ...data,
      storedAt: Date.now(),
    });
  }

  async read(scope: ConnectivityScope): Promise<JiraMetadata | undefined> {
    return this.metadata.get(metadataKey(scope));
  }

  async clear(scope: ConnectivityScope): Promise<void> {
    this.metadata.delete(metadataKey(scope));
  }
}

export const jiraMetadataStore = new JiraMetadataStore();
