import { describe, expect, it, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadTsPaths, resolveExisting, resolveAliasSpecifier, resolveSpecifier } from './importResolution';

describe('importResolution', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-import-resolution-test-'));
    fs.mkdirSync(path.join(root, 'src', 'utils'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'utils', 'helper.ts'), 'export const x = 1;\n', 'utf-8');
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export {};\n', 'utf-8');
    fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'lib', 'index.ts'), 'export const y = 2;\n', 'utf-8');
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@utils/*': ['src/utils/*'] } } }),
      'utf-8'
    );
  });

  describe('loadTsPaths', () => {
    it('reads real paths mapping from tsconfig.json', () => {
      const tsPaths = loadTsPaths(root);
      expect(tsPaths?.paths['@utils/*']).toEqual(['src/utils/*']);
    });

    it('returns null when tsconfig.json has no paths mapping', () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-no-tsconfig-'));
      expect(loadTsPaths(other)).toBeNull();
    });
  });

  describe('resolveExisting', () => {
    it('resolves a bare path by trying real extension suffixes', () => {
      const resolved = resolveExisting(path.join(root, 'src', 'utils', 'helper'));
      expect(resolved).toBe(path.join(root, 'src', 'utils', 'helper.ts'));
    });

    it('resolves a directory to its real index file', () => {
      const resolved = resolveExisting(path.join(root, 'src', 'lib'));
      // The index-suffix candidate is built via string concatenation (`candidate + '/index.ts'`),
      // not path.join, so on Windows the result mixes the platform separator with a literal '/' —
      // this is the original, already-working behavior verbatim, not something this extraction
      // changed; fs.existsSync/statSync resolve mixed separators fine.
      expect(resolved).toBe(`${path.join(root, 'src', 'lib')}/index.ts`);
      expect(fs.existsSync(resolved!)).toBe(true);
    });

    it('returns null for a path that resolves to nothing real', () => {
      expect(resolveExisting(path.join(root, 'src', 'nonexistent'))).toBeNull();
    });
  });

  describe('resolveAliasSpecifier', () => {
    it('resolves a real alias to its mapped directory', () => {
      const tsPaths = loadTsPaths(root);
      const resolved = resolveAliasSpecifier('@utils/helper', tsPaths);
      expect(resolved).toBe(path.join(root, 'src', 'utils', 'helper'));
    });

    it('returns null for a specifier that matches no alias pattern', () => {
      const tsPaths = loadTsPaths(root);
      expect(resolveAliasSpecifier('react', tsPaths)).toBeNull();
    });

    it('returns null when there is no tsPaths config at all', () => {
      expect(resolveAliasSpecifier('@utils/helper', null)).toBeNull();
    });
  });

  describe('resolveSpecifier', () => {
    it('resolves a real relative import from the importing file', () => {
      const fromFile = path.join(root, 'src', 'index.ts');
      const resolved = resolveSpecifier(fromFile, './utils/helper', root, null);
      expect(resolved).toBe(path.join(root, 'src', 'utils', 'helper.ts'));
    });

    it('resolves a real alias import via tsconfig paths', () => {
      const fromFile = path.join(root, 'src', 'index.ts');
      const tsPaths = loadTsPaths(root);
      const resolved = resolveSpecifier(fromFile, '@utils/helper', root, tsPaths);
      expect(resolved).toBe(path.join(root, 'src', 'utils', 'helper.ts'));
    });

    it('returns null for a bare package specifier with no alias mapping (an external npm package)', () => {
      const fromFile = path.join(root, 'src', 'index.ts');
      expect(resolveSpecifier(fromFile, 'react', root, null)).toBeNull();
    });

    it('returns null for a broken relative import that points at nothing real', () => {
      const fromFile = path.join(root, 'src', 'index.ts');
      expect(resolveSpecifier(fromFile, './does-not-exist', root, null)).toBeNull();
    });

    it('never resolves outside the project root, even if the path technically exists there', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-outside-root-'));
      fs.writeFileSync(path.join(outsideDir, 'leaked.ts'), 'export {};\n', 'utf-8');
      const fromFile = path.join(root, 'src', 'index.ts');
      const relativeEscape = path.relative(path.join(root, 'src'), path.join(outsideDir, 'leaked'));
      expect(resolveSpecifier(fromFile, `./${relativeEscape.replace(/\\/g, '/')}`, root, null)).toBeNull();
    });
  });
});
