import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-record-architectural-decision-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { recordArchitecturalDecisionPlugin } from './RecordArchitecturalDecisionPlugin';

describe('RecordArchitecturalDecisionPlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('requires a real decision and rationale, not empty strings', () => {
    const reqs = recordArchitecturalDecisionPlugin.requirements({
      type: 'recordArchitecturalDecision',
      rootPath: 'C:/fake/project',
      decision: '  ',
      rationale: '',
    });
    expect(reqs).toHaveLength(1);
  });

  it('records a real entity and returns its id', async () => {
    const result = await recordArchitecturalDecisionPlugin.execute({
      type: 'recordArchitecturalDecision',
      rootPath: 'C:/fake/project',
      decision: 'Use Zustand instead of Redux',
      rationale: 'Less boilerplate for this size of app',
      alternativesConsidered: ['Redux', 'Context API'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { id: string };
    const entity = memoryGraphStore.getEntity(data.id);
    expect(entity?.type).toBe('codingArchitecturalDecision');
  });
});
