import { getSupabaseClient } from '../auth/supabaseClient';
import type { Referral, ReferralReward, ReferralStatus } from '../../shared/referral/ReferralTypes';

type ReferralRow = {
  id: string; referrer_user_id: string; referred_user_id: string; referral_code: string;
  status: ReferralStatus; subscribed_tier: string | null; created_at: string; subscribed_at: string | null;
};

type RewardRow = {
  id: string; referrer_user_id: string; milestone_index: number; credits_granted: number;
  amount_usd: number; granted_at: string;
};

function toReferral(row: ReferralRow): Referral {
  return {
    id: row.id, referrerUserId: row.referrer_user_id, referredUserId: row.referred_user_id,
    referralCode: row.referral_code, status: row.status, subscribedTier: row.subscribed_tier,
    createdAt: row.created_at, subscribedAt: row.subscribed_at,
  };
}

function toReward(row: RewardRow): ReferralReward {
  return {
    id: row.id, referrerUserId: row.referrer_user_id, milestoneIndex: row.milestone_index,
    creditsGranted: row.credits_granted, amountUsd: row.amount_usd, grantedAt: row.granted_at,
  };
}

/**
 * Renderer-side driver for the referral engine — direct-Supabase pattern
 * matching every other org/billing service. Referral conversion and reward
 * granting both happen server-side in security-definer RPCs (see
 * supabase/migrations/20260724010000_referral_engine.sql); this class only
 * ever reports and reads, never computes a reward itself.
 */
export const referralService = {
  /** Returns the caller's own shareable code, generating one on first call. */
  async getOrCreateCode(): Promise<string> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('get_or_create_referral_code');
    if (error) throw error;
    return data as string;
  },

  /** One-time per account — the RPC raises if this account already has a referral applied. */
  async applyCode(code: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('apply_referral_code', { p_code: code });
    if (error) throw error;
  },

  /**
   * Reported by the referred user's own client right after their own
   * subscription purchase is confirmed locally — safe to call unconditionally
   * on every subscription change (no-op unless the caller has a pending
   * referral and the tier is Pro/Pro Max). See SubscriptionSection.tsx.
   */
  async reportConversion(tier: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('report_referral_conversion', { p_tier: tier });
    if (error) throw error;
  },

  /** Whether the calling account already has a referral applied to it (used to hide the "enter a code" input once used). */
  async hasAppliedCode(): Promise<boolean> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return false;
    const { data, error } = await supabase
      .from('referrals')
      .select('id')
      .eq('referred_user_id', userId)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return data !== null;
  },

  async listMyReferrals(): Promise<Referral[]> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_user_id', userId)
      .order('created_at', { ascending: false })
      .returns<ReferralRow[]>();
    if (error) throw error;
    return (data ?? []).map(toReferral);
  },

  async listMyRewards(): Promise<ReferralReward[]> {
    const supabase = await getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];
    const { data, error } = await supabase
      .from('referral_rewards')
      .select('*')
      .eq('referrer_user_id', userId)
      .order('granted_at', { ascending: false })
      .returns<RewardRow[]>();
    if (error) throw error;
    return (data ?? []).map(toReward);
  },
};
