import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findProjectRootFor } from './findProjectRoot';

describe('findProjectRootFor', () => {
  it('finds the nearest ancestor package.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-find-project-root-test-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{}', 'utf-8');
    const nested = path.join(root, 'src', 'components');
    fs.mkdirSync(nested, { recursive: true });
    const file = path.join(nested, 'Button.tsx');
    fs.writeFileSync(file, 'export {};', 'utf-8');

    expect(findProjectRootFor(file)).toBe(root);
  });

  it('finds the closest package.json in a nested-project (monorepo-like) layout, not a farther one', () => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-find-project-root-test-'));
    fs.writeFileSync(path.join(outer, 'package.json'), '{}', 'utf-8');
    const inner = path.join(outer, 'packages', 'app');
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, 'package.json'), '{}', 'utf-8');
    const file = path.join(inner, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export {};', 'utf-8');

    expect(findProjectRootFor(file)).toBe(inner);
  });

  it('returns null, never a fabricated root, when no package.json exists in any ancestor within the depth cap', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-find-project-root-test-no-pkg-'));
    const file = path.join(root, 'orphan.ts');
    fs.writeFileSync(file, 'export {};', 'utf-8');

    expect(findProjectRootFor(file)).toBeNull();
  });
});
