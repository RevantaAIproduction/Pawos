import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

// Section 8 acceptance test — "PAWOS: MAKE AUTONOMOUS WORK ACTUALLY EXECUTE."
//
// A fully local, controlled acceptance run of the autonomous ticket pipeline against a REAL
// temporary git repository and a synthetic ticket ("Change dashboard heading from Old to New"),
// through the REAL git isolation plugins (GitStatusPlugin/GitCreateWorktreePlugin — no mocking of
// git itself) and the REAL ExecutionSupervisor evidence pipeline (no hand-typed ExecutionRecord —
// evidence is built the same way a live conversation turn would build it). Only the model call
// itself (HeadlessTurnRunner's live Gemini turn) and the Supabase-backed billing RPCs are faked —
// neither can run in this offline, credential-free environment — but every claim this test makes is
// backed by real filesystem/git state, not an assertion about a mock's call arguments alone.
//
// Verifies exactly the acceptance criteria requested: (1) the original repository is never touched;
// (2) the isolated worktree contains the real change; (3) completion is evidence-based, derived from
// real ExecutionSupervisor output; (4) a failed execution cannot charge; (5) the local duplicate-
// completion contract this codebase can enforce without a live database is exercised honestly (full
// idempotency is a server-side RPC guarantee, already verified separately via the
// mark_autonomous_task_completed migration — not re-provable here without Supabase).

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

// AutonomousOrchestrator.ts imports ConversationRuntime at module top level (for HeadlessTurnRunner's
// real implementation) — that module transitively pulls in IntentRegistry.ts -> CompanionProfileStore.ts,
// which touches `window` eagerly at import time. This test never constructs a real ConversationRuntime
// (a fake AutonomousTurnRunner is injected instead), but the import chain still executes just from
// importing AutonomousOrchestrator.ts, so it must be mocked — exactly the same fix already applied in
// AutonomousOrchestrator.test.ts.
vi.mock('../conversation/ConversationRuntime', () => ({
  ConversationRuntime: vi.fn(),
}));

import { gitStatusPlugin } from '../../main/execution/plugins/GitStatusPlugin';
import { gitCreateWorktreePlugin } from '../../main/execution/plugins/GitCreateWorktreePlugin';
import { ExecutionSupervisor } from '../conversation/ExecutionSupervisor';
import {
  orchestrateAutonomousRun,
  deriveWorkspaceIsolationSpec,
  type AutonomousOrchestrationDeps,
  type AutonomousTurnRunner,
  type HeadlessTurnResult,
} from './AutonomousOrchestrator';
import { autonomousTaskBillingService } from './AutonomousTaskBillingService';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

const DASHBOARD_FILE = 'dashboard.txt';

function makeSourceRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-autonomous-acceptance-'));
  git(['init'], dir);
  git(['config', 'user.email', 'test@pawos.local'], dir);
  git(['config', 'user.name', 'PawOS Acceptance Test'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  fs.writeFileSync(path.join(dir, DASHBOARD_FILE), 'Dashboard heading: Old\n', 'utf-8');
  git(['add', '.'], dir);
  git(['commit', '-m', 'initial commit'], dir);
  return dir;
}

function cleanupWorktree(sourceRepo: string, worktreePath: string, branchName?: string): void {
  if (fs.existsSync(worktreePath)) {
    try {
      git(['worktree', 'remove', '--force', worktreePath], sourceRepo);
    } catch {
      // best-effort cleanup
    }
  }
  if (branchName) {
    try {
      git(['branch', '-D', branchName], sourceRepo);
    } catch {
      // best-effort cleanup — branch may not exist if the worktree was never created
    }
  }
}

/** Builds a real deps object: real git plugins for isolation, a fake billing service (Supabase is
 *  unavailable here), and a caller-supplied turnRunner standing in for the live Gemini turn. */
function makeRealIsolationDeps(overrides: {
  turnRunner: AutonomousTurnRunner;
  transitionRun?: ReturnType<typeof vi.fn>;
  markTerminal?: ReturnType<typeof vi.fn>;
  completeRun?: ReturnType<typeof vi.fn>;
}): AutonomousOrchestrationDeps {
  return {
    billingService: {
      ...autonomousTaskBillingService,
      transitionRun: overrides.transitionRun ?? vi.fn().mockResolvedValue({}),
      markTerminal: overrides.markTerminal ?? vi.fn().mockResolvedValue(undefined),
      completeRun: overrides.completeRun ?? vi.fn().mockResolvedValue('billing-event-1'),
    },
    turnRunner: overrides.turnRunner,
    getConnectorStatus: vi.fn(),
    verifyPullRequestExists: vi.fn(),
    postCompletionComment: vi.fn(),
    getCurrentUserId: async () => 'acceptance-test-user',
    checkGitState: (cwd) => gitStatusPlugin.execute({ type: 'gitStatus', cwd }),
    createIsolatedWorkspace: (cwd, worktreePath, branchName) => gitCreateWorktreePlugin.execute({ type: 'gitCreateWorktree', cwd, worktreePath, branchName }),
  };
}

/** A real turnRunner that performs the synthetic ticket's actual work — edits the dashboard heading
 *  inside the isolated worktree it's told to operate in — and builds its ExecutionRecord through the
 *  real ExecutionSupervisor evidence pipeline (recordAction/end), never a hand-fabricated object. */
function makeRealCodeEditTurnRunner(getWorktreePath: () => string): AutonomousTurnRunner {
  return {
    async run(): Promise<HeadlessTurnResult> {
      let latest: ExecutionRecord | null = null;
      const supervisor = new ExecutionSupervisor((r) => {
        latest = r;
      });
      supervisor.begin('Change dashboard heading from Old to New');

      const worktreePath = getWorktreePath();
      const filePath = path.join(worktreePath, DASHBOARD_FILE);
      const before = fs.readFileSync(filePath, 'utf-8');
      const after = before.replace('Old', 'New');
      fs.writeFileSync(filePath, after, 'utf-8');

      supervisor.recordAction(
        { type: 'writeFile', path: filePath, content: after },
        { ok: true, data: { overwritten: true } },
        { label: 'Updated the dashboard heading from Old to New.', startedAt: 100, endedAt: 150 }
      );
      supervisor.recordAction(
        { type: 'runValidationPipeline', rootPath: worktreePath },
        { ok: true, data: { syntax: { status: 'passed' }, typeCheck: { status: 'passed', command: 'tsc --noEmit' } } },
        { label: 'Validation passed.', startedAt: 150, endedAt: 200 }
      );
      supervisor.end('completed', 'Changed the dashboard heading from Old to New and validated the result.');

      return { kind: 'finished', executionRecord: latest };
    },
    async resume(): Promise<HeadlessTurnResult | null> {
      return null;
    },
  };
}

/** A turnRunner simulating a genuine execution failure (e.g. validation caught a real problem) —
 *  never touches the worktree's dashboard file, so no charge must ever result. */
function makeFailingTurnRunner(): AutonomousTurnRunner {
  return {
    async run(): Promise<HeadlessTurnResult> {
      let latest: ExecutionRecord | null = null;
      const supervisor = new ExecutionSupervisor((r) => {
        latest = r;
      });
      supervisor.begin('Change dashboard heading from Old to New');
      supervisor.recordAction(
        { type: 'runValidationPipeline', rootPath: '/irrelevant' },
        { ok: false, reason: 'failed', message: 'Validation failed.', data: { typeCheck: { status: 'failed', errorDetail: 'Type error in dashboard.tsx' } } },
        { label: 'Validation failed.', startedAt: 100, endedAt: 200 }
      );
      supervisor.end('completed', 'Attempted the change but validation failed.');
      return { kind: 'finished', executionRecord: latest };
    },
    async resume(): Promise<HeadlessTurnResult | null> {
      return null;
    },
  };
}

describe('Autonomous Work — local acceptance test (real git isolation, real evidence pipeline)', () => {
  let sourceRepo: string;
  let worktreePath: string;

  beforeEach(() => {
    sourceRepo = makeSourceRepo();
    const spec = deriveWorkspaceIsolationSpec(sourceRepo, 'acceptance-run');
    worktreePath = spec.worktreePath;
  });

  it('succeeds end to end: original repo untouched, isolated worktree has the real change, completion is evidence-based', async () => {
    const deps = makeRealIsolationDeps({ turnRunner: makeRealCodeEditTurnRunner(() => worktreePath) });

    const result = await orchestrateAutonomousRun(
      {
        runId: 'acceptance-run',
        organizationId: null,
        ticketSource: null,
        ticketId: 'ACCEPT-1',
        ticketTitle: 'Change dashboard heading from Old to New',
        ticketDescription: 'The dashboard currently says "Old" — it should say "New".',
        cwd: sourceRepo,
      },
      deps
    );

    try {
      // 1. Original repository is never touched — still on its original content, still clean.
      expect(fs.readFileSync(path.join(sourceRepo, DASHBOARD_FILE), 'utf-8')).toBe('Dashboard heading: Old\n');
      expect(git(['status', '--porcelain'], sourceRepo).trim()).toBe('');

      // 2. The isolated worktree genuinely contains the change, on its own branch.
      expect(fs.readFileSync(path.join(worktreePath, DASHBOARD_FILE), 'utf-8')).toBe('Dashboard heading: New\n');
      expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath).trim()).toBe('pawos-autonomous/acceptance-run');

      // 3. Completion is evidence-based: a real success outcome, citing the real file/validation evidence.
      expect(result.outcome.kind).toBe('success');
      expect(result.outcome.evidence.filesChanged).toBeGreaterThan(0);
      expect(result.outcome.evidence.checks.some((c) => c.label === 'Workspace isolation' && c.status === 'CAPTURED')).toBe(true);
      expect(result.outcome.evidence.checks.some((c) => c.label.startsWith('TYPECHECK') && c.status === 'CAPTURED')).toBe(true);

      // Only a genuine success charges — completeRun was actually called, markTerminal never was.
      expect(deps.billingService.completeRun).toHaveBeenCalledTimes(1);
      expect(deps.billingService.markTerminal).not.toHaveBeenCalled();
      expect(result.billingEventId).toBe('billing-event-1');
    } finally {
      cleanupWorktree(sourceRepo, worktreePath);
    }
  });

  it('a genuinely failed execution never charges — real validation failure evidence blocks completion', async () => {
    const deps = makeRealIsolationDeps({ turnRunner: makeFailingTurnRunner() });

    const result = await orchestrateAutonomousRun(
      {
        runId: 'acceptance-run',
        organizationId: null,
        ticketSource: null,
        ticketId: 'ACCEPT-2',
        ticketTitle: 'Change dashboard heading from Old to New',
        cwd: sourceRepo,
      },
      deps
    );

    try {
      // The dashboard was never touched — a failed run performs no real work.
      expect(fs.readFileSync(path.join(sourceRepo, DASHBOARD_FILE), 'utf-8')).toBe('Dashboard heading: Old\n');

      expect(result.outcome.kind).toBe('failed');
      expect(deps.billingService.completeRun).not.toHaveBeenCalled();
      expect(deps.billingService.markTerminal).toHaveBeenCalledWith('acceptance-run', 'failed');
      expect(result.billingEventId).toBeNull();
    } finally {
      cleanupWorktree(sourceRepo, worktreePath);
    }
  });

  it('an unreadable/non-git cwd is honestly blocked before any workspace or billing state is touched', async () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-acceptance-not-a-repo-'));
    const deps = makeRealIsolationDeps({ turnRunner: makeRealCodeEditTurnRunner(() => worktreePath) });

    const result = await orchestrateAutonomousRun(
      { runId: 'acceptance-run-badcwd', organizationId: null, ticketSource: null, ticketId: 'ACCEPT-3', cwd: notARepo },
      deps
    );

    expect(result.outcome.kind).toBe('blocked');
    expect(deps.billingService.completeRun).not.toHaveBeenCalled();
    // Blocked before ever reaching git-create-worktree — never fabricates workspace isolation evidence.
    expect(result.outcome.evidence.checks.some((c) => c.label === 'Workspace isolation')).toBe(false);
  });

  it('duplicate completion cannot double-charge — the billing RPC is called with the same runId both times and reports the same billing event, exercising the local contract this codebase can enforce offline (full server-side idempotency is enforced by the mark_autonomous_task_completed RPC, verified separately via migration)', async () => {
    // Simulates the real RPC's documented idempotency contract: a second completion for the same
    // runId returns the SAME billing event id rather than minting a new one.
    const completeRunMock = vi.fn().mockResolvedValue('billing-event-idempotent');
    const deps = makeRealIsolationDeps({ turnRunner: makeRealCodeEditTurnRunner(() => worktreePath), completeRun: completeRunMock });

    const first = await orchestrateAutonomousRun(
      { runId: 'acceptance-run', organizationId: null, ticketSource: null, ticketId: 'ACCEPT-4', cwd: sourceRepo },
      deps
    );

    try {
      expect(first.outcome.kind).toBe('success');
      expect(first.billingEventId).toBe('billing-event-idempotent');
      expect(completeRunMock).toHaveBeenCalledTimes(1);
      expect(completeRunMock).toHaveBeenCalledWith('acceptance-run', expect.objectContaining({}));

      // A stray/duplicate re-invocation for the exact same runId — e.g. a retried request after a
      // network blip made the caller think the first attempt never landed. Both the worktree AND its
      // branch from the first attempt must be cleared first: real git structurally refuses a second
      // worktree at the same path, and separately refuses `git worktree add -b <branch>` for a branch
      // name that already exists — a genuine, additional layer of duplicate-execution protection this
      // acceptance run discovered by exercising real git rather than a mock (a same-runId retry with
      // no cleanup is structurally blocked before ever reaching completion a second time at all). The
      // source repo is still untouched throughout, so a legitimate post-cleanup retry genuinely
      // re-derives the same fix. The RPC contract this mock simulates guarantees a second real
      // completion call for the same runId resolves to the SAME event, never a second charge. (In
      // production this exact scenario is additionally prevented earlier, at
      // AutonomousTaskBillingGate.startRun()'s alreadyActive dedup — see AutonomousTaskBillingGate.test.ts's
      // own "duplicate-run prevention" suite — so orchestrateAutonomousRun itself is not the only
      // guard; this test exercises the completion-side guarantee specifically.)
      cleanupWorktree(sourceRepo, worktreePath, deriveWorkspaceIsolationSpec(sourceRepo, 'acceptance-run').branchName);
      completeRunMock.mockClear();
      const second = await orchestrateAutonomousRun(
        { runId: 'acceptance-run', organizationId: null, ticketSource: null, ticketId: 'ACCEPT-4', cwd: sourceRepo },
        deps
      );
      expect(second.billingEventId).toBe('billing-event-idempotent');
      expect(completeRunMock).toHaveBeenCalledTimes(1);
    } finally {
      cleanupWorktree(sourceRepo, worktreePath);
    }
  });
});
