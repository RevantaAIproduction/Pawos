import type { SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';

export type NativePaymentMethod = 'razorpay';

export const NATIVE_PAYMENT_METHODS: { id: NativePaymentMethod; label: string; description: string }[] = [
  {
    id: 'razorpay',
    label: 'Secure Razorpay payment',
    description: 'Razorpay shows the payment methods enabled for this account at payment time.',
  },
];

const SUBSCRIPTION_PRICE_INR: Partial<Record<SubscriptionTierId, number>> = {
  pro: 1913,
  proMax: 9565,
};

const TEAM_SEAT_PRICE_INR: Record<SeatTier, number> = {
  standard: 1913,
  premium: 9565,
};

export const TICKET_BALANCE_USD_INR_RATE = 95.65;

export function subscriptionAmountInr(tier: SubscriptionTierId, seatTier?: SeatTier, seatCount = 1): number | null {
  if (tier === 'team') return TEAM_SEAT_PRICE_INR[seatTier ?? 'standard'] * Math.max(1, seatCount);
  return SUBSCRIPTION_PRICE_INR[tier] ?? null;
}

export function subscriptionCheckoutLabel(tier: SubscriptionTierId, seatTier?: SeatTier): string {
  if (tier === 'pro') return 'PawOS Pro';
  if (tier === 'proMax') return 'PawOS Pro Max';
  if (tier === 'team') return `PawOS Team ${seatTier === 'premium' ? 'Premium' : 'Standard'}`;
  if (tier === 'enterprise') return 'PawOS Enterprise';
  return 'PawOS Go';
}

export function formatInr(amount: number): string {
  return `INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function estimateTicketBalancePaymentInr(amountUsd: number): number {
  return Math.round(amountUsd * TICKET_BALANCE_USD_INR_RATE * 100) / 100;
}

export function isExternalBillingUrl(url: string): boolean {
  return /https:\/\/pawos\.revantaai\.com\/(?:pricing|checkout(?:\/credits)?)(?:[/?#]|$)/i.test(url);
}
