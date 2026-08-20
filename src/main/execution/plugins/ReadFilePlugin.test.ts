import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-read-file-test-'));
  return { app: { getPath: () => tmp } };
});

vi.mock('../../memory/entities/fileEntities', () => ({ touchFileUsed: vi.fn() }));

import { readFilePlugin } from './ReadFilePlugin';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-read-file-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ReadFilePlugin', () => {
  it('reports a missing requirement when the path does not exist', () => {
    const reqs = readFilePlugin.requirements({ type: 'readFile', path: path.join(tmpDir, 'no-such-file.ts') });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.id).toBe('file-missing');
  });

  it('returns no requirements for an existing file', () => {
    const file = path.join(tmpDir, 'hello.ts');
    fs.writeFileSync(file, 'export const x = 1;\n', 'utf-8');
    const reqs = readFilePlugin.requirements({ type: 'readFile', path: file });
    expect(reqs).toHaveLength(0);
  });

  it('reads a source file and returns its content', async () => {
    const file = path.join(tmpDir, 'index.ts');
    fs.writeFileSync(file, 'const a = 42;\n', 'utf-8');
    const result = await readFilePlugin.execute({ type: 'readFile', path: file });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { content: string; truncated: boolean };
    expect(data.content).toContain('const a = 42');
    expect(data.truncated).toBe(false);
  });

  it('blocks a .env file with a clear secret-protection message', async () => {
    const envFile = path.join(tmpDir, '.env');
    fs.writeFileSync(envFile, 'SECRET_KEY=hunter2\n', 'utf-8');
    const result = await readFilePlugin.execute({ type: 'readFile', path: envFile });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/live secrets/i);
  });

  it('blocks .env.local (env with suffix)', async () => {
    const envFile = path.join(tmpDir, '.env.local');
    fs.writeFileSync(envFile, 'DB_PASS=pw\n', 'utf-8');
    const result = await readFilePlugin.execute({ type: 'readFile', path: envFile });
    expect(result.ok).toBe(false);
  });

  it('blocks id_rsa (private key file)', async () => {
    const keyFile = path.join(tmpDir, 'id_rsa');
    fs.writeFileSync(keyFile, '-----BEGIN RSA PRIVATE KEY-----\n', 'utf-8');
    const result = await readFilePlugin.execute({ type: 'readFile', path: keyFile });
    expect(result.ok).toBe(false);
  });

  it('blocks .pem certificate files', async () => {
    const pemFile = path.join(tmpDir, 'server.pem');
    fs.writeFileSync(pemFile, '-----BEGIN CERTIFICATE-----\n', 'utf-8');
    const result = await readFilePlugin.execute({ type: 'readFile', path: pemFile });
    expect(result.ok).toBe(false);
  });

  it('does NOT block files that merely have "secret" in the source filename', async () => {
    const file = path.join(tmpDir, 'CredentialVaultBridge.ts');
    fs.writeFileSync(file, 'export class CredentialVaultBridge {}\n', 'utf-8');
    const result = await readFilePlugin.execute({ type: 'readFile', path: file });
    expect(result.ok).toBe(true);
  });

  it('fails honestly when path is a directory, not a file', async () => {
    const result = await readFilePlugin.execute({ type: 'readFile', path: tmpDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/folder/i);
  });
});
