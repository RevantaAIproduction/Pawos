import type { SeatTier, SubscriptionTierId, ProMaxVariant } from '../../shared/billing/BillingTypes';
import type { NativePaymentMethodId } from '../../shared/billing/BillingTypes';

export type NativePaymentMethod = NativePaymentMethodId;

export const NATIVE_PAYMENT_METHOD_DETAILS: Record<NativePaymentMethod, { label: string; description: string }> = {
  upi: { label: 'UPI', description: 'Pay using any UPI app or virtual payment address.' },
  card: { label: 'Card', description: 'Visa, Mastercard, RuPay, and available cards.' },
  netbanking: { label: 'Netbanking', description: "Pay through your bank's net banking portal." },
  wallet: { label: 'Wallet', description: 'Pay using a supported digital wallet.' },
};

// ── Usage Credits (normal Paw Compute top-ups, $5 minimum) ───────────────────
export const USAGE_CREDITS_PRESETS_USD: readonly number[] = [5, 10, 30, 50, 100];
export const USAGE_CREDITS_MIN_USD = 5;
export const USAGE_CREDITS_MAX_USD = 20_000;

// ── Autonomous Work Credits (ticket balance top-ups, $30 minimum) ─────────────
export const AUTONOMOUS_WORK_CREDITS_PRESETS_USD: readonly number[] = [30, 60, 100, 250, 500];
export const AUTONOMOUS_WORK_CREDITS_MIN_USD = 30;
export const AUTONOMOUS_WORK_CREDITS_MAX_USD = 20_000;

const USD_PRICES: Record<SubscriptionTierId, number> = {
  go: 0,
  pro: 20,
  proMax: 100,
  team: 0,
  enterprise: 20,
};

const PROMAX_VARIANT_USD_PRICES: Record<ProMaxVariant, number> = {
  '5x': 100,
  '20x': 250,
};

const TEAM_SEAT_USD_PRICES: Record<SeatTier, number> = {
  standard: 20,
  premium: 100,
};

export const TICKET_BALANCE_USD_INR_RATE = 95.65;

export function subscriptionAmountInr(tier: SubscriptionTierId, seatTier?: SeatTier, seatCount = 1, proMaxVariant?: ProMaxVariant): number | null {
  const rate = TICKET_BALANCE_USD_INR_RATE;
  if (tier === 'team') {
    const seatPrice = TEAM_SEAT_USD_PRICES[seatTier ?? 'standard'];
    return Math.round(seatPrice * rate) * Math.max(1, seatCount);
  }
  if (tier === 'enterprise') {
    return Math.round(USD_PRICES.enterprise * rate) * Math.max(1, seatCount);
  }
  if (tier === 'proMax' && proMaxVariant) {
    const usd = PROMAX_VARIANT_USD_PRICES[proMaxVariant];
    return Math.round(usd * rate);
  }
  const usd = USD_PRICES[tier];
  if (usd === undefined || usd === 0) return null;
  return Math.round(usd * rate);
}

export function subscriptionCheckoutLabel(tier: SubscriptionTierId, seatTier?: SeatTier, proMaxVariant?: ProMaxVariant): string {
  if (tier === 'pro') return 'PawOS Pro';
  if (tier === 'proMax') {
    if (proMaxVariant === '5x') return 'PawOS Pro Max 5x';
    if (proMaxVariant === '20x') return 'PawOS Pro Max 20x';
    return 'PawOS Pro Max';
  }
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
