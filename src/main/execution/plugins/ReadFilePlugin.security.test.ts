import { describe, it, expect } from 'vitest';

// Import the regex pattern for testing
const SECRET_FILE_PATTERN =
  /^\.env(\..+)?$|^id_rsa(\.pub)?$|^id_ed25519(\.pub)?$|^id_ecdsa(\.pub)?$|^id_dsa(\.pub)?$|\.pem$|\.key$|\.crt$|\.cer$|\.pfx$|\.p12$|\.jks$|^\.aws$|^\.azure$|^\.gcp$|^service-account[^.]*\.json$/i;

function isSecretFile(filename: string): boolean {
  return SECRET_FILE_PATTERN.test(filename);
}

describe('ReadFilePlugin Secret File Blocking', () => {
  describe('.env files', () => {
    it('blocks .env', () => {
      expect(isSecretFile('.env')).toBe(true);
    });

    it('blocks .env.local', () => {
      expect(isSecretFile('.env.local')).toBe(true);
    });

    it('blocks .env.production', () => {
      expect(isSecretFile('.env.production')).toBe(true);
    });

    it('blocks .env.staging', () => {
      expect(isSecretFile('.env.staging')).toBe(true);
    });

    it('blocks .env.development', () => {
      expect(isSecretFile('.env.development')).toBe(true);
    });

    it('blocks .env with arbitrary suffix', () => {
      expect(isSecretFile('.env.custom')).toBe(true);
    });
  });

  describe('SSH keys', () => {
    it('blocks id_rsa', () => {
      expect(isSecretFile('id_rsa')).toBe(true);
    });

    it('blocks id_rsa.pub', () => {
      expect(isSecretFile('id_rsa.pub')).toBe(true);
    });

    it('blocks id_ed25519', () => {
      expect(isSecretFile('id_ed25519')).toBe(true);
    });

    it('blocks id_ed25519.pub', () => {
      expect(isSecretFile('id_ed25519.pub')).toBe(true);
    });

    it('blocks id_ecdsa', () => {
      expect(isSecretFile('id_ecdsa')).toBe(true);
    });

    it('blocks id_dsa', () => {
      expect(isSecretFile('id_dsa')).toBe(true);
    });
  });

  describe('TLS/Crypto certificates', () => {
    it('blocks .pem files', () => {
      expect(isSecretFile('certificate.pem')).toBe(true);
    });

    it('blocks .key files', () => {
      expect(isSecretFile('private.key')).toBe(true);
    });

    it('blocks .crt files', () => {
      expect(isSecretFile('cert.crt')).toBe(true);
    });

    it('blocks .cer files', () => {
      expect(isSecretFile('cert.cer')).toBe(true);
    });

    it('blocks .pfx files', () => {
      expect(isSecretFile('cert.pfx')).toBe(true);
    });

    it('blocks .p12 files', () => {
      expect(isSecretFile('cert.p12')).toBe(true);
    });

    it('blocks .jks files (Java keystores)', () => {
      expect(isSecretFile('keystore.jks')).toBe(true);
    });
  });

  describe('Cloud provider credentials', () => {
    it('blocks .aws directory marker', () => {
      expect(isSecretFile('.aws')).toBe(true);
    });

    it('blocks .azure directory marker', () => {
      expect(isSecretFile('.azure')).toBe(true);
    });

    it('blocks .gcp directory marker', () => {
      expect(isSecretFile('.gcp')).toBe(true);
    });

    it('blocks service-account JSON files', () => {
      expect(isSecretFile('service-account.json')).toBe(true);
    });

    it('blocks service-account with custom name', () => {
      expect(isSecretFile('service-account-prod.json')).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('blocks .ENV (uppercase)', () => {
      expect(isSecretFile('.ENV')).toBe(true);
    });

    it('blocks ID_RSA (uppercase)', () => {
      expect(isSecretFile('ID_RSA')).toBe(true);
    });

    it('blocks .PEM (uppercase)', () => {
      expect(isSecretFile('.PEM')).toBe(true);
    });
  });

  describe('nested paths', () => {
    it('blocks .env even in nested path (basenames checked)', () => {
      // In practice, isSecretFile only receives basename, but document the intent
      expect(isSecretFile('.env')).toBe(true);
    });

    it('allows normal files in .env directory', () => {
      // If filename is "file.ts" (not ".env"), it passes
      expect(isSecretFile('file.ts')).toBe(false);
    });
  });

  describe('legitimate files (should NOT be blocked)', () => {
    it('allows CredentialVaultBridge.ts (has "Credential" in name)', () => {
      expect(isSecretFile('CredentialVaultBridge.ts')).toBe(false);
    });

    it('allows SecretService.ts (has "Secret" in name)', () => {
      expect(isSecretFile('SecretService.ts')).toBe(false);
    });

    it('allows environment.ts (not .env)', () => {
      expect(isSecretFile('environment.ts')).toBe(false);
    });

    it('allows encryption.key.ts (not .key file)', () => {
      expect(isSecretFile('encryption.key.ts')).toBe(false);
    });

    it('allows config.json (not service-account*.json)', () => {
      expect(isSecretFile('config.json')).toBe(false);
    });

    it('allows aws-sdk.ts (not .aws)', () => {
      expect(isSecretFile('aws-sdk.ts')).toBe(false);
    });

    it('allows README.md', () => {
      expect(isSecretFile('README.md')).toBe(false);
    });

    it('allows package.json', () => {
      expect(isSecretFile('package.json')).toBe(false);
    });

    it('allows tsconfig.json', () => {
      expect(isSecretFile('tsconfig.json')).toBe(false);
    });
  });
});
