import { getSupabaseClient } from '../auth/supabaseClient';

/**
 * Team / Enterprise: an organization admin buys Paw Compute (the usual purchase) and gives some of
 * it to a member. The database does the move and every check (supabase migration
 * 20261005010000_org_give_paw_compute.sql): only owners and billing administrators can give, only
 * to active members of their organization, and only Paw Compute they actually bought.
 */

export type PawComputeGift = {
  id: string;
  organizationId: string;
  givenBy: string;
  givenTo: string;
  pc: number;
  note: string | null;
  createdAt: string;
};

type GiftRow = { id: string; organization_id: string; given_by: string; given_to: string; pc: number; note: string | null; created_at: string };

const toGift = (row: GiftRow): PawComputeGift => ({
  id: row.id,
  organizationId: row.organization_id,
  givenBy: row.given_by,
  givenTo: row.given_to,
  pc: row.pc,
  note: row.note,
  createdAt: row.created_at,
});

/** The signed-in admin's purchased Paw Compute that can still be given. */
export async function getGivablePawCompute(): Promise<number> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('get_my_givable_paw_compute');
  if (error) throw new Error('Your Paw Compute balance couldn’t be loaded.');
  return typeof data === 'number' ? data : 0;
}

export async function givePawCompute(organizationId: string, memberUserId: string, pc: number, note?: string): Promise<{ givableLeft: number }> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('give_paw_compute', {
    p_organization_id: organizationId,
    p_member_user_id: memberUserId,
    p_pc: pc,
    p_note: note?.trim() || null,
  });
  // The database's messages are written for people ("You have 1,500 Paw Compute left to give…").
  if (error) throw new Error(error.message || 'Paw Compute couldn’t be given. Please try again.');
  const result = (data ?? {}) as { givable_left?: number };
  return { givableLeft: typeof result.givable_left === 'number' ? result.givable_left : 0 };
}

/** Gifts the signed-in person can see: all of the organization's (admins) or their own. Newest first. */
export async function listPawComputeGifts(organizationId: string): Promise<PawComputeGift[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('organization_paw_compute_gifts')
    .select('id, organization_id, given_by, given_to, pc, note, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error('The history couldn’t be loaded.');
  return ((data ?? []) as GiftRow[]).map(toGift);
}
