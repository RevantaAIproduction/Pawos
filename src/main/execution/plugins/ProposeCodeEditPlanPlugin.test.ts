import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-propose-code-edit-plan-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { proposeCodeEditPlanPlugin } from './ProposeCodeEditPlanPlugin';
import { CODING_EXECUTION_ACTION_TYPES } from '../../../shared/actions/ActionTypes';
import type { ExecutionPlan } from '../../../shared/actions/ExecutionLifecycle';

describe('ProposeCodeEditPlanPlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('is gated alongside every other real mutating coding action', () => {
    expect(CODING_EXECUTION_ACTION_TYPES).toContain('proposeCodeEditPlan');
  });

  it('surfaces a requirement when no edits are given', () => {
    const reqs = proposeCodeEditPlanPlugin.requirements({ type: 'proposeCodeEditPlan', description: 'x', edits: [] });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.id).toBe('no-edits');
  });

  it('surfaces a requirement when a file entry has no actual hunks', () => {
    const reqs = proposeCodeEditPlanPlugin.requirements({
      type: 'proposeCodeEditPlan',
      description: 'x',
      edits: [{ path: 'a.ts', edits: [], rationale: 'r' }],
    });
    expect(reqs[0]?.id).toBe('empty-file-edit');
  });

  it('records a real codingEditRequest entity and returns a reviewable plan, never executing anything itself', async () => {
    const result = await proposeCodeEditPlanPlugin.execute({
      type: 'proposeCodeEditPlan',
      description: 'Rename a variable across two files',
      edits: [
        { path: 'a.ts', edits: [{ contextBefore: ['x'], oldLines: [], newLines: ['y'], contextAfter: [] }], rationale: 'Rename in a.ts' },
        { path: 'b.ts', edits: [{ contextBefore: ['x'], oldLines: [], newLines: ['y'], contextAfter: [] }], rationale: 'Rename in b.ts' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan = result.data as ExecutionPlan;
    expect(plan.approvalRequired).toBe(true);
    expect(plan.steps).toHaveLength(2);
    expect(plan.sourceReportId).toBeTruthy();

    const requestEntity = memoryGraphStore.getEntity(plan.sourceReportId);
    expect(requestEntity).toBeDefined();
    expect(requestEntity?.type).toBe('codingEditRequest');
  });

  it('fails honestly when no edits are given at execution time', async () => {
    const result = await proposeCodeEditPlanPlugin.execute({ type: 'proposeCodeEditPlan', description: 'x', edits: [] });
    expect(result.ok).toBe(false);
  });
});
