import { describe, expect, it } from 'vitest';
import {
  AUTONOMOUS_WORK_CREDITS_MAX_USD,
  AUTONOMOUS_WORK_CREDITS_MIN_USD,
  AUTONOMOUS_WORK_CREDITS_PRESETS_USD,
  NATIVE_PAYMENT_METHOD_DETAILS,
  USAGE_CREDITS_MAX_USD,
  USAGE_CREDITS_MIN_USD,
  USAGE_CREDITS_PRESETS_USD,
  estimateTicketBalancePaymentInr,
  formatInr,
  formatUsd,
  isExternalBillingUrl,
  subscriptionAmountInr,
  subscriptionCheckoutLabel,
} from './nativeCheckoutModel';

describe('nativeCheckoutModel', () => {
  it('keeps the approved Razorpay subscription display prices unchanged', () => {
    expect(subscriptionAmountInr('pro')).toBe(1913);
    expect(subscriptionAmountInr('proMax')).toBe(9565);
    expect(subscriptionAmountInr('team', 'standard', 3)).toBe(5739);
    expect(subscriptionAmountInr('team', 'premium', 2)).toBe(19130);
    expect(subscriptionAmountInr('enterprise', undefined, 20)).toBe(38260);
  });

  it('labels paid subscription plans without converting them to one-time products', () => {
    expect(subscriptionCheckoutLabel('pro')).toBe('PawOS Pro');
    expect(subscriptionCheckoutLabel('proMax')).toBe('PawOS Pro Max');
    expect(subscriptionCheckoutLabel('team', 'standard')).toBe('PawOS Team Standard');
    expect(subscriptionCheckoutLabel('team', 'premium')).toBe('PawOS Team Premium');
  });

  it('labels PawOS-owned payment method choices without processor branding', () => {
    expect(NATIVE_PAYMENT_METHOD_DETAILS.upi.label).toBe('UPI');
    expect(NATIVE_PAYMENT_METHOD_DETAILS.card.label).toBe('Card');
    expect(Object.values(NATIVE_PAYMENT_METHOD_DETAILS).some((method) => /razorpay/i.test(method.label))).toBe(false);
    expect(Object.values(NATIVE_PAYMENT_METHOD_DETAILS).some((method) => /razorpay/i.test(method.description))).toBe(false);
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

  it('usage credits: $5 minimum, $20k maximum, presets cover $5–$100', () => {
    expect(USAGE_CREDITS_MIN_USD).toBe(5);
    expect(USAGE_CREDITS_MAX_USD).toBe(20_000);
    expect(USAGE_CREDITS_PRESETS_USD).toContain(5);
    expect(USAGE_CREDITS_PRESETS_USD).toContain(10);
    expect(USAGE_CREDITS_PRESETS_USD).toContain(100);
    expect(Math.min(...USAGE_CREDITS_PRESETS_USD)).toBeGreaterThanOrEqual(USAGE_CREDITS_MIN_USD);
    expect(Math.max(...USAGE_CREDITS_PRESETS_USD)).toBeLessThanOrEqual(USAGE_CREDITS_MAX_USD);
  });

  it('autonomous work credits: $30 minimum, $20k maximum, presets start at $30', () => {
    expect(AUTONOMOUS_WORK_CREDITS_MIN_USD).toBe(30);
    expect(AUTONOMOUS_WORK_CREDITS_MAX_USD).toBe(20_000);
    expect(AUTONOMOUS_WORK_CREDITS_PRESETS_USD).toContain(30);
    expect(Math.min(...AUTONOMOUS_WORK_CREDITS_PRESETS_USD)).toBeGreaterThanOrEqual(AUTONOMOUS_WORK_CREDITS_MIN_USD);
    expect(Math.max(...AUTONOMOUS_WORK_CREDITS_PRESETS_USD)).toBeLessThanOrEqual(AUTONOMOUS_WORK_CREDITS_MAX_USD);
  });

  it('usage credits min is lower than autonomous work credits min', () => {
    expect(USAGE_CREDITS_MIN_USD).toBeLessThan(AUTONOMOUS_WORK_CREDITS_MIN_USD);
  });
});
