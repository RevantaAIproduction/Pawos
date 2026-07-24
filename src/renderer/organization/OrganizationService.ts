import { getSupabaseClient } from '../auth/supabaseClient';
import { isPersonalEmailDomain } from '../../shared/organization/PersonalEmailDomains';
import type { OrganizationRecord, OrganizationMember, OrgTier, OrgRole } from '../../shared/organization/OrganizationTypes';
import type { SeatTier } from '../../shared/billing/BillingTypes';

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
};

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

  /** Team org only — reassigns a member between the Standard/Premium seat rate. */
  async updateMemberSeatTier(memberId: string, seatTier: SeatTier): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_members').update({ seat_tier: seatTier }).eq('id', memberId);
    if (error) throw error;
  },

  async removeMember(memberId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('organization_members').update({ status: 'removed' }).eq('id', memberId);
    if (error) throw error;
  },
};
