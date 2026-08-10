import { describe, expect, it } from 'vitest';
import { typeScriptLanguageProvider } from './TypeScriptLanguageProvider';

describe('TypeScriptLanguageProvider', () => {
  describe('matchesFile', () => {
    it('matches known JS/TS extensions', () => {
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
        expect(typeScriptLanguageProvider.matchesFile(`foo${ext}`)).toBe(true);
      }
    });

    it('does not match unrelated extensions', () => {
      expect(typeScriptLanguageProvider.matchesFile('foo.py')).toBe(false);
      expect(typeScriptLanguageProvider.matchesFile('foo.json')).toBe(false);
    });
  });

  describe('extractImports', () => {
    it('extracts ES module import specifiers', () => {
      const content = `import React from 'react';\nimport { foo } from './foo';\nimport bar from "../bar";\n`;
      const specifiers = typeScriptLanguageProvider.extractImports(content, 'src/index.ts');
      expect(specifiers).toContain('react');
      expect(specifiers).toContain('./foo');
      expect(specifiers).toContain('../bar');
    });

    it('extracts require() specifiers', () => {
      const content = `const path = require('path');\nconst { thing } = require('./thing');\n`;
      const specifiers = typeScriptLanguageProvider.extractImports(content, 'src/index.js');
      expect(specifiers).toContain('path');
      expect(specifiers).toContain('./thing');
    });

    it('returns an empty array rather than throwing on unparseable content', () => {
      const specifiers = typeScriptLanguageProvider.extractImports('{{{ not real code [[[', 'src/broken.ts');
      expect(Array.isArray(specifiers)).toBe(true);
    });
  });

  describe('extractExports', () => {
    it('detects named function/class/const exports', () => {
      const content = `export function doThing() {}\nexport class Widget {}\nexport const value = 1;\n`;
      const names = typeScriptLanguageProvider.extractExports!(content, 'src/index.ts');
      expect(names).toEqual(expect.arrayContaining(['doThing', 'Widget', 'value']));
    });

    it('detects export { } brace lists, including renames', () => {
      const content = `const a = 1;\nconst b = 2;\nexport { a, b as renamedB };\n`;
      const names = typeScriptLanguageProvider.extractExports!(content, 'src/index.ts');
      expect(names).toEqual(expect.arrayContaining(['a', 'renamedB']));
    });

    it('detects a bare export default', () => {
      const content = `const widget = {};\nexport default widget;\n`;
      const names = typeScriptLanguageProvider.extractExports!(content, 'src/index.ts');
      expect(names).toContain('default');
    });
  });

  describe('detectRouteCandidates', () => {
    it('detects a Next.js app-router page from its path', () => {
      const candidates = typeScriptLanguageProvider.detectRouteCandidates!('', 'app/dashboard/settings/page.tsx', 'Next.js');
      expect(candidates.some((c) => c.httpPath === '/dashboard/settings')).toBe(true);
    });

    it('detects a Next.js pages-router API route from its path', () => {
      const candidates = typeScriptLanguageProvider.detectRouteCandidates!('', 'pages/api/users/[id].ts', 'Next.js');
      expect(candidates.some((c) => c.httpPath === '/api/users/[id]')).toBe(true);
    });

    it('detects Express router method calls from file content', () => {
      const content = `router.get('/widgets', handler);\nrouter.post('/widgets', createHandler);\n`;
      const candidates = typeScriptLanguageProvider.detectRouteCandidates!(content, 'src/routes/widgets.ts', null);
      expect(candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ httpPath: '/widgets', method: 'GET' }),
          expect.objectContaining({ httpPath: '/widgets', method: 'POST' }),
        ])
      );
    });
  });

  describe('syntaxCheck', () => {
    it('reports ok:true for syntactically valid TypeScript', () => {
      const result = typeScriptLanguageProvider.syntaxCheck!('const x: number = 1;\nexport default x;\n', 'src/valid.ts');
      expect(result.ok).toBe(true);
    });

    it('reports ok:false with a message for syntactically invalid content', () => {
      const result = typeScriptLanguageProvider.syntaxCheck!('const x = {{{{;;;', 'src/broken.ts');
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });
});
