import { getSupabaseClient } from '../auth/supabaseClient';
import type { ReferralCreditBalance, ReferralCreditGrant, ReferralCreditSource } from '../../shared/billing/ReferralCreditTypes';

type BalanceRow = { user_id: string; balance_usd: number; updated_at: string };
type GrantRow = { id: string; user_id: string; amount_usd: number; source: ReferralCreditSource; source_ref: string | null; granted_at: string };

function toGrant(row: GrantRow): ReferralCreditGrant {
  return { id: row.id, userId: row.user_id, amountUsd: row.amount_usd, source: row.source, sourceRef: row.source_ref, grantedAt: row.granted_at };
}

/**
 * Renderer-side driver for Referral Credits — a read-only view from here.
 * The only writer is grant_referral_credits() (see
 * supabase/migrations/20260726030000_referral_credits.sql), called
 * server-side from report_referral_conversion(); no client code ever
 * grants or spends a Referral Credit directly.
 */
export const referralCreditService = {
  async getBalance(): Promise<ReferralCreditBalance> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return { userId: '', balanceUsd: 0, updatedAt: new Date(0).toISOString() };
    const { data, error } = await supabase
      .from('referral_credits')
      .select('user_id, balance_usd, updated_at')
      .eq('user_id', userId)
      .maybeSingle<BalanceRow>();
    if (error) throw error;
    return { userId, balanceUsd: data?.balance_usd ?? 0, updatedAt: data?.updated_at ?? new Date(0).toISOString() };
  },

  async listGrants(limit = 100): Promise<ReferralCreditGrant[]> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from('referral_credit_grants')
      .select('*')
      .eq('user_id', userId)
      .order('granted_at', { ascending: false })
      .limit(limit)
      .returns<GrantRow[]>();
    if (error) throw error;
    return (data ?? []).map(toGrant);
  },
};
