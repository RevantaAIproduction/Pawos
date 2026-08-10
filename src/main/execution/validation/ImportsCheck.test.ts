import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkImports } from './ImportsCheck';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import { typeScriptLanguageProvider } from '../languageProviders/TypeScriptLanguageProvider';

languageProviderRegistry.registerProvider(typeScriptLanguageProvider);

describe('checkImports', () => {
  it('passes when every relative import resolves to a real file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-imports-check-test-'));
    fs.writeFileSync(path.join(root, 'helper.ts'), 'export const helper = 1;\n', 'utf-8');
    const entry = path.join(root, 'index.ts');
    fs.writeFileSync(entry, "import { helper } from './helper';\nexport { helper };\n", 'utf-8');
    const result = checkImports(root, [entry]);
    expect(result.status).toBe('passed');
  });

  it('fails and names the broken relative import when it points at nothing real', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-imports-check-test-'));
    const entry = path.join(root, 'index.ts');
    fs.writeFileSync(entry, "import { helper } from './does-not-exist';\n", 'utf-8');
    const result = checkImports(root, [entry]);
    expect(result.status).toBe('failed');
    expect(result.errorDetail).toContain('./does-not-exist');
    expect(result.affectedFiles).toEqual([entry]);
  });

  it('never flags a bare/external package specifier as broken (avoids false positives)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-imports-check-test-'));
    const entry = path.join(root, 'index.ts');
    fs.writeFileSync(entry, "import React from 'react';\nimport { z } from '@scope/pkg';\n", 'utf-8');
    const result = checkImports(root, [entry]);
    expect(result.status).toBe('passed');
  });

  it('skips honestly when no file in scope has a matching language provider', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-imports-check-test-'));
    const txt = path.join(root, 'notes.txt');
    fs.writeFileSync(txt, 'hello\n', 'utf-8');
    const result = checkImports(root, [txt]);
    expect(result.status).toBe('skipped');
  });
});
