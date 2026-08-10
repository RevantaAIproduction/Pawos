import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkSyntax } from './SyntaxCheck';
import { languageProviderRegistry } from '../languageProviders/LanguageProviderRegistry';
import { typeScriptLanguageProvider } from '../languageProviders/TypeScriptLanguageProvider';

languageProviderRegistry.registerProvider(typeScriptLanguageProvider);

describe('checkSyntax', () => {
  let dir: string;

  function write(name: string, content: string): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content, 'utf-8');
    return p;
  }

  it('passes when every file in scope is syntactically valid', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-syntax-check-test-'));
    const a = write('a.ts', 'export const x = 1;\n');
    const b = write('b.ts', 'export const y = 2;\n');
    const result = checkSyntax([a, b]);
    expect(result.status).toBe('passed');
  });

  it('fails and names the exact broken file on a real syntax error', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-syntax-check-test-'));
    const good = write('good.ts', 'export const x = 1;\n');
    const bad = write('bad.ts', 'export const x = ;;;(\n');
    const result = checkSyntax([good, bad]);
    expect(result.status).toBe('failed');
    expect(result.affectedFiles).toEqual([bad]);
    expect(result.errorDetail).toBeTruthy();
  });

  it('skips honestly when no file in scope has a matching language provider', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-syntax-check-test-'));
    const txt = write('notes.txt', 'just some text\n');
    const result = checkSyntax([txt]);
    expect(result.status).toBe('skipped');
  });

  it('skips honestly for an empty scope', () => {
    const result = checkSyntax([]);
    expect(result.status).toBe('skipped');
  });
});
