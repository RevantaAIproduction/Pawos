import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildJumpTasks, extractJumpAction, isJumpProtocolUrl } from './jumpList';

describe('PawOS jump list', () => {
  it('offers PawOS tasks — never PowerShell ones', () => {
    const titles = buildJumpTasks({ store: false, execPath: 'C:\\Apps\\PawOS\\PawOS.exe' }).map((task) => task.title);
    expect(titles).toEqual(['New Chat', 'Continue Current Work', 'New Code Session', 'Open Dashboard']);
    expect(titles.join(' ')).not.toMatch(/PowerShell|ISE|Administrator/);
  });

  it('direct build: each task relaunches the PawOS executable with one argument and the PawOS icon', () => {
    const tasks = buildJumpTasks({ store: false, execPath: 'C:\\Apps\\PawOS\\PawOS.exe' });
    for (const task of tasks) {
      expect(task.program).toBe('C:\\Apps\\PawOS\\PawOS.exe');
      expect(task.iconPath).toBe('C:\\Apps\\PawOS\\PawOS.exe');
    }
    expect(tasks.map((task) => task.arguments)).toEqual(['--paw-jump=new-chat', '--paw-jump=continue', '--paw-jump=new-code-session', '--paw-jump=open-dashboard']);
  });

  it('Store build: tasks launch through the pawos:// protocol, not the packaged executable path', () => {
    const tasks = buildJumpTasks({ store: true, execPath: 'C:\\Program Files\\WindowsApps\\PawosAI.PawOS\\app\\PawOS.exe' });
    for (const task of tasks) {
      expect(task.program).toMatch(/explorer\.exe$/i);
      expect(task.arguments).toMatch(/^pawos:\/\/jump\//);
    }
  });

  it('an unpackaged dev run includes the app path so the task relaunches the same app', () => {
    const [task] = buildJumpTasks({ store: false, execPath: 'C:\\electron.exe', relaunchArgs: ['"C:\\repo"'] });
    expect(task.arguments).toBe('"C:\\repo" --paw-jump=new-chat');
  });

  it('recognises a jump launch in either form and ignores everything else', () => {
    expect(extractJumpAction(['PawOS.exe', '--paw-jump=new-chat'])).toBe('new-chat');
    expect(extractJumpAction(['PawOS.exe', 'pawos://jump/new-code-session'])).toBe('new-code-session');
    expect(extractJumpAction(['PawOS.exe', 'pawos://jump/open-dashboard/'])).toBe('open-dashboard');
    expect(extractJumpAction(['PawOS.exe'])).toBeNull();
    expect(extractJumpAction(['PawOS.exe', '--paw-jump=format-disk'])).toBeNull();
    expect(extractJumpAction(['PawOS.exe', 'pawos://google-auth-callback?code=abc'])).toBeNull();
  });

  it('a jump URL is never treated as an OAuth callback', () => {
    expect(isJumpProtocolUrl('pawos://jump/new-chat')).toBe(true);
    expect(isJumpProtocolUrl('pawos://connectivity-oauth-callback?code=x')).toBe(false);
    const main = fs.readFileSync(path.join(__dirname, '..', 'main.ts'), 'utf8');
    expect(main).toContain('if (coldStartUrl && !isJumpProtocolUrl(coldStartUrl)) handleOAuthProtocolUrl(coldStartUrl);');
  });

  it('the direct build claims the same app identity its installer shortcuts carry', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'main.ts'), 'utf8');
    const builder = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'electron-builder.yml'), 'utf8');
    expect(builder).toContain('appId: "com.pawos.pet"');
    expect(main).toContain("if (process.platform === 'win32' && !isStoreRuntime()) app.setAppUserModelId('com.pawos.pet');");
  });
});
