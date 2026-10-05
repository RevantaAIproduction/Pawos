import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ shell: { openExternal: async () => undefined } }));
import { isPawosMailto } from './OpenUrlPlugin';

describe('openUrl email links', () => {
  it('opens an email to PawOS sales', () => {
    expect(isPawosMailto('mailto:sales@revantaai.com?subject=PawOS%20Team%20plan%20inquiry')).toBe(true);
  });
  it('never to any other address', () => {
    expect(isPawosMailto('mailto:someone@example.com')).toBe(false);
    expect(isPawosMailto('mailto:sales@revantaai.com.evil.com')).toBe(false);
    expect(isPawosMailto('mailto:a@revantaai.com,b@example.com')).toBe(false);
  });
});
