import { describe, expect, it } from 'vitest';
import { estimateTicketBalancePaymentInr, formatInr, formatUsd, isExternalBillingUrl, subscriptionAmountInr, subscriptionCheckoutLabel } from './nativeCheckoutModel';

describe('nativeCheckoutModel', () => {
  it('keeps the approved Razorpay subscription display prices unchanged', () => {
    expect(subscriptionAmountInr('pro')).toBe(1913);
    expect(subscriptionAmountInr('proMax')).toBe(9565);
    expect(subscriptionAmountInr('team', 'standard', 3)).toBe(5739);
    expect(subscriptionAmountInr('team', 'premium', 2)).toBe(19130);
    expect(subscriptionAmountInr('enterprise')).toBeNull();
  });

  it('labels paid subscription plans without converting them to one-time products', () => {
    expect(subscriptionCheckoutLabel('pro')).toBe('PawOS Pro');
    expect(subscriptionCheckoutLabel('proMax')).toBe('PawOS Pro Max');
    expect(subscriptionCheckoutLabel('team', 'standard')).toBe('PawOS Team Standard');
    expect(subscriptionCheckoutLabel('team', 'premium')).toBe('PawOS Team Premium');
  });

  it('formats native checkout totals with zero tax handled by the caller', () => {
    expect(formatInr(9565)).toBe('INR 9,565.00');
    expect(formatUsd(50)).toBe('$50.00');
  });

  it('previews Ticket Balance Razorpay payment in INR without changing USD purchase value', () => {
    expect(estimateTicketBalancePaymentInr(115)).toBe(10999.75);
    expect(estimateTicketBalancePaymentInr(500)).toBe(47825);
  });

  it('detects hosted Revanta billing URLs while leaving non-billing links alone', () => {
    expect(isExternalBillingUrl('https://pawos.revantaai.com/pricing')).toBe(true);
    expect(isExternalBillingUrl('https://pawos.revantaai.com/checkout?plan=pro')).toBe(true);
    expect(isExternalBillingUrl('https://pawos.revantaai.com/checkout/credits?amountUsd=50')).toBe(true);
    expect(isExternalBillingUrl('https://pawos.revantaai.com/help/billing')).toBe(false);
    expect(isExternalBillingUrl('https://pawos.revantaai.com/legal/privacy-policy')).toBe(false);
  });
});
