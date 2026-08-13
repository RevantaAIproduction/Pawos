import { describe, expect, it, vi } from 'vitest';
import { authorizeRuntimeAction, getRequiredRuntimeForAction } from './RuntimeActionAuthorization';

describe('RuntimeActionAuthorization', () => {
  it('maps execution actions to their owning customer runtime', () => {
    expect(getRequiredRuntimeForAction('writeFile')).toBe('coding');
    expect(getRequiredRuntimeForAction('createDocx')).toBe('office');
    expect(getRequiredRuntimeForAction('browseWeb')).toBe('browser');
    expect(getRequiredRuntimeForAction('startCommunicationCapture')).toBe('communication');
    expect(getRequiredRuntimeForAction('deployProject')).toBe('infrastructure');
  });

  it('does not classify Platform Runtime and autonomous bookkeeping as customer runtime execution', () => {
    expect(getRequiredRuntimeForAction('startAutonomousEngineeringTask')).toBeNull();
    expect(getRequiredRuntimeForAction('completeAutonomousEngineeringTask')).toBeNull();
    expect(getRequiredRuntimeForAction('endAutonomousEngineeringTask')).toBeNull();
  });

  it('rejects actions when the required runtime is not entitled', () => {
    const result = authorizeRuntimeAction('createDocx', {
      hasAdvancedRuntimes: true,
      isRuntimeEntitled: vi.fn(() => false),
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'entitlement-restricted',
      data: { runtimeId: 'office', actionType: 'createDocx' },
    });
  });

  it('requires both advanced runtime eligibility and a matching runtime entitlement', () => {
    expect(
      authorizeRuntimeAction('browseWeb', {
        hasAdvancedRuntimes: false,
        isRuntimeEntitled: vi.fn(() => true),
      })
    ).toMatchObject({ ok: false, reason: 'entitlement-restricted' });
    expect(
      authorizeRuntimeAction('browseWeb', {
        hasAdvancedRuntimes: true,
        isRuntimeEntitled: vi.fn((runtimeId) => runtimeId === 'browser'),
      })
    ).toBeNull();
  });
});
