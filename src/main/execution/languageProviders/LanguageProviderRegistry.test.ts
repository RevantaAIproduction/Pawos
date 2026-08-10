import { describe, expect, it } from 'vitest';
import { languageProviderRegistry } from './LanguageProviderRegistry';
import type { LanguageProvider } from './LanguageProvider';

function makeProvider(id: string, extensions: string[]): LanguageProvider {
  return {
    id,
    matchesFile: (filePath) => extensions.some((ext) => filePath.endsWith(ext)),
    extractImports: () => [],
  };
}

describe('LanguageProviderRegistry', () => {
  it('returns undefined when no registered provider matches the file', () => {
    const registry = languageProviderRegistry;
    expect(registry.getProviderForFile('foo.rb')).toBeUndefined();
  });

  it('dispatches to the first registered provider whose matchesFile() matches', () => {
    const registry = languageProviderRegistry;
    const a = makeProvider('test-lang-a', ['.testlangA']);
    const b = makeProvider('test-lang-b', ['.testlangB']);
    registry.registerProvider(a);
    registry.registerProvider(b);

    expect(registry.getProviderForFile('file.testlangA')).toBe(a);
    expect(registry.getProviderForFile('file.testlangB')).toBe(b);
    expect(registry.getProviderForFile('file.testlangC')).toBeUndefined();
  });

  it('a later registration for a distinct id does not evict an earlier one', () => {
    const registry = languageProviderRegistry;
    const c1 = makeProvider('test-lang-c', ['.testlangC']);
    registry.registerProvider(c1);
    expect(registry.list().some((p) => p.id === 'test-lang-c')).toBe(true);
  });
});
