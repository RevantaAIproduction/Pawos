import { describe, expect, it } from 'vitest';
import { domainConceptRegistry } from './DomainConceptRegistry';
import type { DomainConceptPack } from './DomainConceptRegistry';

function makePack(id: string, label: string, matches: boolean): DomainConceptPack {
  return {
    id,
    label,
    detect: () => (matches ? { conceptId: id, label, files: [], evidence: 'test evidence', confidence: 0.5 } : null),
  };
}

describe('DomainConceptRegistry', () => {
  it('returns undefined for an id nothing has registered', () => {
    expect(domainConceptRegistry.getPack('test-concept-nonexistent')).toBeUndefined();
  });

  it('registers a pack and retrieves it by id', () => {
    const pack = makePack('test-concept-a', 'Test A', true);
    domainConceptRegistry.registerPack(pack);
    expect(domainConceptRegistry.getPack('test-concept-a')).toBe(pack);
  });

  it('a later registration for a distinct id does not evict an earlier one', () => {
    const a = makePack('test-concept-b', 'Test B', true);
    const b = makePack('test-concept-c', 'Test C', true);
    domainConceptRegistry.registerPack(a);
    domainConceptRegistry.registerPack(b);
    expect(domainConceptRegistry.list().some((p) => p.id === 'test-concept-b')).toBe(true);
    expect(domainConceptRegistry.list().some((p) => p.id === 'test-concept-c')).toBe(true);
  });

  it('re-registering the same id replaces the prior pack rather than duplicating it', () => {
    const first = makePack('test-concept-d', 'First', true);
    const second = makePack('test-concept-d', 'Second', true);
    domainConceptRegistry.registerPack(first);
    domainConceptRegistry.registerPack(second);
    expect(domainConceptRegistry.getPack('test-concept-d')).toBe(second);
    expect(domainConceptRegistry.list().filter((p) => p.id === 'test-concept-d')).toHaveLength(1);
  });
});
