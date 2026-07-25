import { randomUUID } from 'crypto';
import type { ConnectivityScope, DeploymentProfile, DeploymentProfileConfig } from '../../shared/connectivity/ConnectivityTypes';

function scopeKey(scope: ConnectivityScope): string {
  return `${scope.userId}:${scope.organizationId ?? ''}`;
}

/**
 * Profiles are pure description — "here is a deployment target and how to
 * reach it" — never execution. `DeploymentProfileConfig` (declared in
 * Section 1's shared types) already covers both deployment-target shapes
 * the architecture defines — `managedPlatform` (deploy via a connector's own
 * API/CLI) and `ssh` (a generic server with no shared platform API) — and
 * this class only ever stores/validates that union's shape; it never
 * branches on `config.kind` to do anything beyond that, never shells out,
 * and never calls a provider API. Wiring a saved profile into an actual
 * deploy call is explicitly deferred to when a real hosting connector or
 * the Generic SSH connector exists.
 *
 * Storage note (the same deliberate scope boundary as every other manager
 * in this runtime — ConnectionManager, CredentialVaultBridge): backed by an
 * in-memory Map today, standing in for the `deployment_profiles` Supabase
 * table until Section 17's migration lands. The public API below is
 * already final; only the internals of these five methods change then.
 */
class DeploymentProfileManager {
  private profiles = new Map<string, DeploymentProfile>();

  async createProfile(scope: ConnectivityScope, name: string, config: DeploymentProfileConfig, opts?: { isDefault?: boolean }): Promise<DeploymentProfile> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Deployment profile name must not be empty.');
    }
    if (this.findByName(scope, trimmedName)) {
      throw new Error(`A deployment profile named '${trimmedName}' already exists for this scope.`);
    }

    const now = Date.now();
    const profile: DeploymentProfile = {
      id: randomUUID(),
      scope,
      name: trimmedName,
      config,
      isDefault: Boolean(opts?.isDefault),
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.set(profile.id, profile);
    return profile;
  }

  async getProfile(profileId: string): Promise<DeploymentProfile | undefined> {
    return this.profiles.get(profileId);
  }

  async listProfiles(scope: ConnectivityScope): Promise<DeploymentProfile[]> {
    const key = scopeKey(scope);
    return [...this.profiles.values()].filter((p) => scopeKey(p.scope) === key);
  }

  async updateProfile(profileId: string, patch: Partial<Pick<DeploymentProfile, 'name' | 'config' | 'isDefault'>>): Promise<DeploymentProfile> {
    const existing = this.profiles.get(profileId);
    if (!existing) {
      throw new Error(`Cannot update — no deployment profile found with id '${profileId}'.`);
    }

    let name = existing.name;
    if (patch.name !== undefined) {
      const trimmedName = patch.name.trim();
      if (!trimmedName) {
        throw new Error('Deployment profile name must not be empty.');
      }
      const collision = this.findByName(existing.scope, trimmedName);
      if (collision && collision.id !== profileId) {
        throw new Error(`A deployment profile named '${trimmedName}' already exists for this scope.`);
      }
      name = trimmedName;
    }

    const updated: DeploymentProfile = {
      ...existing,
      name,
      config: patch.config ?? existing.config,
      isDefault: patch.isDefault ?? existing.isDefault,
      updatedAt: Date.now(),
    };
    this.profiles.set(profileId, updated);
    return updated;
  }

  async deleteProfile(profileId: string): Promise<void> {
    this.profiles.delete(profileId);
  }

  /**
   * Section 17 addition: seeds the in-memory cache from a profile already
   * persisted in Supabase (via the renderer's DeploymentProfileService),
   * preserving its existing `id` — `createProfile()` always mints a fresh
   * one, which would silently orphan the persisted row's id on every
   * relaunch if reused for hydration. Deliberately does not enforce the
   * name-uniqueness check `createProfile()` does: hydration is
   * reconstructing already-validated state (the row already passed that
   * check when it was first created), not creating something new, so a
   * collision here just means the same profile is being re-hydrated —
   * overwrite, don't throw.
   */
  async hydrateProfile(profile: DeploymentProfile): Promise<void> {
    this.profiles.set(profile.id, profile);
  }

  private findByName(scope: ConnectivityScope, name: string): DeploymentProfile | undefined {
    const key = scopeKey(scope);
    return [...this.profiles.values()].find((p) => scopeKey(p.scope) === key && p.name === name);
  }
}

export const deploymentProfileManager = new DeploymentProfileManager();
