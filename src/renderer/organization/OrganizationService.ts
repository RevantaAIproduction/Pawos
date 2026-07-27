import { getSupabaseClient } from '../auth/supabaseClient';
import { isPersonalEmailDomain } from '../../shared/organization/PersonalEmailDomains';
import type { OrganizationRecord, OrganizationMember, OrgTier, OrgRole } from '../../shared/organization/OrganizationTypes';
import type { SeatTier } from '../../shared/billing/BillingTypes';
import type { OrgJobRole, OrgJobRoleDepartment } from '../../shared/organization/OrgJobRoles';

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  tier: OrgTier;
  owner_user_id: string;
  created_at: string;
  domain: string;
};

type MemberRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  role: OrgRole;
  status: 'invited' | 'active' | 'removed';
  invited_at: string;
  joined_at: string | null;
  seat_tier: SeatTier | null;
  job_role_ref: string | null;
};

type OrgJobRoleRow = {
  id: string;
  organization_id: string;
  name: string;
  department: OrgJobRoleDepartment | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toJobRole(row: OrgJobRoleRow): OrgJobRole {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    department: row.department,
    archived: row.archived,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toOrg(row: OrgRow): OrganizationRecord {
  return { id: row.id, slug: row.slug, name: row.name, tier: row.tier, ownerUserId: row.owner_user_id, createdAt: row.created_at, domain: row.domain };
}

function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function toMember(row: MemberRow): OrganizationMember {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    seatTier: row.seat_tier,
    jobRoleRef: row.job_role_ref,
  };
}

/**
 * Queries/mutates Supabase directly from the renderer, following the exact
 * pattern EmailAuthProvider.ts already uses (getSupabaseClient()) — no new
 * main-process IPC needed since this is inherently cloud-backed, like auth.
 */
export type PendingInvite = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
};

type PendingInviteRow = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  role: OrgRole;
};

export const organizationService = {
  async listMyPendingInvites(): Promise<PendingInvite[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('list_my_pending_invites');
    if (error) throw error;
    return ((data as PendingInviteRow[]) ?? []).map((r) => ({
      organizationId: r.organization_id,
      organizationName: r.organization_name,
      organizationSlug: r.organization_slug,
      role: r.role,
    }));
  },

  async acceptInvite(organizationId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('accept_organization_invite', { p_organization_id: organizationId });
    if (error) throw error;
  },

  async getMyOrganizations(): Promise<OrganizationRecord[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from('organizations').select('*').returns<OrgRow[]>();
    if (error) throw error;
    return (data ?? []).map(toOrg);
  },

  async createOrganization(name: string, tier: OrgTier): Promise<OrganizationRecord> {
    const supabase = await getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error(
        'Your account isn’t linked to a cloud session yet, so organizations can’t recognize it. ' +
          'Try signing out and back in — if you’re signed in with Google, this can happen if the ' +
          'Google sign-in couldn’t be linked to a cloud session.'
      );
    }
    const domain = emailDomain(userData.user.email ?? '');
    if (!domain) throw new Error('Your account needs a real email address to create an organization.');
    if (isPersonalEmailDomain(domain)) {
      throw new Error(
        'Team and Enterprise are designed for organizations. Use your company email address to create or ' +
          'join an organization — personal email providers (like Gmail, Outlook, Yahoo, etc.) aren’t ' +
          'supported for organization workspaces.'
      );
    }

    const { data: slugData, error: slugError } = await supabase.rpc('generate_org_slug', { org_name: name });
    if (slugError) throw slugError;

    const { data, error } = await supabase
      .from('organizations')
      .insert({ name, tier, slug: slugData as string, owner_user_id: userData.user.id, domain })
      .select('*')
      .single<OrgRow>();
    if (error) throw error;
    return toOrg(data);
  },

  async getMembers(organizationId: string): Promise<OrganizationMember[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId)
      .returns<MemberRow[]>();
    if (error) throw error;
    return (data ?? []).map(toMember);
  },

  /** `seatTier` only makes sense for a 'team' org invite — pass undefined/omit for Enterprise (uniform seats). */
  async inviteMember(organizationId: string, email: string, role: OrgRole, seatTier?: SeatTier): Promise<OrganizationMember> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('organization_members')
      .insert({ organization_id: organizationId, email, role, status: 'invited', seat_tier: seatTier ?? null })
      .select('*')
      .single<MemberRow>();
    if (error) throw error;
    return toMember(data);
  },

  async updateMemberRole(memberId: string, role: OrgRole): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_members').update({ role }).eq('id', memberId);
    if (error) throw error;
  },

  /** Support-only path — no UI calls this. Seat type is locked once a member is invited; changing
   *  it happens at renewal or through support, never as a self-serve toggle in Organization
   *  settings (see OrganizationSection.tsx's static seat badge). Kept here so that path has
   *  somewhere real to call, not a dead capability. */
  async updateMemberSeatTier(memberId: string, seatTier: SeatTier): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_members').update({ seat_tier: seatTier }).eq('id', memberId);
    if (error) throw error;
  },

  /** Reassigns an unclaimed pending seat (status still 'invited', user_id still null) to a
   *  different email — e.g. the assigned person left before ever signing in. Only meaningful while
   *  unclaimed; RLS (org_members_* policies) still governs who may call this. */
  async reassignPendingMemberEmail(memberId: string, newEmail: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('organization_members')
      .update({ email: newEmail })
      .eq('id', memberId)
      .eq('status', 'invited');
    if (error) throw error;
  },

  async removeMember(memberId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_members').update({ status: 'removed' }).eq('id', memberId);
    if (error) throw error;
  },

  /** Assigns/clears a member's Organization Role. `jobRoleRef` is the opaque
   *  `builtin:<key>` / `custom:<uuid>` ref from OrgJobRoles.ts, or null to
   *  clear it. Completely independent of role/seatTier — no other column
   *  is touched. */
  async assignMemberJobRole(memberId: string, jobRoleRef: string | null): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_members').update({ job_role_ref: jobRoleRef }).eq('id', memberId);
    if (error) throw error;
  },

  async listCustomJobRoles(organizationId: string): Promise<OrgJobRole[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('org_job_roles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })
      .returns<OrgJobRoleRow[]>();
    if (error) throw error;
    return (data ?? []).map(toJobRole);
  },

  /** RLS rejects this unless the caller holds `org_roles.manage` (or is the org owner). */
  async createCustomJobRole(organizationId: string, name: string, department: OrgJobRoleDepartment | null): Promise<OrgJobRole> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('org_job_roles')
      .insert({ organization_id: organizationId, name, department, created_by: userData.user?.id ?? null })
      .select('*')
      .single<OrgJobRoleRow>();
    if (error) throw error;
    return toJobRole(data);
  },

  async renameCustomJobRole(id: string, name: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('org_job_roles')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async setCustomJobRoleArchived(id: string, archived: boolean): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('org_job_roles')
      .update({ archived, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },
};
