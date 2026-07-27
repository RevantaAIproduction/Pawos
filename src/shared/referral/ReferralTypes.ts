/**
 * Referral engine — a real, shareable per-user code; a referral only counts
 * once the referred account genuinely subscribes to Pro or Pro Max, and
 * every 5 converted referrals grants the referrer $100 in Referral Credits
 * (see ../billing/ReferralCreditTypes.ts) — a balance kept deliberately
 * separate from the Ticket Balance wallet the Autonomous Ticket System
 * deducts from, per the product requirement that referral rewards must
 * never be spendable on ticket billing, subscriptions, or cash payout.
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
  amountUsd: number;
  grantedAt: string;
};

export const REFERRALS_PER_MILESTONE = 5;
export const REWARD_USD_PER_MILESTONE = 100;
