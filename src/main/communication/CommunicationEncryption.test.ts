import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let encryptionAvailable = true;
const wrappedStore = new Map<string, string>();

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value: string) => {
      const token = `wrapped:${value}`;
      return Buffer.from(token, 'utf-8');
    },
    decryptString: (buffer: Buffer) => {
      const token = buffer.toString('utf-8');
      if (!token.startsWith('wrapped:')) throw new Error('corrupt');
      return token.slice('wrapped:'.length);
    },
  },
}));

import {
  isEncryptionAvailable,
  generateSessionKey,
  wrapSessionKey,
  unwrapSessionKey,
  encryptFrame,
  decryptFramedBuffer,
  completeFrameBoundary,
} from './CommunicationEncryption';

beforeEach(() => {
  encryptionAvailable = true;
  wrappedStore.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommunicationEncryption', () => {
  it('isEncryptionAvailable reflects safeStorage', () => {
    expect(isEncryptionAvailable()).toBe(true);
    encryptionAvailable = false;
    expect(isEncryptionAvailable()).toBe(false);
  });

  it('generateSessionKey produces a real 32-byte key', () => {
    const key = generateSessionKey();
    expect(key.length).toBe(32);
    const other = generateSessionKey();
    expect(key.equals(other)).toBe(false);
  });

  it('wrapSessionKey/unwrapSessionKey round-trip a real key', () => {
    const key = generateSessionKey();
    const wrapped = wrapSessionKey(key);
    expect(wrapped).not.toBeNull();
    const unwrapped = unwrapSessionKey(wrapped!);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped!.equals(key)).toBe(true);
  });

  it('wrapSessionKey returns null when safeStorage is unavailable — never a fallback plaintext wrap', () => {
    encryptionAvailable = false;
    const key = generateSessionKey();
    expect(wrapSessionKey(key)).toBeNull();
  });

  it('unwrapSessionKey returns null (never throws) for a corrupt value', () => {
    expect(unwrapSessionKey('not-a-real-wrapped-key')).toBeNull();
  });

  it('encryptFrame + decryptFramedBuffer round-trips a single chunk exactly', () => {
    const key = generateSessionKey();
    const plaintext = Buffer.from('a real recorded audio chunk of bytes');
    const frame = encryptFrame(plaintext, key);
    const decrypted = decryptFramedBuffer(frame, key);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('multiple appended frames decrypt back into the original concatenated plaintext, in order', () => {
    const key = generateSessionKey();
    const chunks = [Buffer.from('first chunk'), Buffer.from('second chunk'), Buffer.from('third chunk')];
    const framed = Buffer.concat(chunks.map((c) => encryptFrame(c, key)));
    const decrypted = decryptFramedBuffer(framed, key);
    expect(decrypted.equals(Buffer.concat(chunks))).toBe(true);
  });

  it('decryption fails loudly on a tampered ciphertext byte (GCM auth failure), never silently returns wrong data', () => {
    const key = generateSessionKey();
    const frame = encryptFrame(Buffer.from('sensitive recorded content'), key);
    frame[frame.length - 1] = frame[frame.length - 1]! ^ 0xff; // flip a byte in the ciphertext
    expect(() => decryptFramedBuffer(frame, key)).toThrow();
  });

  it('decryption fails with the wrong key', () => {
    const key = generateSessionKey();
    const wrongKey = generateSessionKey();
    const frame = encryptFrame(Buffer.from('data'), key);
    expect(() => decryptFramedBuffer(frame, wrongKey)).toThrow();
  });

  it('completeFrameBoundary returns the full length for a file made only of complete frames', () => {
    const key = generateSessionKey();
    const framed = Buffer.concat([encryptFrame(Buffer.from('one'), key), encryptFrame(Buffer.from('two'), key)]);
    expect(completeFrameBoundary(framed)).toBe(framed.length);
  });

  it('completeFrameBoundary truncates to the last complete frame when the file ends mid-write', () => {
    const key = generateSessionKey();
    const complete = encryptFrame(Buffer.from('complete chunk'), key);
    const partial = encryptFrame(Buffer.from('this chunk got cut off'), key).subarray(0, 5); // simulate a half-written trailing chunk
    const framed = Buffer.concat([complete, partial]);
    expect(completeFrameBoundary(framed)).toBe(complete.length);
  });

  it('completeFrameBoundary returns 0 for an empty or entirely-truncated file', () => {
    expect(completeFrameBoundary(Buffer.alloc(0))).toBe(0);
    expect(completeFrameBoundary(Buffer.from([0, 0]))).toBe(0); // shorter than even the length prefix
  });
});
