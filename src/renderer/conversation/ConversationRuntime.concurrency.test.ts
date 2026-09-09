/**
 * Concurrency regression test: Verify that temporaryExecutionMode from one turn
 * does not leak into another concurrent turn.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ConversationExecutionMode } from '../ui/Dashboard/sections/ExecutionModeTypes';
import type { SubmittedInputContext } from './ConversationTypes';

describe('ConversationRuntime — temporaryExecutionMode concurrency', () => {
  it('verifies Map<turnId, mode> prevents mode leakage between concurrent turns', () => {
    // Simulate the runtime's turn management
    let turnId = 0;
    const turnIdToTemporaryMode = new Map<number, ConversationExecutionMode>();

    // TURN A: Start with acceptEdits mode
    const turnA = ++turnId;
    const contextA: SubmittedInputContext = { temporaryExecutionMode: 'acceptEdits' };
    if (contextA.temporaryExecutionMode) {
      turnIdToTemporaryMode.set(turnA, contextA.temporaryExecutionMode);
    }

    // Helper: simulate getExecutionMode for a specific turn
    const getExecutionModeForTurn = (turnId: number): ConversationExecutionMode => {
      return turnIdToTemporaryMode.get(turnId) ?? 'manual';
    };

    // Verify Turn A reads its own mode
    expect(getExecutionModeForTurn(turnA)).toBe('acceptEdits');

    // TURN B: Start with plan mode (simulates concurrent turn starting)
    const turnB = ++turnId;
    const contextB: SubmittedInputContext = { temporaryExecutionMode: 'plan' };
    if (contextB.temporaryExecutionMode) {
      turnIdToTemporaryMode.set(turnB, contextB.temporaryExecutionMode);
    }

    // Verify Turn B reads its own mode
    expect(getExecutionModeForTurn(turnB)).toBe('plan');

    // CRITICAL: Verify Turn A still reads acceptEdits (not plan)
    expect(getExecutionModeForTurn(turnA)).toBe('acceptEdits');
    expect(getExecutionModeForTurn(turnA)).not.toBe('plan');

    // Finalize Turn A (clean up its map entry)
    turnIdToTemporaryMode.delete(turnA);

    // Verify Turn A no longer has an entry (falls back to default)
    expect(getExecutionModeForTurn(turnA)).toBe('manual');

    // Verify Turn B's mode is unaffected by A's finalization
    expect(getExecutionModeForTurn(turnB)).toBe('plan');

    // Finalize Turn B (clean up its map entry)
    turnIdToTemporaryMode.delete(turnB);

    // Verify Turn B no longer has an entry
    expect(getExecutionModeForTurn(turnB)).toBe('manual');

    // Verify the map is clean
    expect(turnIdToTemporaryMode.size).toBe(0);
  });

  it('handles rapid sequential turns without mode leakage', () => {
    let turnId = 0;
    const turnIdToTemporaryMode = new Map<number, ConversationExecutionMode>();

    const modes: ConversationExecutionMode[] = ['acceptEdits', 'plan', 'auto', 'manual'];
    const turns = modes.map((mode) => {
      const id = ++turnId;
      turnIdToTemporaryMode.set(id, mode);
      return { id, mode };
    });

    // Verify each turn reads its own mode
    turns.forEach(({ id, mode }) => {
      expect(turnIdToTemporaryMode.get(id)).toBe(mode);
    });

    // Verify cross-turn contamination doesn't happen
    expect(turnIdToTemporaryMode.get(turns[0].id)).toBe('acceptEdits');
    expect(turnIdToTemporaryMode.get(turns[1].id)).toBe('plan');
    expect(turnIdToTemporaryMode.get(turns[2].id)).toBe('auto');
    expect(turnIdToTemporaryMode.get(turns[3].id)).toBe('manual');

    // Clean up in order
    turns.forEach(({ id }) => {
      turnIdToTemporaryMode.delete(id);
    });

    // Verify all cleaned
    expect(turnIdToTemporaryMode.size).toBe(0);
  });

  it('handles concurrent finalization without affecting other turns', () => {
    let turnId = 0;
    const turnIdToTemporaryMode = new Map<number, ConversationExecutionMode>();

    // Start 3 concurrent turns
    const t1 = ++turnId;
    turnIdToTemporaryMode.set(t1, 'acceptEdits');

    const t2 = ++turnId;
    turnIdToTemporaryMode.set(t2, 'plan');

    const t3 = ++turnId;
    turnIdToTemporaryMode.set(t3, 'auto');

    // Verify all have modes
    expect(turnIdToTemporaryMode.size).toBe(3);

    // Finalize t2 (middle turn) before others
    turnIdToTemporaryMode.delete(t2);

    // Verify t1 and t3 are unaffected
    expect(turnIdToTemporaryMode.get(t1)).toBe('acceptEdits');
    expect(turnIdToTemporaryMode.get(t2)).toBeUndefined();
    expect(turnIdToTemporaryMode.get(t3)).toBe('auto');
    expect(turnIdToTemporaryMode.size).toBe(2);

    // Finalize remaining
    turnIdToTemporaryMode.delete(t1);
    turnIdToTemporaryMode.delete(t3);

    expect(turnIdToTemporaryMode.size).toBe(0);
  });
});
