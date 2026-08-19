import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findBuildOutputDir, OUTPUT_DIR_CANDIDATES } from './BuildProjectPlugin';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-build-plugin-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('BuildProjectPlugin — findBuildOutputDir', () => {
  it('returns null when no output directory and no package.json exist', () => {
    expect(findBuildOutputDir(tmpDir)).toBeNull();
  });

  it('finds a standard "dist" output directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'dist'));
    expect(findBuildOutputDir(tmpDir)).toBe('dist');
  });

  it('finds ".next" ahead of "dist" because it appears first in the candidate list', () => {
    fs.mkdirSync(path.join(tmpDir, '.next'));
    fs.mkdirSync(path.join(tmpDir, 'dist'));
    const result = findBuildOutputDir(tmpDir);
    expect(result).toBe(OUTPUT_DIR_CANDIDATES.find((c) => c === '.next' || c === 'dist'));
  });

  it('reads a custom outDir from package.json root-level outDir field', () => {
    const customOut = path.join(tmpDir, 'custom-output');
    fs.mkdirSync(customOut);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test', outDir: 'custom-output' }),
      'utf-8',
    );
    expect(findBuildOutputDir(tmpDir)).toBe('custom-output');
  });

  it('reads a custom outDir from package.json build.outDir field (Vite/CRA convention)', () => {
    const customOut = path.join(tmpDir, 'vite-output');
    fs.mkdirSync(customOut);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test', build: { outDir: 'vite-output' } }),
      'utf-8',
    );
    expect(findBuildOutputDir(tmpDir)).toBe('vite-output');
  });

  it('reads a custom outputPath from package.json (webpack convention)', () => {
    const customOut = path.join(tmpDir, 'webpack-out');
    fs.mkdirSync(customOut);
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test', outputPath: 'webpack-out' }),
      'utf-8',
    );
    expect(findBuildOutputDir(tmpDir)).toBe('webpack-out');
  });

  it('falls back to candidate list when package.json outDir field does not yet exist on disk', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test', outDir: 'nonexistent-dir' }),
      'utf-8',
    );
    fs.mkdirSync(path.join(tmpDir, 'build'));
    expect(findBuildOutputDir(tmpDir)).toBe('build');
  });

  it('returns null when package.json exists but outDir is absent and no standard dir exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }), 'utf-8');
    expect(findBuildOutputDir(tmpDir)).toBeNull();
  });

  it('returns null gracefully when package.json contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), 'NOT VALID JSON', 'utf-8');
    expect(findBuildOutputDir(tmpDir)).toBeNull();
  });
});
