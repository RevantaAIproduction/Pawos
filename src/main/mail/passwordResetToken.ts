import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const usedTokens = new Set<string>();

let cachedSecret: string | null = null;

/**
 * A stable signing secret for password-reset tokens — read from
 * EMAIL_SIGNING_SECRET in .env if set, otherwise generated once and
 * persisted to a local file so tokens issued before a restart stay valid
 * until they expire naturally.
 */
function getOrCreateSecret(userDataDir: string, envSecret: string | undefined): string {
  if (cachedSecret) return cachedSecret;
  if (envSecret) {
    cachedSecret = envSecret;
    return cachedSecret;
  }
  const secretFile = path.join(userDataDir, 'pawos-email-signing-secret.txt');
  try {
    cachedSecret = fs.readFileSync(secretFile, 'utf-8').trim();
    if (cachedSecret) return cachedSecret;
  } catch {
    // first run — generate below
  }
  cachedSecret = randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(secretFile, cachedSecret, 'utf-8');
  } catch {
    // if this can't be persisted, tokens just won't survive a restart — not fatal
  }
  return cachedSecret;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Signed, expiring, single-use password reset tokens — 15-minute expiry.
 * Independent of Supabase Auth's own resetPasswordForEmail() flow; this is
 * for a custom reset flow PawOS's own code fully controls end to end.
 */
export function createPasswordResetToken(email: string, userDataDir: string, envSecret: string | undefined): string {
  const secret = getOrCreateSecret(userDataDir, envSecret);
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const nonce = randomBytes(8).toString('hex');
  const payload = `${email.trim().toLowerCase()}.${expiresAt}.${nonce}`;
  const signature = sign(payload, secret);
  return Buffer.from(`${payload}.${signature}`, 'utf-8').toString('base64url');
}

export function verifyPasswordResetToken(
  token: string,
  userDataDir: string,
  envSecret: string | undefined
): { valid: boolean; email?: string; reason?: string } {
  const secret = getOrCreateSecret(userDataDir, envSecret);

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf-8');
  } catch {
    return { valid: false, reason: 'Malformed token.' };
  }

  const parts = decoded.split('.');
  if (parts.length !== 4) return { valid: false, reason: 'Malformed token.' };
  const [email, expiresAtStr, nonce, signature] = parts;
  if (!email || !expiresAtStr || !nonce || !signature) return { valid: false, reason: 'Malformed token.' };
  const payload = `${email}.${expiresAtStr}.${nonce}`;
  const expectedSignature = sign(payload, secret);

  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid token.' };
  }
  if (usedTokens.has(token)) return { valid: false, reason: 'This link has already been used.' };
  if (Date.now() > Number(expiresAtStr)) return { valid: false, reason: 'This link has expired.' };

  usedTokens.add(token);
  return { valid: true, email };
}
