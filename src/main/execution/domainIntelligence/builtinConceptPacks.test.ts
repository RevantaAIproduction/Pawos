import { describe, expect, it } from 'vitest';
import { authConceptPack, billingConceptPack, crudResourceConceptPack } from './builtinConceptPacks';
import type { DomainConceptDetectionInput } from './DomainConceptRegistry';

function makeInput(overrides: Partial<DomainConceptDetectionInput> = {}): DomainConceptDetectionInput {
  return {
    dependencies: {},
    filePaths: [],
    routeCandidates: [],
    ...overrides,
  };
}

describe('authConceptPack', () => {
  it('returns null when neither a matching dependency nor a matching path exists', () => {
    const input = makeInput({ dependencies: { react: '18.0.0' }, filePaths: ['src/App.tsx'] });
    expect(authConceptPack.detect(input)).toBeNull();
  });

  it('matches on a real auth dependency alone', () => {
    const input = makeInput({ dependencies: { 'next-auth': '5.0.0' } });
    const match = authConceptPack.detect(input);
    expect(match?.conceptId).toBe('auth');
    expect(match?.evidence).toContain('next-auth');
    expect(match?.confidence).toBe(0.6);
  });

  it('matches on a real auth-convention path alone', () => {
    const input = makeInput({ filePaths: ['src/auth/login.ts', 'src/App.tsx'] });
    const match = authConceptPack.detect(input);
    expect(match?.conceptId).toBe('auth');
    expect(match?.files).toEqual(['src/auth/login.ts']);
    expect(match?.confidence).toBe(0.4);
  });

  it('reports higher confidence when both a dependency and a path match', () => {
    const input = makeInput({ dependencies: { passport: '0.6.0' }, filePaths: ['src/auth/session.ts'] });
    const match = authConceptPack.detect(input);
    expect(match?.confidence).toBe(0.8);
  });
});

describe('billingConceptPack', () => {
  it('returns null with no billing evidence', () => {
    expect(billingConceptPack.detect(makeInput())).toBeNull();
  });

  it('matches on the stripe dependency', () => {
    const match = billingConceptPack.detect(makeInput({ dependencies: { stripe: '14.0.0' } }));
    expect(match?.conceptId).toBe('billing');
    expect(match?.evidence).toContain('stripe');
  });

  it('matches on a billing/subscription/payment path convention', () => {
    const match = billingConceptPack.detect(makeInput({ filePaths: ['app/billing/checkout.tsx'] }));
    expect(match?.conceptId).toBe('billing');
    expect(match?.files).toEqual(['app/billing/checkout.tsx']);
  });
});

describe('crudResourceConceptPack', () => {
  it('returns null when only 3 of the 4 required methods are present at a path', () => {
    const input = makeInput({
      routeCandidates: [
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'GET' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'POST' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'PUT' },
      ],
    });
    expect(crudResourceConceptPack.detect(input)).toBeNull();
  });

  it('matches when a full GET+POST+PUT+DELETE quad exists at the same path', () => {
    const input = makeInput({
      routeCandidates: [
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'GET' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'POST' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'PUT' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'DELETE' },
      ],
    });
    const match = crudResourceConceptPack.detect(input);
    expect(match?.conceptId).toBe('crudResource');
    expect(match?.files).toEqual(['src/routes/widgets.ts']);
    expect(match?.evidence).toContain('/widgets');
  });

  it('detects independent quads at two different paths and reports both', () => {
    const input = makeInput({
      routeCandidates: [
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'GET' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'POST' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'PUT' },
        { filePath: 'src/routes/widgets.ts', httpPath: '/widgets', method: 'DELETE' },
        { filePath: 'src/routes/gadgets.ts', httpPath: '/gadgets', method: 'GET' },
        { filePath: 'src/routes/gadgets.ts', httpPath: '/gadgets', method: 'POST' },
        { filePath: 'src/routes/gadgets.ts', httpPath: '/gadgets', method: 'PUT' },
        { filePath: 'src/routes/gadgets.ts', httpPath: '/gadgets', method: 'DELETE' },
      ],
    });
    const match = crudResourceConceptPack.detect(input);
    expect(match?.files.sort()).toEqual(['src/routes/gadgets.ts', 'src/routes/widgets.ts']);
    expect(match?.evidence).toContain('2 paths');
  });

  it('never matches a route candidate with no method (e.g. a Next.js app-router route.ts file)', () => {
    const input = makeInput({
      routeCandidates: [{ filePath: 'app/api/widgets/route.ts', httpPath: '/api/widgets' }],
    });
    expect(crudResourceConceptPack.detect(input)).toBeNull();
  });
});
