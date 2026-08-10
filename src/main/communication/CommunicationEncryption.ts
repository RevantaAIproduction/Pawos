import * as crypto from 'crypto';
import { safeStorage } from 'electron';

/**
 * Recording & Storage Foundation — encryption-at-rest for captured audio/video, encrypted per
 * chunk as it streams in (never the whole recording buffered to encrypt at once). Reuses the exact
 * safeStorage (OS-keychain-backed) key-wrapping pattern already proven in
 * GuestConnectorCredentialStore.ts, generalized here to wrap a per-session AES-256-GCM data key
 * rather than a credential field directly — the same idea, applied to a stream instead of a string.
 *
 * Framing: each chunk is stored as [4-byte BE length][12-byte IV][16-byte GCM auth tag][ciphertext],
 * appended sequentially to one file. This is what makes both properties true at once: encryption
 * never requires buffering more than one chunk in memory, and every chunk's authenticity is
 * independently verifiable (a corrupted/tampered chunk fails to decrypt loudly, never silently).
 */

const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM-recommended nonce size
const TAG_LENGTH = 16;
const LENGTH_PREFIX_BYTES = 4;

export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function generateSessionKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

/** Wraps a raw session key via the OS keychain — returns null (never a fallback plaintext store) when encryption genuinely isn't available on this platform/session. */
export function wrapSessionKey(rawKey: Buffer): string | null {
  if (!isEncryptionAvailable()) return null;
  try {
    return safeStorage.encryptString(rawKey.toString('base64')).toString('base64');
  } catch {
    return null;
  }
}

/** Reverses wrapSessionKey(). Returns null on any failure (corrupt value, keychain locked/unavailable) rather than throwing — callers treat this the same as "no key," never crash the caller. */
export function unwrapSessionKey(wrapped: string): Buffer | null {
  try {
    const decoded = safeStorage.decryptString(Buffer.from(wrapped, 'base64'));
    return Buffer.from(decoded, 'base64');
  } catch {
    return null;
  }
}

/** Encrypts one chunk and frames it for sequential on-disk storage. Never touches any other chunk's bytes — safe to call once per incoming chunk with no accumulated state. */
export function encryptFrame(plaintext: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = Buffer.concat([iv, tag, ciphertext]);
  const lengthPrefix = Buffer.alloc(LENGTH_PREFIX_BYTES);
  lengthPrefix.writeUInt32BE(body.length, 0);
  return Buffer.concat([lengthPrefix, body]);
}

/**
 * Decrypts a fully-framed file's worth of chunks back into one plaintext buffer. This is a
 * necessarily whole-buffer operation (used only by later consumers — e.g. transcription — reading
 * a finished recording back, never by the write path during active capture, which only ever
 * encrypts one chunk at a time via encryptFrame above). Throws on any tampered/corrupt frame
 * (GCM authentication failure) or malformed framing — never silently returns partial/wrong data.
 */
export function decryptFramedBuffer(framed: Buffer, key: Buffer): Buffer {
  const plaintextParts: Buffer[] = [];
  let offset = 0;
  while (offset < framed.length) {
    if (offset + LENGTH_PREFIX_BYTES > framed.length) {
      throw new Error('Corrupt recording: truncated frame length prefix.');
    }
    const bodyLength = framed.readUInt32BE(offset);
    offset += LENGTH_PREFIX_BYTES;
    if (offset + bodyLength > framed.length) {
      throw new Error('Corrupt recording: truncated frame body.');
    }
    const iv = framed.subarray(offset, offset + IV_LENGTH);
    const tag = framed.subarray(offset + IV_LENGTH, offset + IV_LENGTH + TAG_LENGTH);
    const ciphertext = framed.subarray(offset + IV_LENGTH + TAG_LENGTH, offset + bodyLength);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    plaintextParts.push(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
    offset += bodyLength;
  }
  return Buffer.concat(plaintextParts);
}

/**
 * Real-time validity check for the framing at the END of a file — used by crash recovery to detect
 * a chunk that was only partially written to disk (app killed mid-fs.appendFileSync). Returns the
 * number of complete, well-formed frames' worth of bytes, i.e. the safe truncation point. Never
 * throws; a malformed trailing frame is treated as "not yet complete," not a fatal error.
 */
export function completeFrameBoundary(framed: Buffer): number {
  let offset = 0;
  let lastCompleteBoundary = 0;
  while (offset + LENGTH_PREFIX_BYTES <= framed.length) {
    const bodyLength = framed.readUInt32BE(offset);
    const frameEnd = offset + LENGTH_PREFIX_BYTES + bodyLength;
    if (frameEnd > framed.length) break; // trailing partial frame — stop before it
    offset = frameEnd;
    lastCompleteBoundary = offset;
  }
  return lastCompleteBoundary;
}
