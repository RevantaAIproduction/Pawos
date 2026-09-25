import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

import { rollingUsageGate, resolveFileCap } from './RollingUsageGate';
import { usageEventStore, addMonths } from './UsageEventStore';
import { entitlementService } from './EntitlementService';
import { buildAccessStore } from './BuildAccessStore';
import { changedLineCount, classifyFileChange, enforceFileCap, recordCodeFileWrite } from '../execution/CodingRuntimeUsageBoundary';

const DAY = 24 * 60 * 60 * 1000;

function writeFiles(count: number, prefix = 'src/file') {
  for (let i = 0; i < count; i++) usageEventStore.recordFileWrite(`C:\\project\\${prefix}${i}.ts`, { kind: 'create', lines: 10 });
}

function lines(n: number, tag = 'line'): string {
  return Array.from({ length: n }, (_, i) => `${tag} ${i}`).join('\n');
}

describe('Hidden code-file cap', () => {
  let projectDir = '';

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-filecap-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-filecap-project-'));
    usageEventStore.init();
    usageEventStore.setAccount(null);
    usageEventStore.setScopeResolver(() => 'device');
    while (rollingUsageGate.inflightCount > 0) rollingUsageGate.releaseSlot();
    // Cycles start at the first usage check — which in the app always happens before any file is
    // written (the gate runs before a turn starts). Open them first, as the app would.
    rollingUsageGate.getRollingUsage('go', undefined, Date.now() - 1000);
    rollingUsageGate.getRollingUsage('pro', undefined, Date.now() - 1000);
    rollingUsageGate.isFileCapReached('go', Date.now() - 1000);
  });

  afterEach(() => vi.restoreAllMocks());

  // No purchased Paw Compute unless a test says so — it would lift the cap.
  beforeEach(() => {
    vi.spyOn(entitlementService, 'getStandardBonusCreditsRemaining').mockReturnValue(0);
  });

  it('caps: Go 75, Build 155, Pro 225, Pro Max 5x 375, Pro Max 20x 550; none for Team/Enterprise', () => {
    expect(resolveFileCap('go')).toBe(75);
    expect(resolveFileCap('build')).toBe(155);
    expect(resolveFileCap('pro')).toBe(225);
    expect(resolveFileCap('proMax', '5x')).toBe(375);
    expect(resolveFileCap('proMax')).toBe(375);
    expect(resolveFileCap('proMax', '20x')).toBe(550);
    for (const tier of ['team', 'enterprise'] as const) expect(resolveFileCap(tier)).toBeNull();
  });

  it('Go resets monthly, not weekly — same day each month from first use', () => {
    const now = Date.now();
    expect(rollingUsageGate.isFileCapReached('go', now)).toBe(false); // first check anchors the month
    writeFiles(75);
    expect(rollingUsageGate.isFileCapReached('go', now)).toBe(true);
    expect(rollingUsageGate.isFileCapReached('go', now + 8 * DAY)).toBe(true); // a week later: still used up
    expect(rollingUsageGate.isFileCapReached('go', now + 27 * DAY)).toBe(true);
    expect(rollingUsageGate.isFileCapReached('go', addMonths(now, 1) + 1000)).toBe(false);
  });

  it('month cycles keep the anchor day (Jan 31 → Feb 29 → Mar 31, no drift)', () => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-filecap-')); // fresh ledger, no anchor yet
    usageEventStore.init();
    const jan31 = new Date(2028, 0, 31, 12).getTime();
    expect(new Date(addMonths(jan31, 1)).getDate()).toBe(29);
    expect(new Date(addMonths(jan31, 2)).getDate()).toBe(31);
    usageEventStore.getGoFileCapMonthStartAt(jan31);
    expect(usageEventStore.getGoFileCapMonthStartAt(new Date(2028, 2, 30, 12).getTime())).toBe(addMonths(jan31, 1));
    expect(usageEventStore.getGoFileCapMonthStartAt(new Date(2028, 2, 31, 13).getTime())).toBe(addMonths(jan31, 2));
  });

  it('Build: 155 per week, anchored to the grant start; buy or wait before the final week', () => {
    const now = Date.now();
    vi.spyOn(buildAccessStore, 'getStartsAt').mockReturnValue(now - 1000);
    vi.spyOn(buildAccessStore, 'getEndsAt').mockReturnValue(now - 1000 + 56 * DAY);
    writeFiles(154);
    expect(rollingUsageGate.isFileCapReached('build', now)).toBe(false);
    writeFiles(1, 'src/last');
    expect(rollingUsageGate.isFileCapReached('build', now)).toBe(true);
    const check = rollingUsageGate.canStartGeneration('build', undefined, now);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Buy Paw Compute');
    expect(check.reason).toContain('resets automatically');
    expect(check.reason).not.toMatch(/file/i);
    expect(rollingUsageGate.isFileCapReached('build', now - 1000 + 7 * DAY)).toBe(false);

    const request = { type: 'writeFile' as const, path: path.join(projectDir, 'b.ts'), content: 'x', confirmed: true };
    vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue('build');
    expect(enforceFileCap(request)).toMatchObject({ ok: false, data: { buildFinalWeek: false } });
    vi.spyOn(entitlementService, 'getStandardBonusCreditsRemaining').mockReturnValue(500);
    expect(enforceFileCap(request)).toBeNull(); // bought Paw Compute carries on
  });

  it('Build final week: bought Paw Compute cannot continue file changes — upgrade to Pro', () => {
    const start = Date.now() - 52 * DAY; // day 52 of 56: week 8
    vi.spyOn(buildAccessStore, 'getStartsAt').mockReturnValue(start);
    vi.spyOn(buildAccessStore, 'getEndsAt').mockReturnValue(start + 56 * DAY);
    vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue('build');
    vi.spyOn(entitlementService, 'getStandardBonusCreditsRemaining').mockReturnValue(500);
    writeFiles(155);
    const blocked = enforceFileCap({ type: 'writeFile', path: path.join(projectDir, 'late.ts'), content: 'x', confirmed: true });
    expect(blocked).toMatchObject({ ok: false, data: { buildFinalWeek: true } });
    expect((blocked as { message: string }).message).toContain('Upgrade to Pro');
  });

  it('Build: 56 days = weeks 1–7 that reset (days 1–49), then week 8 (days 50–56) that never resets', () => {
    const start = Date.now() - 1000;
    const endsAt = start + 56 * DAY;
    vi.spyOn(buildAccessStore, 'getStartsAt').mockReturnValue(start);
    vi.spyOn(buildAccessStore, 'getEndsAt').mockReturnValue(endsAt);
    const fill = (at: number) => {
      for (let i = 0; i < 155; i++) usageEventStore.recordFileWrite(`C:\\p\\w${at}-${i}.ts`, { kind: 'create', lines: 5 }, at);
    };

    // Week 1 resets after 7 days.
    expect(rollingUsageGate.getRollingUsage('build', undefined, start + DAY).weekResetsAt).toBe(start + 7 * DAY);

    // Week 7 (days 43–49): used up, resets at day 49 as usual — buy or wait.
    const week7 = start + 45 * DAY;
    fill(week7);
    expect(rollingUsageGate.getRollingUsage('build', undefined, week7).weekResetsAt).toBe(start + 49 * DAY);
    expect(rollingUsageGate.isBuildFinalWeek('build', week7)).toBe(false);
    const w7 = rollingUsageGate.canStartGeneration('build', undefined, week7);
    expect(w7.allowed).toBe(false);
    expect(w7.reason).toContain('Buy Paw Compute');

    // Week 8 (days 50–56): one fresh 155, no reset after — access ends at day 56.
    for (const day of [49.5, 52, 55.9]) {
      expect(rollingUsageGate.isBuildFinalWeek('build', start + day * DAY)).toBe(true);
      expect(rollingUsageGate.getRollingUsage('build', undefined, start + day * DAY).weekResetsAt).toBe(endsAt);
    }
    const week8 = start + 50 * DAY;
    expect(rollingUsageGate.isFileCapReached('build', week8)).toBe(false);
    fill(week8);
    const w8 = rollingUsageGate.canStartGeneration('build', undefined, week8);
    expect(w8.allowed).toBe(false);
    expect(w8.reason).toContain('will not reset again');
    expect(w8.reason).toContain('Upgrade to Pro');
    expect(w8.reason).not.toMatch(/resets automatically/);
    expect(rollingUsageGate.fileCapMessage('build', week8)).toContain('will not reset again');
    // Still used up right up to the end — nothing resets in week 8.
    expect(rollingUsageGate.isFileCapReached('build', start + 55 * DAY)).toBe(true);
    expect(rollingUsageGate.isFileCapReached('build', endsAt - 1000)).toBe(true);
  });

  it('purchased Paw Compute continues past the cap on Go and paid tiers', () => {
    vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue('go');
    vi.spyOn(entitlementService, 'currentProMaxVariant').mockReturnValue(undefined);
    const bonus = vi.spyOn(entitlementService, 'getStandardBonusCreditsRemaining').mockReturnValue(0);
    writeFiles(75);
    const request = { type: 'writeFile' as const, path: path.join(projectDir, 'bought.ts'), content: 'x', confirmed: true };
    expect(enforceFileCap(request)).toMatchObject({ ok: false });
    bonus.mockReturnValue(120);
    expect(enforceFileCap(request)).toBeNull();
  });

  it('classifies: a new file counts; an edit of 30+ changed lines counts; a smaller edit does not', () => {
    const existing = path.join(projectDir, 'existing.ts');
    fs.writeFileSync(existing, lines(100));

    expect(classifyFileChange({ type: 'writeFile', path: path.join(projectDir, 'new.ts'), content: 'x' })).toMatchObject({ kind: 'create', counted: true });

    const small = lines(100).replace('line 10\n', 'changed 10\n');
    expect(classifyFileChange({ type: 'writeFile', path: existing, content: small })).toMatchObject({ kind: 'edit', lines: 1, counted: false });

    const big = [lines(10), lines(30, 'rewritten'), lines(100).split('\n').slice(40).join('\n')].join('\n');
    expect(classifyFileChange({ type: 'writeFile', path: existing, content: big })).toMatchObject({ kind: 'edit', lines: 30, counted: true });

    const hunk = (n: number) => ({ contextBefore: [], oldLines: Array(n).fill('a'), newLines: Array(n).fill('b'), contextAfter: [] });
    expect(classifyFileChange({ type: 'applyCodeEdit', path: existing, edits: [hunk(10), hunk(19)] } as never)).toMatchObject({ lines: 19 + 10, counted: false });
    expect(classifyFileChange({ type: 'applyCodeEdit', path: existing, edits: [hunk(10), hunk(20)] } as never)).toMatchObject({ lines: 30, counted: true });

    expect(changedLineCount('a\nb\nc', 'a\nb\nc')).toBe(0);
    expect(changedLineCount('a\r\nb', 'a\nb')).toBe(0);
  });

  it('every counted change counts — the same file edited heavily twice counts twice', () => {
    usageEventStore.recordFileWrite('C:\\project\\src\\a.ts', { kind: 'create', lines: 50 });
    usageEventStore.recordFileWrite('C:\\project\\src\\a.ts', { kind: 'edit', lines: 40 });
    usageEventStore.recordFileWrite('c:/project/src/a.ts', { kind: 'edit', lines: 35 });
    expect(usageEventStore.countFileChangesSince(0)).toBe(3);
  });

  it('Go: at 75 counted changes new files, big edits and new turns are blocked; small edits are not', () => {
    const now = Date.now();
    writeFiles(74);
    expect(rollingUsageGate.canMakeFileChange('go', true, now)).toBe(true);
    expect(rollingUsageGate.canStartGeneration('go', undefined, now).allowed).toBe(true);

    writeFiles(1, 'src/last');
    expect(rollingUsageGate.isFileCapReached('go', now)).toBe(true);
    expect(rollingUsageGate.canMakeFileChange('go', true, now)).toBe(false);
    expect(rollingUsageGate.canMakeFileChange('go', false, now)).toBe(true);

    const check = rollingUsageGate.canStartGeneration('go', undefined, now);
    expect(check.allowed).toBe(false);
    // Presented as the Paw Compute limit — never as a file count — and Go gets no "wait" option.
    expect(check.reason).toContain('Paw Compute');
    expect(check.reason).toContain('Upgrade your plan or buy Paw Compute');
    expect(check.reason).not.toMatch(/file/i);
    expect(check.reason).not.toMatch(/wait/i);
  });

  it('paid tiers are told they can wait for the reset or buy', () => {
    const now = Date.now();
    writeFiles(225);
    const check = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Wait for your weekly reset or buy Paw Compute');
    expect(check.reason).not.toMatch(/file/i);
    expect(rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x').allowed).toBe(true); // 225 < 375
  });

  it('resets with the weekly cycle', () => {
    const now = Date.now();
    writeFiles(225);
    expect(rollingUsageGate.isFileCapReached('pro', now)).toBe(true);
    expect(rollingUsageGate.isFileCapReached('pro', now + 7 * DAY + 1000)).toBe(false);
  });

  it('execution boundary: blocks counted changes past the cap, allows small edits, records only successful counted writes', () => {
    vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue('go');
    vi.spyOn(entitlementService, 'currentProMaxVariant').mockReturnValue(undefined);
    const existing = path.join(projectDir, 'existing.ts');
    fs.writeFileSync(existing, lines(100));
    writeFiles(75);

    expect(enforceFileCap({ type: 'writeFile', path: path.join(projectDir, 'brand-new.ts'), content: 'x', confirmed: true })).toMatchObject({ ok: false, reason: 'usage-restricted' });
    expect(enforceFileCap({ type: 'writeFile', path: existing, content: lines(100).replace('line 5\n', 'x\n'), confirmed: true })).toBeNull();
    expect(enforceFileCap({ type: 'writeFile', path: existing, content: lines(100, 'new'), confirmed: true })).toMatchObject({ ok: false });
    expect(enforceFileCap({ type: 'runCommand', command: 'npm test', cwd: projectDir } as never)).toBeNull();

    // Below the cap (Pro): a counted change is recorded only once it actually succeeds; a small edit never is.
    vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue('pro');
    const before = usageEventStore.countFileChangesSince(0);

    const failed = { type: 'writeFile' as const, path: path.join(projectDir, 'failed.ts'), content: 'x', confirmed: true };
    expect(enforceFileCap(failed)).toBeNull();
    recordCodeFileWrite(failed, { ok: false, reason: 'failed', message: 'disk full' });
    expect(usageEventStore.countFileChangesSince(0)).toBe(before);

    const small = { type: 'writeFile' as const, path: existing, content: lines(100).replace('line 5\n', 'x\n'), confirmed: true };
    expect(enforceFileCap(small)).toBeNull();
    recordCodeFileWrite(small, { ok: true });
    expect(usageEventStore.countFileChangesSince(0)).toBe(before);

    const created = { type: 'writeFile' as const, path: path.join(projectDir, 'created.ts'), content: 'x', confirmed: true };
    expect(enforceFileCap(created)).toBeNull();
    recordCodeFileWrite(created, { ok: true });
    expect(usageEventStore.countFileChangesSince(0)).toBe(before + 1);

    const bigEdit = { type: 'writeFile' as const, path: existing, content: lines(100, 'new'), confirmed: true };
    expect(enforceFileCap(bigEdit)).toBeNull();
    recordCodeFileWrite(bigEdit, { ok: true });
    expect(usageEventStore.countFileChangesSince(0)).toBe(before + 2);
  });

  it('autonomous-run writes are exempt only for accounts that actually have Autonomous Work', () => {
    vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue('go');
    writeFiles(75);
    const request = { type: 'writeFile' as const, path: path.join(projectDir, 'auto.ts'), content: 'x', confirmed: true, autonomousRunId: 'run-1' };

    vi.spyOn(entitlementService, 'isFeatureAvailable').mockReturnValue(false); // spoofed marker on Go
    expect(enforceFileCap(request)).toMatchObject({ ok: false });

    vi.spyOn(entitlementService, 'isFeatureAvailable').mockImplementation((f) => f === 'autonomousTaskBilling');
    expect(enforceFileCap(request)).toBeNull();
    const before = usageEventStore.countFileChangesSince(0);
    recordCodeFileWrite(request, { ok: true });
    expect(usageEventStore.countFileChangesSince(0)).toBe(before);
  });
});
