import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-apply-code-edit-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import { typeScriptLanguageProvider } from '../languageProviders/TypeScriptLanguageProvider';
import { applyCodeEditPlugin } from './ApplyCodeEditPlugin';
import { queryCodingEditHistory } from '../../memory/entities/codingRuntimeMemoryEntities';
import { findCodeFile } from '../../memory/entities/codingFeatureEntities';
import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';

languageProviderRegistry.registerProvider(typeScriptLanguageProvider);

function makeRequest(overrides: Partial<Extract<ActionRequest, { type: 'applyCodeEdit' }>> = {}): ActionRequest {
  return {
    type: 'applyCodeEdit',
    path: overrides.path ?? '',
    edits: overrides.edits ?? [],
    confirmed: overrides.confirmed,
  };
}

describe('ApplyCodeEditPlugin', () => {
  let workDir: string;

  beforeAll(() => {
    memoryGraphStore.init();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-apply-code-edit-target-'));
  });

  function writeTarget(name: string, content: string): string {
    const p = path.join(workDir, name);
    fs.writeFileSync(p, content, 'utf-8');
    return p;
  }

  describe('requirements', () => {
    it('flags a missing file', () => {
      const reqs = applyCodeEditPlugin.requirements(makeRequest({ path: path.join(workDir, 'nope.txt'), edits: [{ contextBefore: ['a'], oldLines: [], newLines: ['b'], contextAfter: [] }] }));
      expect(reqs).toHaveLength(1);
      expect(reqs[0]?.id).toBe('file-missing');
    });

    it('flags an empty edits array', () => {
      const p = writeTarget('a.txt', 'hello\n');
      const reqs = applyCodeEditPlugin.requirements(makeRequest({ path: p, edits: [] }));
      expect(reqs[0]?.id).toBe('no-edits');
    });

    it('flags a hunk with no anchor', () => {
      const p = writeTarget('b.txt', 'hello\n');
      const reqs = applyCodeEditPlugin.requirements(makeRequest({ path: p, edits: [{ contextBefore: [], oldLines: [], newLines: ['x'], contextAfter: [] }] }));
      expect(reqs[0]?.id).toBe('no-anchor');
    });

    it('passes with a valid, anchored edit on an existing file', () => {
      const p = writeTarget('c.txt', 'hello\n');
      const reqs = applyCodeEditPlugin.requirements(makeRequest({ path: p, edits: [{ contextBefore: ['hello'], oldLines: [], newLines: ['world'], contextAfter: [] }] }));
      expect(reqs).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('fails when the target file does not exist', async () => {
      const result = await applyCodeEditPlugin.execute(
        makeRequest({ path: path.join(workDir, 'missing.txt'), edits: [{ contextBefore: ['a'], oldLines: [], newLines: ['b'], contextAfter: [] }], confirmed: true })
      );
      expect(result.ok).toBe(false);
    });

    it('requires confirmation before touching an existing file', async () => {
      const p = writeTarget('confirm.txt', 'line1\nline2\n');
      const result = await applyCodeEditPlugin.execute(
        makeRequest({ path: p, edits: [{ contextBefore: ['line1'], oldLines: ['line2'], newLines: ['line2-changed'], contextAfter: [] }] })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('requires-confirmation');
      expect(fs.readFileSync(p, 'utf-8')).toBe('line1\nline2\n');
    });

    it('applies a confirmed edit and writes the real new content to disk', async () => {
      const p = writeTarget('apply.ts', "export const a = 1;\nexport const b = 2;\n");
      const result = await applyCodeEditPlugin.execute(
        makeRequest({
          path: p,
          confirmed: true,
          edits: [{ contextBefore: ['export const a = 1;'], oldLines: ['export const b = 2;'], newLines: ['export const b = 3;'], contextAfter: [] }],
        })
      );
      expect(result.ok).toBe(true);
      expect(fs.readFileSync(p, 'utf-8')).toBe('export const a = 1;\nexport const b = 3;\n');
    });

    it('fails honestly, leaving the file untouched, when the expected context no longer matches', async () => {
      const p = writeTarget('stale.txt', 'actual content\n');
      const result = await applyCodeEditPlugin.execute(
        makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['stale expectation'], oldLines: [], newLines: ['x'], contextAfter: [] }] })
      );
      expect(result.ok).toBe(false);
      expect(fs.readFileSync(p, 'utf-8')).toBe('actual content\n');
    });
  });

  describe('verify', () => {
    it('passes and reports syntaxChecked:true for a syntactically valid .ts file', async () => {
      const p = writeTarget('valid.ts', 'export const x = 1;\n');
      const request = makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['export const x = 1;'], oldLines: [], newLines: ['export const y = 2;'], contextAfter: [] }] });
      const execResult = await applyCodeEditPlugin.execute(request);
      const verified = await applyCodeEditPlugin.verify(request, execResult);
      expect(verified.ok).toBe(true);
      expect((verified.data as { syntaxChecked: boolean }).syntaxChecked).toBe(true);
    });

    it('catches a real syntax error introduced by the edit', async () => {
      const p = writeTarget('broken.ts', 'export const x = 1;\n');
      const request = makeRequest({
        path: p,
        confirmed: true,
        edits: [{ contextBefore: [], oldLines: ['export const x = 1;'], newLines: ['export const x = ;;;('], contextAfter: [] }],
      });
      const execResult = await applyCodeEditPlugin.execute(request);
      expect(execResult.ok).toBe(true);
      const verified = await applyCodeEditPlugin.verify(request, execResult);
      expect(verified.ok).toBe(false);
    });

    it('skips the syntax check honestly for a file with no matching language provider', async () => {
      const p = writeTarget('plain.xyz', 'hello\n');
      const request = makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['hello'], oldLines: [], newLines: ['world'], contextAfter: [] }] });
      const execResult = await applyCodeEditPlugin.execute(request);
      const verified = await applyCodeEditPlugin.verify(request, execResult);
      expect(verified.ok).toBe(true);
      expect((verified.data as { syntaxChecked: boolean }).syntaxChecked).toBe(false);
    });

    it('fails when the file on disk no longer matches what was written', async () => {
      const p = writeTarget('raced.txt', 'hello\n');
      const request = makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['hello'], oldLines: [], newLines: ['world'], contextAfter: [] }] });
      const execResult = await applyCodeEditPlugin.execute(request);
      fs.writeFileSync(p, 'something else entirely\n', 'utf-8');
      const verified = await applyCodeEditPlugin.verify(request, execResult as ActionResult);
      expect(verified.ok).toBe(false);
    });
  });

  describe('Coding Runtime Memory (§14) auto-record', () => {
    it('records a codingEditHistory entry after a real successful verify(), tied to the real project root', async () => {
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-apply-code-edit-memory-project-'));
      fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf-8');
      const p = path.join(projectRoot, 'memory.ts');
      fs.writeFileSync(p, 'export const x = 1;\n', 'utf-8');

      const request = makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['export const x = 1;'], oldLines: [], newLines: ['export const y = 2;'], contextAfter: [] }] });
      const execResult = await applyCodeEditPlugin.execute(request);
      const verified = await applyCodeEditPlugin.verify(request, execResult);
      expect(verified.ok).toBe(true);

      const history = queryCodingEditHistory(projectRoot);
      expect(history).toHaveLength(1);
      expect((history[0]?.attributes as { filesChanged: string[] }).filesChanged).toEqual([path.relative(projectRoot, p)]);
    });

    it('threads planId through when the applyCodeEdit request carries one', async () => {
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-apply-code-edit-memory-planid-'));
      fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf-8');
      const p = path.join(projectRoot, 'planid.ts');
      fs.writeFileSync(p, 'export const x = 1;\n', 'utf-8');

      const request: ActionRequest = {
        type: 'applyCodeEdit',
        path: p,
        confirmed: true,
        planId: 'plan-123',
        edits: [{ contextBefore: ['export const x = 1;'], oldLines: [], newLines: ['export const y = 2;'], contextAfter: [] }],
      };
      const execResult = await applyCodeEditPlugin.execute(request);
      await applyCodeEditPlugin.verify(request, execResult);

      const history = queryCodingEditHistory(projectRoot);
      expect((history[0]?.attributes as { planId?: string }).planId).toBe('plan-123');
    });

    it('links to the same codeFile entity Feature Discovery would use (root-relative path), not a disconnected absolute-path duplicate', async () => {
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-apply-code-edit-memory-codefile-'));
      fs.writeFileSync(path.join(projectRoot, 'package.json'), '{}', 'utf-8');
      const p = path.join(projectRoot, 'src', 'shared.ts');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'export const x = 1;\n', 'utf-8');

      const request = makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['export const x = 1;'], oldLines: [], newLines: ['export const y = 2;'], contextAfter: [] }] });
      const execResult = await applyCodeEditPlugin.execute(request);
      await applyCodeEditPlugin.verify(request, execResult);

      // Normalized to forward slashes, matching FeatureMapBuilder's normalizeRel convention —
      // ApplyCodeEditPlugin applies the same normalization so this nested path (which contains a
      // real separator on Windows) resolves to the same codeFile entity Feature Discovery would use.
      const relativePath = path.relative(projectRoot, p).replace(/\\/g, '/');
      expect(findCodeFile(projectRoot, relativePath)).toBeDefined();
      expect(findCodeFile(projectRoot, p)).toBeUndefined();
    });

    it('does not record anything for a file with no package.json ancestor, rather than fabricating a project root', async () => {
      const orphanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-apply-code-edit-orphan-'));
      const p = path.join(orphanDir, 'orphan.ts');
      fs.writeFileSync(p, 'export const x = 1;\n', 'utf-8');

      const request = makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['export const x = 1;'], oldLines: [], newLines: ['export const y = 2;'], contextAfter: [] }] });
      const execResult = await applyCodeEditPlugin.execute(request);
      const verified = await applyCodeEditPlugin.verify(request, execResult);
      expect(verified.ok).toBe(true);
      expect(queryCodingEditHistory(orphanDir)).toHaveLength(0);
    });
  });

  describe('recover', () => {
    it('does not blindly retry a genuine content-mismatch failure', async () => {
      const p = writeTarget('norecover.txt', 'actual\n');
      const request = makeRequest({ path: p, confirmed: true, edits: [{ contextBefore: ['not the real content'], oldLines: [], newLines: ['x'], contextAfter: [] }] });
      const result = await applyCodeEditPlugin.execute(request);
      expect(result.ok).toBe(false);
      const recovered = await applyCodeEditPlugin.recover(request, result);
      expect(recovered.ok).toBe(false);
      expect(fs.readFileSync(p, 'utf-8')).toBe('actual\n');
    });
  });
});
