import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { gitDiffStatPlugin } from './GitDiffStatPlugin';

function git(cwd: string, ...args: string[]) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

describe('gitDiffStat includeUntracked — everything a PR would contain (real git)', () => {
  it('counts edits vs HEAD (staged or not) plus new files; ignored files and binaries add nothing', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-diffstat-'));
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 't@example.com');
    git(repo, 'config', 'user.name', 'Test');
    fs.writeFileSync(path.join(repo, 'a.ts'), 'one\ntwo\nthree\n');
    fs.writeFileSync(path.join(repo, '.gitignore'), 'dist/\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'init');

    fs.writeFileSync(path.join(repo, 'a.ts'), 'one\nTWO\nthree\nfour\n'); // 2 added, 1 deleted
    fs.writeFileSync(path.join(repo, 'staged.ts'), 'x\ny\n');
    git(repo, 'add', 'staged.ts'); // staged new file: 2 added
    fs.mkdirSync(path.join(repo, 'src'));
    fs.writeFileSync(path.join(repo, 'src', 'new.ts'), 'a\nb\nc\n'); // untracked: 3 added
    fs.writeFileSync(path.join(repo, 'logo.png'), Buffer.from([137, 80, 78, 71, 0, 1, 2])); // binary: 0
    fs.mkdirSync(path.join(repo, 'dist'));
    fs.writeFileSync(path.join(repo, 'dist', 'bundle.js'), 'ignored\n'); // .gitignore'd: not counted

    const result = await gitDiffStatPlugin.execute({ type: 'gitDiffStat', cwd: repo, includeUntracked: true });
    expect(result.ok).toBe(true);
    const data = result.data as { filesChanged: { path: string; added: number; deleted: number }[]; totalAdded: number; totalDeleted: number };
    const byPath = Object.fromEntries(data.filesChanged.map((f) => [f.path.replace(/\\/g, '/'), f]));
    expect(byPath['a.ts']).toMatchObject({ added: 2, deleted: 1 });
    expect(byPath['staged.ts']).toMatchObject({ added: 2, deleted: 0 });
    expect(byPath['src/new.ts']).toMatchObject({ added: 3, deleted: 0 });
    expect(byPath['logo.png']).toMatchObject({ added: 0 });
    expect(byPath['dist/bundle.js']).toBeUndefined();
    expect(data.totalAdded).toBe(7);
    expect(data.totalDeleted).toBe(1);

    // The plain mode is unchanged: unstaged tracked edits only.
    const plain = await gitDiffStatPlugin.execute({ type: 'gitDiffStat', cwd: repo });
    expect((plain.data as { filesChanged: unknown[] }).filesChanged).toHaveLength(1);
  });
});
