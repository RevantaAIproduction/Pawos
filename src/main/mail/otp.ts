import { randomInt, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 5 * 60 * 1000;

type OtpRecord = { hash: string; salt: string; expiresAt: number; used: boolean };

/**
 * A real, standalone OTP system — 6 digits, hashed before storage (never
 * kept in plaintext), 5-minute expiry, single-use. In-memory (per-process);
 * fine at this app's current scale — swap for a real datastore if this
 * ever needs to survive process restarts or run across multiple instances.
 *
 * This is independent of Supabase Auth's own email confirmation/reset
 * flow (which already sends its own emails via Supabase's servers, not
 * this code) — it exists for custom flows PawOS's own code controls, not
 * as a replacement for what Supabase already handles.
 */
const otpStore = new Map<string, OtpRecord>();

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

export async function createOtp(email: string): Promise<{ code: string; expiresInMinutes: number }> {
  const code = generateOtpCode();
  const salt = randomBytes(16);
  const hash = (await scryptAsync(code, salt, 64)) as Buffer;
  otpStore.set(normalize(email), {
    hash: hash.toString('hex'),
    salt: salt.toString('hex'),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    used: false,
  });
  return { code, expiresInMinutes: OTP_EXPIRY_MS / 60000 };
}

export async function verifyOtp(email: string, code: string): Promise<{ valid: boolean; reason?: string }> {
  const record = otpStore.get(normalize(email));
  if (!record) return { valid: false, reason: 'No code was requested for this email.' };
  if (record.used) return { valid: false, reason: 'This code has already been used.' };
  if (Date.now() > record.expiresAt) return { valid: false, reason: 'This code has expired.' };

  const salt = Buffer.from(record.salt, 'hex');
  const expected = Buffer.from(record.hash, 'hex');
  const derived = (await scryptAsync(code, salt, expected.length)) as Buffer;
  const valid = timingSafeEqual(derived, expected);
  if (valid) record.used = true;
  return valid ? { valid: true } : { valid: false, reason: 'Incorrect code.' };
}
