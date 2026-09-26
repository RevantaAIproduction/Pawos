import { describe, expect, it } from 'vitest';
import { checkRepoUrl, isInsideFolder, joinPath, projectName } from './projectClone';

describe('Cloning from the project button', () => {
  it.each([
    ['https://github.com/owner/my-app.git', 'my-app'],
    ['https://github.com/owner/my-app', 'my-app'],
    ['https://gitlab.com/group/sub/tool.git/', 'tool'],
    ['git@github.com:owner/api-server.git', 'api-server'],
    ['ssh://git@host.example.com/team/repo.git', 'repo'],
  ])('%s → folder %s', (url, folder) => {
    expect(checkRepoUrl(url)).toEqual({ ok: true, url: url.replace(/\/+$/, ''), folderName: folder });
  });

  it.each([
    '',
    'not a url',
    'http://github.com/owner/repo.git', // plain http is refused
    'https://github.com/owner/repo.git && del /q C:\\',
    'https://github.com/owner/repo.git --upload-pack=evil',
    '--upload-pack=touch /tmp/x',
    'file:///C:/secret/repo',
    'https://github.com/',
  ])('refuses %j', (url) => {
    expect(checkRepoUrl(url).ok).toBe(false);
  });

  it('Files/Worktree only show files inside the open project', () => {
    expect(isInsideFolder('C:\\code\\app\\src\\index.ts', 'C:\\code\\app')).toBe(true);
    expect(isInsideFolder('c:/CODE/app/README.md', 'C:\\code\\app\\')).toBe(true);
    expect(isInsideFolder('C:\\code\\app', 'C:\\code\\app')).toBe(true);
    expect(isInsideFolder('C:\\code\\app2\\x.ts', 'C:\\code\\app')).toBe(false);
    expect(isInsideFolder('C:\\Users\\me\\Documents\\Resume.docx', 'C:\\code\\app')).toBe(false);
    expect(isInsideFolder('C:\\x', '')).toBe(false);
  });

  it('joins and names project folders on Windows and POSIX paths', () => {
    expect(joinPath('C:\\Users\\me\\code\\', 'my-app')).toBe('C:\\Users\\me\\code\\my-app');
    expect(joinPath('/home/me/code', 'my-app')).toBe('/home/me/code/my-app');
    expect(projectName('C:\\Users\\me\\code\\my-app\\')).toBe('my-app');
  });
});
