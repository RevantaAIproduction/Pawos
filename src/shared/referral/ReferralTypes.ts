/**
 * Referral engine — a real, shareable per-user code; a referral only counts
 * once the referred account genuinely subscribes to Pro or Pro Max, and
 * every 5 converted referrals grants the referrer $70 (14 credits at the
 * real $5/credit rate) of bonus prepaid Autonomous Engineering Task
 * credits — see supabase/migrations/20260724010000_referral_engine.sql for
 * why task credits are the reward currency (the one real, enforced usage
 * limit in this codebase today).
 */

export type ReferralStatus = 'signed_up' | 'subscribed';

export type Referral = {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  status: ReferralStatus;
  subscribedTier: string | null;
  createdAt: string;
  subscribedAt: string | null;
};

export type ReferralReward = {
  id: string;
  referrerUserId: string;
  milestoneIndex: number;
  creditsGranted: number;
  amountUsd: number;
  grantedAt: string;
};

export const REFERRALS_PER_MILESTONE = 5;
export const CREDITS_PER_MILESTONE = 14;
export const REWARD_USD_PER_MILESTONE = 70;
