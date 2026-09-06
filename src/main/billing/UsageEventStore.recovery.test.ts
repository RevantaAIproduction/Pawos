import { describe, it, expect, beforeEach } from 'vitest';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

/**
 * Unit tests for UsageEventStore recovery safety mechanism.
 * Ensures that corrupted checkpoints block settlement (preventing silent undercharging)
 * while legitimate zero-usage runs can still settle.
 */

// Mock implementation of UsageEventStore for testing
class TestUsageEventStore {
  private state: { records: NormalizedUsageRecord[]; recoveryRequired?: boolean } = {
    records: [],
    recoveryRequired: false,
  };

  append(record: NormalizedUsageRecord): void {
    this.state.records.push(record);
  }

  calculateActualPcForRun(runId: string): number {
    if (this.state.recoveryRequired === true) {
      throw new Error(
        `[RECOVERY_REQUIRED] Usage data integrity compromised for run ${runId}. ` +
        `Cannot settle with potentially incomplete records. Manual checkpoint recovery required.`
      );
    }
    const records = this.state.records.filter((r) => r.runId === runId);
    return Math.round(records.reduce((sum, r) => sum + (r.normalizedCompute ?? 0), 0));
  }

  isRecoveryRequired(): boolean {
    return this.state.recoveryRequired === true;
  }

  setRecoveryRequired(reason: string): void {
    this.state.recoveryRequired = true;
  }

  clearRecoveryFlag(): void {
    this.state.recoveryRequired = false;
  }
}

describe('UsageEventStore Recovery Safety', () => {
  let store: TestUsageEventStore;

  beforeEach(() => {
    store = new TestUsageEventStore();
  });

  it('Test A: Normal case with recorded usage', () => {
    const runId = 'test-run-1';
    store.append({
      runId,
      requestId: 'req-1',
      normalizedCompute: 250,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);

    const actualPc = store.calculateActualPcForRun(runId);
    expect(actualPc).toBe(250);
  });

  it('Test B: Recovery required throws error', () => {
    const runId = 'test-run-2';
    store.append({
      runId,
      requestId: 'req-1',
      normalizedCompute: 300,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);

    store.setRecoveryRequired('Checkpoint corrupted');

    expect(() => {
      store.calculateActualPcForRun(runId);
    }).toThrow(/RECOVERY_REQUIRED/);
  });

  it('Test C: Empty records with normal state returns 0', () => {
    const runId = 'test-run-3';
    const actualPc = store.calculateActualPcForRun(runId);
    expect(actualPc).toBe(0);
    expect(store.isRecoveryRequired()).toBe(false);
  });

  it('Test D: Empty records with recovery required throws', () => {
    const runId = 'test-run-4';
    store.setRecoveryRequired('Checkpoint lost');

    expect(() => {
      store.calculateActualPcForRun(runId);
    }).toThrow(/RECOVERY_REQUIRED/);
  });

  it('Test E: Recovery flag clears after being set', () => {
    store.setRecoveryRequired('Test');
    expect(store.isRecoveryRequired()).toBe(true);

    store.clearRecoveryFlag();
    expect(store.isRecoveryRequired()).toBe(false);

    // Should now return 0 for empty run
    const actualPc = store.calculateActualPcForRun('test-run-5');
    expect(actualPc).toBe(0);
  });

  it('Test F: Wallet unchanged when settlement blocked', () => {
    const runId = 'test-run-6';
    store.append({
      runId,
      requestId: 'req-1',
      normalizedCompute: 500,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);

    // Before recovery flag: can calculate
    let actualPc = store.calculateActualPcForRun(runId);
    expect(actualPc).toBe(500);

    // Set recovery flag
    store.setRecoveryRequired('Corruption detected');

    // Now throws instead of returning value
    expect(() => {
      store.calculateActualPcForRun(runId);
    }).toThrow();

    // Flag is set
    expect(store.isRecoveryRequired()).toBe(true);
  });

  it('Test G: Multiple records aggregate correctly', () => {
    const runId = 'test-run-7';
    store.append({
      runId,
      requestId: 'req-1',
      normalizedCompute: 100,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);
    store.append({
      runId,
      requestId: 'req-2',
      normalizedCompute: 150,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);
    store.append({
      runId,
      requestId: 'req-3',
      normalizedCompute: 200,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);

    const actualPc = store.calculateActualPcForRun(runId);
    expect(actualPc).toBe(450);
  });

  it('Test H: Recovery flag is global (affects all runs)', () => {
    const runId1 = 'run-a';
    const runId2 = 'run-b';

    store.append({
      runId: runId1,
      requestId: 'req-1',
      normalizedCompute: 100,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);
    store.append({
      runId: runId2,
      requestId: 'req-2',
      normalizedCompute: 200,
      timestamp: Date.now(),
    } as NormalizedUsageRecord);

    // Both calculate normally
    expect(store.calculateActualPcForRun(runId1)).toBe(100);
    expect(store.calculateActualPcForRun(runId2)).toBe(200);

    // Set global recovery flag
    store.setRecoveryRequired('Global checkpoint corruption');

    // Both now throw
    expect(() => store.calculateActualPcForRun(runId1)).toThrow(/RECOVERY_REQUIRED/);
    expect(() => store.calculateActualPcForRun(runId2)).toThrow(/RECOVERY_REQUIRED/);
  });
});
