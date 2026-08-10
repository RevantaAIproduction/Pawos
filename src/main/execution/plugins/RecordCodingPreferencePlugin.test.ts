import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-record-coding-preference-plugin-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { recordCodingPreferencePlugin } from './RecordCodingPreferencePlugin';

describe('RecordCodingPreferencePlugin', () => {
  beforeAll(() => memoryGraphStore.init());

  it('requires a project root when scope is project', () => {
    const reqs = recordCodingPreferencePlugin.requirements({
      type: 'recordCodingPreference',
      preferenceScope: 'project',
      preferenceKey: 'exportStyle',
      preferenceValue: 'named',
    });
    expect(reqs).toHaveLength(1);
  });

  it('does not require a project root when scope is global', () => {
    const reqs = recordCodingPreferencePlugin.requirements({
      type: 'recordCodingPreference',
      preferenceScope: 'global',
      preferenceKey: 'testFramework',
      preferenceValue: 'vitest',
    });
    expect(reqs).toHaveLength(0);
  });

  it('fails honestly at execute() too if a project scope is missing its root', async () => {
    const result = await recordCodingPreferencePlugin.execute({
      type: 'recordCodingPreference',
      preferenceScope: 'project',
      preferenceKey: 'exportStyle',
      preferenceValue: 'named',
    });
    expect(result.ok).toBe(false);
  });

  it('records a real project-scoped preference', async () => {
    const result = await recordCodingPreferencePlugin.execute({
      type: 'recordCodingPreference',
      preferenceScope: 'project',
      preferenceKey: 'exportStyle',
      preferenceValue: 'named',
      rootPath: 'C:/fake/pref-project',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entity = memoryGraphStore.getEntity((result.data as { id: string }).id);
    expect(entity?.type).toBe('codingUserPreference');
  });
});
