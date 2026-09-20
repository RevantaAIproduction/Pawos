import { describe, it, expect } from 'vitest';
import {
  AUTONOMOUS_TARGET_GROSS_MARGIN,
  AUTONOMOUS_MARKUP_MULTIPLIER,
  WORK_PC_PER_CUSTOMER_DOLLAR,
  providerCostToWorkPc,
  customerChargeToWorkPc,
  workPcToCustomerCharge,
  verifyMargin,
} from './AutonomousWorkPcCommercialModel';

describe('AutonomousWorkPcCommercialModel', () => {
  describe('Constants', () => {
    it('target gross margin is 70%', () => {
      expect(AUTONOMOUS_TARGET_GROSS_MARGIN).toBe(0.70);
    });

    it('markup multiplier is 3.333...', () => {
      expect(AUTONOMOUS_MARKUP_MULTIPLIER).toBeCloseTo(10 / 3, 5);
    });

    it('work PC per customer dollar is 100', () => {
      expect(WORK_PC_PER_CUSTOMER_DOLLAR).toBe(100);
    });
  });

  describe('providerCostToWorkPc', () => {
    it('converts $0.01 provider cost to 3.3333 Work PC', () => {
      const workPc = providerCostToWorkPc(0.01);
      expect(workPc).toBeCloseTo(3.3333, 4);
    });

    it('converts $0.10 provider cost to 33.3333 Work PC', () => {
      const workPc = providerCostToWorkPc(0.10);
      expect(workPc).toBeCloseTo(33.3333, 4);
    });

    it('converts $1.00 provider cost to 333.3333 Work PC', () => {
      const workPc = providerCostToWorkPc(1.0);
      expect(workPc).toBeCloseTo(333.3333, 4);
    });

    it('converts $1.20 provider cost to 400 Work PC', () => {
      const workPc = providerCostToWorkPc(1.20);
      expect(workPc).toBe(400);
    });

    it('converts $5.00 provider cost to 1666.6667 Work PC', () => {
      const workPc = providerCostToWorkPc(5.0);
      expect(workPc).toBeCloseTo(1666.6667, 4);
    });

    it('rounds to 4 decimal places', () => {
      const workPc = providerCostToWorkPc(0.000123);
      // 0.000123 / 0.30 * 100 = 0.041
      expect(workPc).toBe(0.041);
    });

    it('handles zero cost', () => {
      const workPc = providerCostToWorkPc(0);
      expect(workPc).toBe(0);
    });

    it('handles very small costs', () => {
      const workPc = providerCostToWorkPc(0.0001);
      expect(workPc).toBeCloseTo(0.0333, 4);
    });
  });

  describe('customerChargeToWorkPc', () => {
    it('converts $0.0333... customer charge to 3.3333 Work PC', () => {
      const workPc = customerChargeToWorkPc(0.0333333);
      expect(workPc).toBeCloseTo(3.3333, 3);
    });

    it('converts $1.00 customer charge to 100 Work PC', () => {
      const workPc = customerChargeToWorkPc(1.0);
      expect(workPc).toBe(100);
    });

    it('converts $4.00 customer charge to 400 Work PC', () => {
      const workPc = customerChargeToWorkPc(4.0);
      expect(workPc).toBe(400);
    });

    it('handles $30 top-up', () => {
      const workPc = customerChargeToWorkPc(30);
      expect(workPc).toBe(3000);
    });
  });

  describe('workPcToCustomerCharge', () => {
    it('converts 100 Work PC to $1.00', () => {
      const charge = workPcToCustomerCharge(100);
      expect(charge).toBe(1);
    });

    it('converts 400 Work PC to $4.00', () => {
      const charge = workPcToCustomerCharge(400);
      expect(charge).toBe(4);
    });

    it('converts 3000 Work PC to $30.00', () => {
      const charge = workPcToCustomerCharge(3000);
      expect(charge).toBe(30);
    });

    it('converts 3.3333 Work PC to $0.0333...', () => {
      const charge = workPcToCustomerCharge(3.3333);
      expect(charge).toBeCloseTo(0.0333, 4);
    });

    it('inverse of customerChargeToWorkPc', () => {
      const charge = 4.567;
      const workPc = customerChargeToWorkPc(charge);
      const chargeRecovered = workPcToCustomerCharge(workPc);
      expect(chargeRecovered).toBeCloseTo(charge, 4);
    });
  });

  describe('Margin verification', () => {
    it('verifies 70% margin for $0.01 provider cost', () => {
      const providerCost = 0.01;
      const workPc = providerCostToWorkPc(providerCost);
      const { margin, isValid } = verifyMargin(providerCost, workPc);
      expect(isValid).toBe(true);
      expect(margin).toBeCloseTo(0.70, 2);
    });

    it('verifies 70% margin for $1.20 provider cost → 400 Work PC', () => {
      const providerCost = 1.20;
      const workPc = 400;
      const { margin, isValid } = verifyMargin(providerCost, workPc);
      expect(isValid).toBe(true);
      expect(margin).toBeCloseTo(0.70, 2);
    });

    it('verifies 70% margin for $5.00 provider cost', () => {
      const providerCost = 5.0;
      const workPc = providerCostToWorkPc(providerCost);
      const { margin, isValid } = verifyMargin(providerCost, workPc);
      expect(isValid).toBe(true);
      expect(margin).toBeCloseTo(0.70, 2);
    });

    it('rejects wrong Work PC amount', () => {
      const providerCost = 1.20;
      const wrongWorkPc = 300; // Should be 400
      const { margin, isValid } = verifyMargin(providerCost, wrongWorkPc);
      expect(isValid).toBe(false);
      expect(margin).not.toBeCloseTo(0.70, 2);
    });

    it('verifies margin for arbitrary provider costs', () => {
      const testCases = [0.001, 0.01, 0.1, 0.5, 1.0, 2.5, 10.0];
      for (const providerCost of testCases) {
        const workPc = providerCostToWorkPc(providerCost);
        const { isValid, margin } = verifyMargin(providerCost, workPc);
        expect(isValid).toBe(true);
        expect(margin).toBeCloseTo(0.70, 2);
      }
    });
  });

  describe('Walletdome semantics', () => {
    it('$30 top-up = 3000 Work PC', () => {
      const topupUsd = 30;
      const workPc = customerChargeToWorkPc(topupUsd);
      expect(workPc).toBe(3000);
    });

    it('$1.20 provider cost consumed from 3000 Work PC', () => {
      const startingWorkPc = 3000;
      const providerCost = 1.20;
      const consumedWorkPc = providerCostToWorkPc(providerCost);
      const remainingWorkPc = startingWorkPc - consumedWorkPc;
      expect(consumedWorkPc).toBe(400);
      expect(remainingWorkPc).toBeCloseTo(2600, 4);
    });

    it('Conservation invariant: opening + topups - consumed = remaining', () => {
      // Start with $30 top-up = 3000 Work PC
      let availableWorkPc = customerChargeToWorkPc(30);
      expect(availableWorkPc).toBe(3000);

      // First request costs $0.03 provider → 10 Work PC
      const request1Cost = 0.03;
      const request1WorkPc = providerCostToWorkPc(request1Cost);
      availableWorkPc -= request1WorkPc;
      expect(request1WorkPc).toBeCloseTo(10, 4);
      expect(availableWorkPc).toBeCloseTo(2990, 4);

      // Second request costs $1.20 provider → 400 Work PC
      const request2Cost = 1.20;
      const request2WorkPc = providerCostToWorkPc(request2Cost);
      availableWorkPc -= request2WorkPc;
      expect(request2WorkPc).toBe(400);
      expect(availableWorkPc).toBeCloseTo(2590, 4);

      // Another top-up: $10 = 1000 Work PC
      availableWorkPc += customerChargeToWorkPc(10);
      expect(availableWorkPc).toBeCloseTo(3590, 4);
    });

    it('Unused reservation returned on settlement', () => {
      // Authorize 400 Work PC (for $1.20 max provider cost)
      const authorizedWorkPc = 400;

      // Actual usage: $0.90 provider cost → 300 Work PC
      const actualProviderCost = 0.90;
      const actualWorkPc = providerCostToWorkPc(actualProviderCost);
      expect(actualWorkPc).toBeCloseTo(300, 4);

      // Unused: 400 - 300 = 100
      const unusedWorkPc = authorizedWorkPc - actualWorkPc;
      expect(unusedWorkPc).toBeCloseTo(100, 4);
    });
  });

  describe('Roundtrip consistency', () => {
    it('provider cost → Work PC → customer charge → Work PC is consistent', () => {
      const originalProviderCost = 0.75;
      const workPc1 = providerCostToWorkPc(originalProviderCost);
      const charge = workPcToCustomerCharge(workPc1);
      const workPc2 = customerChargeToWorkPc(charge);
      expect(workPc2).toBeCloseTo(workPc1, 4);
    });

    it('no accumulation error over multiple roundtrips', () => {
      let providerCost = 0.01;
      for (let i = 0; i < 100; i++) {
        const workPc = providerCostToWorkPc(providerCost);
        const charge = workPcToCustomerCharge(workPc);
        const recoveredCost = charge / AUTONOMOUS_MARKUP_MULTIPLIER;
        expect(recoveredCost).toBeCloseTo(providerCost, 4);
        providerCost += 0.01;
      }
    });
  });
});
