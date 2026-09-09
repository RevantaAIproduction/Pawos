import { describe, it, expect } from 'vitest';
import {
  normalizedComputeToProviderCost,
  normalizedComputeToWorkPc,
  providerCostToWorkPc,
  verifyMargin,
} from './AutonomousWorkPcCommercialModel';

describe('Settlement Path: Normalized Compute → Work PC', () => {
  describe('Real-world autonomous execution example', () => {
    it('converts minimal Gemini request (100 input, 200 output tokens)', () => {
      // Real provider cost calculation:
      // Input: 100 tokens × ($0.75 / 1M) = $0.000075
      // Output: 200 tokens × ($3.75 / 1M) = $0.00075
      // Total: $0.000825
      // Normalized compute: $0.000825 × 1000 = 0.825

      const normalizedCompute = 0.825;
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      // Expected: 0.275 Work PC
      expect(actualWorkPc).toBeCloseTo(0.275, 3);

      // Verify margin
      const providerCost = normalizedComputeToProviderCost(normalizedCompute);
      expect(providerCost).toBeCloseTo(0.000825, 6);

      const { isValid, margin } = verifyMargin(providerCost, actualWorkPc);
      expect(isValid).toBe(true);
      expect(margin).toBeCloseTo(0.70, 2);
    });

    it('converts $0.01 provider cost to exact 3.3333 Work PC', () => {
      // Provider cost: $0.01
      // Normalized: $0.01 × 1000 = 10
      const normalizedCompute = 10;
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      expect(actualWorkPc).toBeCloseTo(3.3333, 4);

      const { isValid } = verifyMargin(0.01, actualWorkPc);
      expect(isValid).toBe(true);
    });

    it('converts $1.20 provider cost to exact 400 Work PC', () => {
      // Provider cost: $1.20
      // Normalized: $1.20 × 1000 = 1200
      const normalizedCompute = 1200;
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      expect(actualWorkPc).toBe(400);

      // Verify: $1.20 / 0.30 × 100 = 400
      const { isValid } = verifyMargin(1.20, actualWorkPc);
      expect(isValid).toBe(true);
    });

    it('handles zero provider cost', () => {
      const normalizedCompute = 0;
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      expect(actualWorkPc).toBe(0);
    });

    it('handles very small costs with proper rounding', () => {
      // Provider cost: $0.001234
      // Normalized: 1.234
      const normalizedCompute = 1.234;
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      // $0.001234 / 0.30 × 100 = 0.4113...
      expect(actualWorkPc).toBeCloseTo(0.4113, 4);
    });
  });

  describe('Settlement RPC denominations', () => {
    it('settlement receives Work PC, not normalized compute', () => {
      // Scenario: Execution consumed $5.00 in provider cost
      const providerCostUsd = 5.0;
      const normalizedCompute = providerCostUsd * 1000; // 5000

      // What settlement RPC should receive:
      const expectedWorkPc = providerCostToWorkPc(providerCostUsd); // 1666.67
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      expect(actualWorkPc).toBe(expectedWorkPc);
      expect(actualWorkPc).not.toBe(normalizedCompute); // NOT 5000
      expect(actualWorkPc).not.toBe(normalizedCompute / 10); // NOT 500
      expect(actualWorkPc).toBeCloseTo(1666.6667, 4); // EXACTLY this

      const { isValid } = verifyMargin(providerCostUsd, actualWorkPc);
      expect(isValid).toBe(true);
    });

    it('billing event stores both amount_pc and amount_usd correctly', () => {
      // Execution cost: $0.75 provider
      const providerCostUsd = 0.75;
      const normalizedCompute = providerCostUsd * 1000; // 750
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      // Settlement RPC billing event:
      const amountPc = Math.round(actualWorkPc * 10_000) / 10_000; // Work PC
      const amountUsd = Math.round((amountPc / 100) * 100) / 100; // Customer USD

      expect(actualWorkPc).toBeCloseTo(250, 2); // $0.75 / 0.30 × 100
      expect(amountPc).toBeCloseTo(250, 2);
      expect(amountUsd).toBe(2.50); // 250 / 100
    });
  });

  describe('Conservation invariant', () => {
    it('preserves invariant: opening + topups - consumed = balance + reserved', () => {
      // Opening: $30 top-up = 3000 Work PC
      let availableBalance = 3000;
      let reservedAmount = 0;

      // Request 1: Reserve 400 Work PC
      reservedAmount += 400;
      availableBalance -= 400;
      expect(availableBalance).toBe(2600);
      expect(reservedAmount).toBe(400);

      // Request executes, uses $1.20 provider cost = 400 Work PC
      const consumption1Pc = normalizedComputeToWorkPc(1200);
      expect(consumption1Pc).toBe(400);

      // Settlement: release unused
      const unused1 = 400 - 400;
      availableBalance += unused1;
      reservedAmount -= 400;

      expect(availableBalance).toBe(2600);
      expect(reservedAmount).toBe(0);

      // Request 2: Reserve 100 Work PC for smaller request
      reservedAmount += 100;
      availableBalance -= 100;
      expect(availableBalance).toBe(2500);

      // Request executes, uses $0.03 provider cost = 10 Work PC
      const consumption2Pc = normalizedComputeToWorkPc(30);
      expect(consumption2Pc).toBeCloseTo(10, 2);

      // Settlement: release unused
      const unused2 = 100 - 10;
      availableBalance += unused2;
      reservedAmount -= 100;

      expect(availableBalance).toBeCloseTo(2590, 1);
      expect(reservedAmount).toBe(0);

      // Final invariant: 3000 + 0 - 410 = 2590
      const totalConsumed = 400 + 10;
      const finalBalance = 3000 - totalConsumed;
      expect(availableBalance).toBeCloseTo(finalBalance, 1);
    });
  });

  describe('Edge cases and rounding', () => {
    it('handles fractional Work PC correctly', () => {
      // Provider cost: $0.0456
      // Normalized: 45.6
      const normalizedCompute = 45.6;
      const actualWorkPc = normalizedComputeToWorkPc(normalizedCompute);

      // $0.0456 / 0.30 × 100 = 15.2
      expect(actualWorkPc).toBeCloseTo(15.2, 2);

      const { isValid } = verifyMargin(0.0456, actualWorkPc);
      expect(isValid).toBe(true);
    });

    it('handles accumulated rounding errors', () => {
      // Multiple small requests accumulate
      const requests = [
        { providerCost: 0.001 }, // 0.3333 PC
        { providerCost: 0.002 }, // 0.6667 PC
        { providerCost: 0.003 }, // 1.0 PC
      ];

      let totalNormalized = 0;
      for (const req of requests) {
        totalNormalized += req.providerCost * 1000;
      }

      const actualWorkPc = normalizedComputeToWorkPc(totalNormalized);
      const totalProviderCost = requests.reduce((sum, r) => sum + r.providerCost, 0);
      const expectedWorkPc = providerCostToWorkPc(totalProviderCost);

      expect(actualWorkPc).toBeCloseTo(expectedWorkPc, 4);

      const { isValid } = verifyMargin(totalProviderCost, actualWorkPc);
      expect(isValid).toBe(true);
    });
  });
});
