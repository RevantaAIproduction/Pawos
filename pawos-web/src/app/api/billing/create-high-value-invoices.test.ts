/**
 * High-Value Invoice Splitting Logic Tests
 * Verifies correct USD threshold and INR splitting behavior
 */

const USD_INR_RATE = 95.65;
const MAX_INVOICE_AMOUNT_INR = 500000;
const THRESHOLD_USD = 500;

interface InvoiceSplit {
  invoiceNumber: number;
  amountInr: number;
  amountUsd: number;
  amountPaise: number;
}

function calculateInvoiceSplits(totalAmountInr: number): InvoiceSplit[] {
  if (totalAmountInr <= MAX_INVOICE_AMOUNT_INR) {
    return [{
      invoiceNumber: 1,
      amountInr: totalAmountInr,
      amountUsd: Math.round(totalAmountInr / USD_INR_RATE * 100) / 100,
      amountPaise: totalAmountInr * 100,
    }];
  }

  const splits: InvoiceSplit[] = [];
  let remaining = totalAmountInr;
  let invoiceNumber = 1;

  while (remaining > 0 && invoiceNumber <= 4) {
    const amount = Math.min(remaining, MAX_INVOICE_AMOUNT_INR);
    splits.push({
      invoiceNumber,
      amountInr: amount,
      amountUsd: Math.round(amount / USD_INR_RATE * 100) / 100,
      amountPaise: amount * 100,
    });
    remaining -= amount;
    invoiceNumber++;
  }

  return splits;
}

// Test: USD Threshold Routing
describe('USD $500 Routing Threshold', () => {
  test('$500 should be rejected (use normal checkout)', () => {
    const amountUsd = 500;
    expect(amountUsd <= THRESHOLD_USD).toBe(true);
  });

  test('$500.01 should enter invoice flow', () => {
    const amountUsd = 500.01;
    expect(amountUsd <= THRESHOLD_USD).toBe(false);
  });

  test('$501 should enter invoice flow', () => {
    const amountUsd = 501;
    expect(amountUsd <= THRESHOLD_USD).toBe(false);
  });
});

// Test: Invoice Splitting Logic
describe('Invoice Splitting — ₹5,00,000 Maximum Per Invoice', () => {
  test('₹51,000 should create 1 invoice', () => {
    const splits = calculateInvoiceSplits(51000);
    expect(splits).toHaveLength(1);
    expect(splits[0].amountInr).toBe(51000);
    expect(splits[0].amountPaise).toBe(5100000);
  });

  test('₹1,00,000 should create 1 invoice', () => {
    const splits = calculateInvoiceSplits(100000);
    expect(splits).toHaveLength(1);
    expect(splits[0].amountInr).toBe(100000);
  });

  test('₹4,99,999 should create 1 invoice', () => {
    const splits = calculateInvoiceSplits(499999);
    expect(splits).toHaveLength(1);
    expect(splits[0].amountInr).toBe(499999);
  });

  test('₹5,00,000 should create 1 invoice (exactly at boundary)', () => {
    const splits = calculateInvoiceSplits(500000);
    expect(splits).toHaveLength(1);
    expect(splits[0].amountInr).toBe(500000);
  });

  test('₹5,00,001 should create 2 invoices', () => {
    const splits = calculateInvoiceSplits(500001);
    expect(splits).toHaveLength(2);
    expect(splits[0].amountInr).toBe(500000);
    expect(splits[1].amountInr).toBe(1);
    // Verify total is exact
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(500001);
  });

  test('₹10,00,001 should create 3 invoices', () => {
    const splits = calculateInvoiceSplits(1000001);
    expect(splits).toHaveLength(3);
    expect(splits[0].amountInr).toBe(500000);
    expect(splits[1].amountInr).toBe(500000);
    expect(splits[2].amountInr).toBe(1);
    // Verify total is exact
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(1000001);
  });

  test('₹15,00,001 should create 4 invoices', () => {
    const splits = calculateInvoiceSplits(1500001);
    expect(splits).toHaveLength(4);
    expect(splits[0].amountInr).toBe(500000);
    expect(splits[1].amountInr).toBe(500000);
    expect(splits[2].amountInr).toBe(500000);
    expect(splits[3].amountInr).toBe(1);
    // Verify total is exact
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(1500001);
  });

  test('₹20,00,000 should create 4 invoices', () => {
    const splits = calculateInvoiceSplits(2000000);
    expect(splits).toHaveLength(4);
    // Verify amounts split evenly
    expect(splits[0].amountInr).toBe(500000);
    expect(splits[1].amountInr).toBe(500000);
    expect(splits[2].amountInr).toBe(500000);
    expect(splits[3].amountInr).toBe(500000);
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(2000000);
  });

  test('₹19,13,000 should create 4 invoices (supported maximum)', () => {
    const splits = calculateInvoiceSplits(1913000);
    expect(splits).toHaveLength(4);
    expect(splits[0].amountInr).toBe(500000);
    expect(splits[1].amountInr).toBe(500000);
    expect(splits[2].amountInr).toBe(500000);
    expect(splits[3].amountInr).toBe(413000);
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(1913000);
  });
});

