import { describe, expect, it } from 'vitest';
import { buildCodeEditPlan, type ProposedFileEdit } from './CodeEditPlanner';

function makeEdit(overrides: Partial<ProposedFileEdit> = {}): ProposedFileEdit {
  return {
    path: 'src/a.ts',
    edits: [{ contextBefore: ['x'], oldLines: [], newLines: ['y'], contextAfter: [] }],
    rationale: 'A test edit.',
    ...overrides,
  };
}

describe('buildCodeEditPlan', () => {
  it('produces one proposed applyCodeEdit step per file edit, never executing anything itself', () => {
    const plan = buildCodeEditPlan('request-1', [makeEdit({ path: 'a.ts' }), makeEdit({ path: 'b.ts' })]);
    expect(plan.approvalRequired).toBe(true);
    expect(plan.sourceReportId).toBe('request-1');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps.every((s) => s.status === 'proposed')).toBe(true);
    expect(plan.steps.map((s) => s.actionRequest.type)).toEqual(['applyCodeEdit', 'applyCodeEdit']);
    expect(plan.unplannableFindingIds).toHaveLength(0);
  });

  it('carries the rationale and edits through unchanged into the step', () => {
    const edit = makeEdit({ path: 'src/foo.ts', rationale: 'Fixes a real bug.' });
    const plan = buildCodeEditPlan('request-2', [edit]);
    const step = plan.steps[0];
    expect(step?.rationale).toBe('Fixes a real bug.');
    expect(step?.findingRefs).toEqual([]);
    if (step?.actionRequest.type === 'applyCodeEdit') {
      expect(step.actionRequest.path).toBe('src/foo.ts');
      expect(step.actionRequest.edits).toEqual(edit.edits);
    } else {
      throw new Error('expected an applyCodeEdit step');
    }
  });

  it('returns an empty plan (no steps) for an empty batch, without throwing', () => {
    const plan = buildCodeEditPlan('request-3', []);
    expect(plan.steps).toHaveLength(0);
  });

  it('assigns each step a distinct id even for edits to the same file', () => {
    const plan = buildCodeEditPlan('request-4', [makeEdit(), makeEdit()]);
    expect(plan.steps[0]?.id).not.toBe(plan.steps[1]?.id);
  });

  it('threads the plan id into every step\'s applyCodeEdit request, so Coding Runtime Memory (§14) can tie a later execution back to this plan', () => {
    const plan = buildCodeEditPlan('request-5', [makeEdit({ path: 'a.ts' }), makeEdit({ path: 'b.ts' })]);
    for (const step of plan.steps) {
      if (step.actionRequest.type === 'applyCodeEdit') {
        expect(step.actionRequest.planId).toBe('request-5');
      } else {
        throw new Error('expected an applyCodeEdit step');
      }
    }
  });
});
