import { getSupabaseClient } from '../auth/supabaseClient';

export interface UsageCreditsBalance {
  balanceUsd: number;
  updatedAt: string;
}

export const usageCreditsService = {
  async getBalance(): Promise<UsageCreditsBalance> {
    try {
      const supabase = await getSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');

      const { data, error } = await supabase
        .from('user_usage_credits')
        .select('balance_usd, updated_at')
        .eq('user_id', userId)
        .maybeSingle<{ balance_usd: number; updated_at: string }>();

      if (error) throw error;

      return {
        balanceUsd: data?.balance_usd ?? 0,
        updatedAt: data?.updated_at ?? new Date(0).toISOString(),
      };
    } catch (error) {
      console.error('Failed to fetch usage credits balance:', error);
      return { balanceUsd: 0, updatedAt: new Date().toISOString() };
    }
  },
};