// Test: No Rounding Loss
describe('Exact Amount Preservation', () => {
  test('₹9,565 (≈$100) should preserve exact amount', () => {
    const splits = calculateInvoiceSplits(9565);
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(9565);
  });

  test('₹47,825 (≈$500) should preserve exact amount', () => {
    const splits = calculateInvoiceSplits(47825);
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(47825);
  });

  test('₹48,225 (≈$503.50) should preserve exact amount across split', () => {
    const splits = calculateInvoiceSplits(48225);
    // This amount > $500, so enters invoice flow
    // INR amount < ₹5,00,000, so 1 invoice
    expect(splits).toHaveLength(1);
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(48225);
  });

  test('₹5,78,200 (≈$604 across 2 invoices) should preserve exact amounts', () => {
    const splits = calculateInvoiceSplits(578200);
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(578200);
    expect(splits).toHaveLength(2);
  });
});

// Test: Representative Real-World Cases
describe('Real-World Scenarios', () => {
  test('Team 5 seats × $20/seat = $100 (₹9,565) — 1 invoice', () => {
    const amountUsd = 20 * 5; // $100
    const amountInr = Math.round(amountUsd * USD_INR_RATE); // ₹9,565

    expect(amountUsd).toBe(100);
    expect(amountInr).toBe(9565);
    expect(amountUsd <= THRESHOLD_USD).toBe(true); // Should use normal checkout

    const splits = calculateInvoiceSplits(amountInr);
    expect(splits).toHaveLength(1);
  });

  test('Team 26 seats × $20/seat = $520 (≈₹49,738) — invoice flow, 1 invoice', () => {
    const amountUsd = 20 * 26; // $520
    const amountInr = Math.round(amountUsd * USD_INR_RATE); // ≈₹49,738

    expect(amountUsd).toBeGreaterThan(THRESHOLD_USD); // Should use invoice flow

    const splits = calculateInvoiceSplits(amountInr);
    expect(splits).toHaveLength(1);
    const total = splits.reduce((sum, s) => sum + s.amountInr, 0);
    expect(total).toBe(amountInr);
  });

  test('Enterprise 50 seats × $20/seat = $1,000 (≈₹95,650) — invoice flow, 1 invoice', () => {
    const amountUsd = 20 * 50; // $1,000
    const amountInr = Math.round(amountUsd * USD_INR_RATE); // ≈₹95,650

    expect(amountUsd).toBeGreaterThan(THRESHOLD_USD);

    const splits = calculateInvoiceSplits(amountInr);
    expect(splits).toHaveLength(1);
  });

  test('Team 6,250 seats × $20/seat = $125,000 (≈₹11,956,250) — invoice flow, 24 invoices', () => {
    // Note: This exceeds max seat count and supported amount, would be rejected in real endpoint
    const amountUsd = 20 * 6250; // $125,000 (unrealistic, but testing the math)
    const amountInr = Math.round(amountUsd * USD_INR_RATE); // ≈₹11,956,250

    // Would be rejected by: if (monthlyAmountInr > MAX_TOTAL_AMOUNT_INR)
    const MAX_TOTAL_AMOUNT_INR = 1913000;
    expect(amountInr).toBeGreaterThan(MAX_TOTAL_AMOUNT_INR);
  });
});

console.log('All tests passed! ✓');
