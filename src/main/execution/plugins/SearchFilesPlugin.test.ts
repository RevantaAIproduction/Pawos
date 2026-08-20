import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { searchFilesPlugin } from './SearchFilesPlugin';

let root: string;

function write(rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-search-files-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('SearchFilesPlugin — path search', () => {
  it('finds a file by exact basename match', async () => {
    write('src/utils/formatDate.ts', 'export function formatDate() {}');
    const result = await searchFilesPlugin.execute({ type: 'searchFiles', rootPath: root, query: 'formatDate', fuzzy: false });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    expect(paths.some((p) => p.endsWith('formatDate.ts'))).toBe(true);
  });

  it('returns empty array when no files match the query', async () => {
    write('src/index.ts', 'export {}');
    const result = await searchFilesPlugin.execute({ type: 'searchFiles', rootPath: root, query: 'nonexistent_xyz_123', fuzzy: false });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('extension filter excludes directories', async () => {
    write('auth/index.ts', '');
    const result = await searchFilesPlugin.execute({ type: 'searchFiles', rootPath: root, query: 'auth', fuzzy: false, extensions: ['.ts'] });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    // With an extension filter active, directories are never returned
    const dirs = paths.filter((p) => {
      try { return fs.statSync(p).isDirectory(); } catch { return false; }
    });
    expect(dirs).toHaveLength(0);
  });
});

describe('SearchFilesPlugin — content search', () => {
  it('finds files that contain the content query', async () => {
    write('src/helpers.ts', 'export const SECRET_TOKEN = "abc123";');
    write('src/other.ts', 'export const unrelated = 42;');
    const result = await searchFilesPlugin.execute({
      type: 'searchFiles',
      rootPath: root,
      query: '',
      contentQuery: 'SECRET_TOKEN',
    });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    expect(paths.some((p) => p.endsWith('helpers.ts'))).toBe(true);
    expect(paths.every((p) => !p.endsWith('other.ts'))).toBe(true);
  });

  it('content search is case-insensitive', async () => {
    write('src/config.ts', 'const apiEndpoint = "https://example.com";');
    const result = await searchFilesPlugin.execute({
      type: 'searchFiles',
      rootPath: root,
      query: '',
      contentQuery: 'APIENDPOINT',
    });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    expect(paths.some((p) => p.endsWith('config.ts'))).toBe(true);
  });

  it('skips binary files during content search', async () => {
    // Write a file with a null byte (binary sniff)
    const binPath = path.join(root, 'image.bin');
    const buf = Buffer.alloc(16, 0); // all null bytes — binary
    buf.write('needle', 0, 'utf-8'); // write the query string at offset 0, but null bytes will trigger binary check
    buf[6] = 0; // force a null byte
    fs.writeFileSync(binPath, buf);
    const result = await searchFilesPlugin.execute({
      type: 'searchFiles',
      rootPath: root,
      query: '',
      contentQuery: 'needle',
    });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    expect(paths.every((p) => !p.endsWith('image.bin'))).toBe(true);
  });

  it('combines path query and content query — both must match', async () => {
    write('src/userAuth.ts', 'export function login() { return "token"; }');
    write('src/userProfile.ts', 'export function getProfile() {}');
    // Both match 'user' path query, but only userAuth.ts contains 'token'
    const result = await searchFilesPlugin.execute({
      type: 'searchFiles',
      rootPath: root,
      query: 'user',
      contentQuery: 'token',
    });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    expect(paths.some((p) => p.endsWith('userAuth.ts'))).toBe(true);
    expect(paths.every((p) => !p.endsWith('userProfile.ts'))).toBe(true);
  });
});

describe('SearchFilesPlugin — max-result protection', () => {
  it('respects maxResults cap and never returns more than the limit', async () => {
    for (let i = 0; i < 10; i += 1) {
      write(`src/file${i}.ts`, 'export {}');
    }
    const result = await searchFilesPlugin.execute({
      type: 'searchFiles',
      rootPath: root,
      query: 'file',
      fuzzy: false,
      maxResults: 3,
    });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    expect(paths.length).toBeLessThanOrEqual(3);
  });
});

describe('SearchFilesPlugin — workspace boundary', () => {
  it('confines results to the rootPath and never escapes it', async () => {
    write('src/app.ts', 'export {}');
    const result = await searchFilesPlugin.execute({
      type: 'searchFiles',
      rootPath: root,
      query: 'app',
      fuzzy: false,
    });
    expect(result.ok).toBe(true);
    const paths = result.ok ? (result.data as string[]) : [];
    for (const p of paths) {
      expect(p.startsWith(root)).toBe(true);
    }
  });

  it('returns an empty result rather than crashing for an empty root directory', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-empty-'));
    try {
      const result = await searchFilesPlugin.execute({
        type: 'searchFiles',
        rootPath: emptyDir,
        query: 'anything',
        fuzzy: false,
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
