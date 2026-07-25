import { getSupabaseClient } from '../auth/supabaseClient';
import type { ConnectivityScope, DeploymentProfile, DeploymentProfileConfig } from '../../shared/connectivity/ConnectivityTypes';

type DeploymentProfileRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  config: DeploymentProfileConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

function toProfile(row: DeploymentProfileRow): DeploymentProfile {
  return {
    id: row.id,
    scope: { userId: row.user_id, organizationId: row.organization_id ?? undefined },
    name: row.name,
    config: row.config,
    isDefault: row.is_default,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

/**
 * Section 17's persistence layer for `DeploymentProfileManager` (main
 * process, still entirely in-memory). Pure metadata — no secret lives in
 * this table (an SSH profile's `credentialRef` points at a
 * `connectivity_credentials` row instead) — so plain direct-Supabase CRUD
 * is enough, no RPC needed, matching this table's own RLS-only design.
 *
 * The DB row's `id` is authoritative across restarts; on hydration the
 * main-process `DeploymentProfileManager` must be seeded with this SAME
 * id (via the additive `hydrateProfile()` method — its own
 * `createProfile()` always mints a fresh id, which would silently orphan
 * this row's id on every relaunch otherwise).
 */
export const deploymentProfileService = {
  async list(scope: ConnectivityScope): Promise<DeploymentProfile[]> {
    const supabase = await getSupabaseClient();
    let query = supabase.from('deployment_profiles').select('*').eq('user_id', scope.userId);
    query = scope.organizationId ? query.eq('organization_id', scope.organizationId) : query.is('organization_id', null);
    const { data, error } = await query.returns<DeploymentProfileRow[]>();
    if (error) throw error;
    return (data ?? []).map(toProfile);
  },

  async create(scope: ConnectivityScope, name: string, config: DeploymentProfileConfig, isDefault = false): Promise<DeploymentProfile> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('deployment_profiles')
      .insert({ user_id: scope.userId, organization_id: scope.organizationId ?? null, name, config, is_default: isDefault })
      .select('*')
      .single<DeploymentProfileRow>();
    if (error) throw error;
    return toProfile(data);
  },

  async update(profileId: string, patch: Partial<Pick<DeploymentProfile, 'name' | 'config' | 'isDefault'>>): Promise<DeploymentProfile> {
    const supabase = await getSupabaseClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.config !== undefined) row.config = patch.config;
    if (patch.isDefault !== undefined) row.is_default = patch.isDefault;
    const { data, error } = await supabase.from('deployment_profiles').update(row).eq('id', profileId).select('*').single<DeploymentProfileRow>();
    if (error) throw error;
    return toProfile(data);
  },

  async remove(profileId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('deployment_profiles').delete().eq('id', profileId);
    if (error) throw error;
  },
};
