/**
 * Keeping secrets out of documentation. Secret files are never read into a snapshot; anything that
 * looks like a credential in what is read is redacted; and a generated document that still contains
 * one fails validation and is not written.
 */

const SECRET_FILE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\.[^/]*)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.netrc$/i,
  /\.(pem|key|p12|pfx|jks|keystore|crt|cer|der)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|\/)(credentials|secrets?|service[-_]?account)[^/]*\.(json|ya?ml|toml|txt)$/i,
  /(^|\/)\.aws\//i,
  /(^|\/)\.ssh\//i,
];

/** Example env files list variable NAMES for documentation; their values are still never used. */
const EXAMPLE_ENV = /(^|\/)\.env\.(example|sample|template|dist)$/i;

export function isSecretPath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  if (EXAMPLE_ENV.test(p)) return false;
  return SECRET_FILE_PATTERNS.some((re) => re.test(p));
}

export function isExampleEnvPath(path: string): boolean {
  return EXAMPLE_ENV.test(path.replace(/\\/g, '/'));
}

interface SecretPattern {
  name: string;
  re: RegExp;
}

const SECRET_VALUE_PATTERNS: SecretPattern[] = [
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { name: 'AWS access key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'GitHub token', re: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Stripe key', re: /\b(sk|rk|pk)_(live|test)_[0-9A-Za-z]{16,}\b/g },
  { name: 'OpenAI-style key', re: /\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: 'connection string password', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]{3,}@[^\s]+/gi },
  {
    name: 'assigned secret',
    re: /\b([A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_]*)\s*[:=]\s*(['"`])([^'"`\s[<${][^'"`\s]{7,})\2/gi,
  },
];

export interface RedactionResult {
  text: string;
  redacted: string[];
}

/** Replace anything that looks like a credential with a placeholder. */
export function redactSecrets(text: string): RedactionResult {
  const redacted: string[] = [];
  let out = text;
  for (const { name, re } of SECRET_VALUE_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, (match: string, ...groups: unknown[]) => {
      redacted.push(name);
      if (name === 'assigned secret') {
        const key = typeof groups[0] === 'string' ? groups[0] : 'value';
        const quote = typeof groups[1] === 'string' ? groups[1] : '"';
        return `${key}: ${quote}[redacted]${quote}`;
      }
      if (name === 'connection string password') return match.replace(/:\/\/([^\s:@/]+):[^\s@/]+@/, '://$1:[redacted]@');
      return '[redacted]';
    });
  }
  return { text: out, redacted };
}

/** Names of credential-looking values in a text (empty when there are none). */
export function findSecrets(text: string): string[] {
  const found: string[] = [];
  for (const { name, re } of SECRET_VALUE_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) found.push(name);
    re.lastIndex = 0;
  }
  return found;
}
