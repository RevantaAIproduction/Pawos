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
 *
 * The payload is JSON, base64url-encoded as a single opaque blob, with
 * exactly one literal '.' separating it from the hex signature — NOT the
 * naive `field.field.field` join a first version of this used, which broke
 * on any email containing a dot (i.e. virtually every real email address,
 * since domains always have one) because splitting on '.' produced more
 * than the expected number of parts.
 */
export function createPasswordResetToken(email: string, userDataDir: string, envSecret: string | undefined): string {
  const secret = getOrCreateSecret(userDataDir, envSecret);
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const nonce = randomBytes(8).toString('hex');
  const payload = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase(), expiresAt, nonce }), 'utf-8').toString(
    'base64url'
  );
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyPasswordResetToken(
  token: string,
  userDataDir: string,
  envSecret: string | undefined
): { valid: boolean; email?: string; reason?: string } {
  const secret = getOrCreateSecret(userDataDir, envSecret);

  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return { valid: false, reason: 'Malformed token.' };
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);

  const expectedSignature = sign(payload, secret);
  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'Invalid token.' };
  }

  let parsed: { email?: string; expiresAt?: number; nonce?: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  } catch {
    return { valid: false, reason: 'Malformed token.' };
  }
  if (!parsed.email || !parsed.expiresAt || !parsed.nonce) return { valid: false, reason: 'Malformed token.' };

  if (usedTokens.has(token)) return { valid: false, reason: 'This link has already been used.' };
  if (Date.now() > parsed.expiresAt) return { valid: false, reason: 'This link has expired.' };

  usedTokens.add(token);
  return { valid: true, email: parsed.email };
}
