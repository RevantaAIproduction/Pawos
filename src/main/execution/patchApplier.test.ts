import { describe, expect, it } from 'vitest';
import { applyCodeEditHunks } from './patchApplier';
import type { CodeEditHunk } from '../../shared/actions/ActionTypes';

function hunk(overrides: Partial<CodeEditHunk> = {}): CodeEditHunk {
  return { contextBefore: [], oldLines: [], newLines: [], contextAfter: [], ...overrides };
}

describe('applyCodeEditHunks', () => {
  it('replaces a single line using surrounding context to anchor the location', () => {
    const original = ['function greet() {', "  console.log('hi');", '}'].join('\n');
    const result = applyCodeEditHunks(original, [
      hunk({ contextBefore: ['function greet() {'], oldLines: ["  console.log('hi');"], newLines: ["  console.log('hello');"], contextAfter: ['}'] }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newContent).toBe(['function greet() {', "  console.log('hello');", '}'].join('\n'));
  });

  it('applies a pure insertion (empty oldLines) anchored by context alone', () => {
    const original = ['const a = 1;', 'const b = 2;'].join('\n');
    const result = applyCodeEditHunks(original, [
      hunk({ contextBefore: ['const a = 1;'], oldLines: [], newLines: ['const aHalf = 1.5;'], contextAfter: ['const b = 2;'] }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newContent).toBe(['const a = 1;', 'const aHalf = 1.5;', 'const b = 2;'].join('\n'));
  });

  it('applies a pure deletion (empty newLines)', () => {
    const original = ['const a = 1;', 'const dead = 0;', 'const b = 2;'].join('\n');
    const result = applyCodeEditHunks(original, [
      hunk({ contextBefore: ['const a = 1;'], oldLines: ['const dead = 0;'], newLines: [], contextAfter: ['const b = 2;'] }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newContent).toBe(['const a = 1;', 'const b = 2;'].join('\n'));
  });

  it('applies multiple hunks to the same file, accounting for line-count drift between them', () => {
    const original = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');
    const result = applyCodeEditHunks(original, [
      hunk({ contextBefore: ['line1'], oldLines: ['line2'], newLines: ['line2a', 'line2b'], contextAfter: ['line3'] }),
      hunk({ contextBefore: ['line3'], oldLines: ['line4'], newLines: ['line4-changed'], contextAfter: ['line5'] }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newContent).toBe(['line1', 'line2a', 'line2b', 'line3', 'line4-changed', 'line5'].join('\n'));
  });

  it('fails honestly when the expected context/old lines are not found (file changed since the edit was written)', () => {
    const original = ['function greet() {', "  console.log('bye');", '}'].join('\n');
    const result = applyCodeEditHunks(original, [
      hunk({ contextBefore: ['function greet() {'], oldLines: ["  console.log('hi');"], newLines: ["  console.log('hello');"], contextAfter: ['}'] }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("Couldn't find");
  });

  it('fails when a hunk has no context or old lines to anchor its location', () => {
    const original = ['a', 'b', 'c'].join('\n');
    const result = applyCodeEditHunks(original, [hunk({ newLines: ['x'] })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('no surrounding context or old lines');
  });

  it('fails when hunks are given out of file order (second hunk anchors before the first)', () => {
    const original = ['line1', 'line2', 'line3', 'line4'].join('\n');
    const result = applyCodeEditHunks(original, [
      hunk({ contextBefore: ['line3'], oldLines: ['line4'], newLines: ['line4-changed'], contextAfter: [] }),
      hunk({ contextBefore: ['line1'], oldLines: ['line2'], newLines: ['line2-changed'], contextAfter: [] }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('fails when contextAfter does not actually match what follows in the real file', () => {
    const original = ['line1', 'line2', 'unexpected'].join('\n');
    const result = applyCodeEditHunks(original, [
      hunk({ contextBefore: ['line1'], oldLines: ['line2'], newLines: ['line2-changed'], contextAfter: ['line3-that-does-not-exist'] }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('fails when no edits are provided', () => {
    const result = applyCodeEditHunks('a\nb\nc', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('No edits were provided.');
  });
});
