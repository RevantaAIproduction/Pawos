import { describe, expect, it } from 'vitest';
import { isTrustedProjectRead } from './projectTrust';

const project = 'C:\\code\\my-app';

describe('Reading inside the open project runs without asking; everything else still asks', () => {
  it.each([
    [{ type: 'readFile', path: 'C:\\code\\my-app\\src\\App.tsx' }],
    [{ type: 'listDirectory', path: 'C:\\code\\my-app' }],
    [{ type: 'searchFiles', rootPath: 'c:/code/my-app', query: 'login' }],
    [{ type: 'gitStatus', cwd: 'C:\\code\\my-app' }],
    [{ type: 'gitDiff', cwd: 'C:\\code\\my-app' }],
  ])('trusted: %j', (request) => expect(isTrustedProjectRead(request as never, project)).toBe(true));

  it.each([
    ['a write in the project', { type: 'writeFile', path: 'C:\\code\\my-app\\a.ts', content: 'x' }],
    ['a command in the project', { type: 'runCommand', command: 'npm test', cwd: 'C:\\code\\my-app' }],
    ['a git commit in the project', { type: 'gitCommit', cwd: 'C:\\code\\my-app', message: 'm' }],
    ['a delete in the project', { type: 'deletePath', path: 'C:\\code\\my-app\\a.ts' }],
    ['a read outside the project', { type: 'readFile', path: 'C:\\Users\\me\\Documents\\Resume.docx' }],
    ['a search of a look-alike folder', { type: 'searchFiles', rootPath: 'C:\\code\\my-app2', query: 'x' }],
    ['a read with no location', { type: 'readClipboard' }],
  ])('still asks: %s', (_label, request) => expect(isTrustedProjectRead(request as never, project)).toBe(false));

  it('no open project → every read asks', () => {
    expect(isTrustedProjectRead({ type: 'readFile', path: 'C:\\code\\my-app\\a.ts' } as never, null)).toBe(false);
  });
});
