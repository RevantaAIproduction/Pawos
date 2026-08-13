import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createLocalCodingRuntimeSession } from '../../shared/actions/CodingRuntimeSessionTypes';
import { enforceCodingRuntimeSecurity } from './CodingRuntimeSecurity';

function makeProject(prefix = 'pawos-runtime-security-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    session: createLocalCodingRuntimeSession({ id: `session:${root}`, rootPath: root, createdAt: 1 }),
  };
}

describe('CodingRuntimeSecurity', () => {
  it('accepts an empty selected local workspace root', () => {
    const project = makeProject();
    const result = enforceCodingRuntimeSecurity({ type: 'analyzeProject', rootPath: project.root, codingRuntimeSession: project.session });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.selectedRootRealPath).toBe(fs.realpathSync.native(project.root));
  });

  it('accepts paths inside an existing selected project', () => {
    const project = makeProject();
    const filePath = path.join(project.root, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'export {};\n', 'utf-8');

    const result = enforceCodingRuntimeSecurity({ type: 'readFile', path: filePath, codingRuntimeSession: project.session });
    expect(result.ok).toBe(true);
  });

  it('blocks absolute paths outside the selected root', () => {
    const project = makeProject();
    const outside = path.join(os.tmpdir(), `pawos-outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'secret', 'utf-8');

    const result = enforceCodingRuntimeSecurity({ type: 'readFile', path: outside, codingRuntimeSession: project.session });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.reason).toBe('security-restricted');
  });

  it('blocks traversal outside the selected root', () => {
    const project = makeProject();
    const sibling = `${project.root}-sibling`;
    fs.mkdirSync(sibling);
    const traversed = path.join(project.root, '..', path.basename(sibling), 'escape.txt');
    fs.writeFileSync(traversed, 'secret', 'utf-8');

    const result = enforceCodingRuntimeSecurity({ type: 'readFile', path: traversed, codingRuntimeSession: project.session });
    expect(result.ok).toBe(false);
  });

  it('blocks symlink escapes through an in-root path', () => {
    const project = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-runtime-outside-'));
    const link = path.join(project.root, 'linked-outside');
    fs.symlinkSync(outside, link, 'junction');

    const result = enforceCodingRuntimeSecurity({ type: 'listDirectory', path: link, codingRuntimeSession: project.session });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.message).toContain('symlink');
  });

  it('blocks command cwd outside the selected root', () => {
    const project = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-runtime-cwd-'));
    const result = enforceCodingRuntimeSecurity({
      type: 'runCommand',
      command: 'npm test',
      cwd: outside,
      confirmed: true,
      codingRuntimeSession: project.session,
    });
    expect(result.ok).toBe(false);
  });

  it('blocks shell commands that attempt to cd above the selected root', () => {
    const project = makeProject();
    const result = enforceCodingRuntimeSecurity({
      type: 'runCommand',
      command: 'cd .. && npm test',
      cwd: project.root,
      confirmed: true,
      codingRuntimeSession: project.session,
    });
    expect(result.ok).toBe(false);
  });

  it('blocks Git cwd outside the selected root', () => {
    const project = makeProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-runtime-git-'));
    const result = enforceCodingRuntimeSecurity({ type: 'gitStatus', cwd: outside, codingRuntimeSession: project.session });
    expect(result.ok).toBe(false);
  });

  it('blocks validation scripts that reference parent paths', () => {
    const project = makeProject();
    fs.writeFileSync(path.join(project.root, 'package.json'), JSON.stringify({ scripts: { test: 'cd .. && npm test' } }), 'utf-8');
    const result = enforceCodingRuntimeSecurity({ type: 'runValidationPipeline', rootPath: project.root, codingRuntimeSession: project.session });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.result.message).toContain('Validation scripts');
  });
});
