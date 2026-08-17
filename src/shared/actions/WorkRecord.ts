import type { ExecutionRecord } from './ExecutionRecordTypes';
import type {
  WorkRecord,
  WorkRecordArchitecture,
  WorkRecordBlockedItem,
  WorkRecordBlockedSummary,
  WorkRecordCommandEvidence,
  WorkRecordDiffEvidence,
  WorkRecordEvidenceState,
  WorkRecordFileEvidence,
  WorkRecordVerificationEvidence,
  WorkRecordSection,
  WorkRecordState,
  WorkRecordTimelineItem,
} from './WorkRecordTypes';

const SECRET_PATTERN = /(token|secret|password|api[_-]?key|oauth|credential|database_url|connection|string)/i;

export function redactSecretText(value: string): string {
  if (!value) return value;
  return value
    .split(/\s+/)
    .map((part) => {
      const key = part.split('=')[0] ?? '';
      if (SECRET_PATTERN.test(key)) return `${key}=<redacted>`;
      return part;
    })
    .join(' ');
}

function section<T>(items: T[], note?: string): WorkRecordSection<T> {
  return {
    status: items.length > 0 ? 'available' : 'empty',
    items,
    note: items.length > 0 ? note : note ?? 'No evidence recorded for this section yet.',
  };
}

function stateFromExecution(record: ExecutionRecord): WorkRecordState {
  if (record.status === 'in_progress') {
    const hasTesting = record.verificationResults.length > 0 || (record.verificationEvidence?.length ?? 0) > 0;
    return hasTesting ? 'TESTING' : record.timeline.length > 0 ? 'BUILDING' : 'APPROVED';
  }
  if (record.status === 'completed') return 'COMPLETED';
  if (record.status === 'failed') return 'FAILED';
  return 'STOPPED';
}

function completionFromExecution(record: ExecutionRecord): WorkRecord['completion'] {
  if (record.status === 'completed') return { status: 'COMPLETED' };
  if (record.status === 'failed') {
    return {
      status: 'FAILED',
      reason: record.stoppedReason ?? (record.summary || 'The work failed before completion.'),
      nextAction: record.nextAction ?? 'Review the failed step and retry after fixing the blocker.',
    };
  }
  if (record.status === 'abandoned') {
    return {
      status: 'STOPPED',
      reason: record.stoppedReason ?? (record.summary || 'PawOS stopped before the work completed.'),
      nextAction: record.nextAction ?? 'Open the work record and decide whether to resume, modify the plan, or upgrade if required.',
    };
  }
  return { status: 'INCOMPLETE', reason: 'Work is still running.' };
}

function commandEvidence(record: ExecutionRecord): WorkRecordCommandEvidence[] {
  if (record.commandEvidence?.length) {
    return record.commandEvidence.map((item) => ({
      command: item.safeCommand || redactSecretText(item.command),
      cwd: item.cwd,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      durationMs: item.durationMs,
      exitCode: item.exitCode,
      // Preserved as its own real state rather than folded into 'failed' —
      // a blocked command is evidence of a denial, not evidence of an
      // attempt that ran and failed, and the two must read differently.
      status: item.status,
      output: item.output ? redactSecretText(item.output) : undefined,
    }));
  }
  return record.commandsExecuted.map((command) => ({ command: redactSecretText(command), status: 'completed' }));
}

function fileEvidence(record: ExecutionRecord): WorkRecordFileEvidence[] {
  if (record.fileEvidence?.length) {
    return record.fileEvidence.map((item) => ({
      path: item.relativePath ?? item.path,
      change: item.operation === 'CREATE' ? 'created' : item.operation === 'MODIFY' ? 'modified' : item.operation === 'DELETE' ? 'deleted' : 'renamed',
      timestamp: item.timestamp,
      result: item.result,
    }));
  }
  const created = record.filesCreated.map((path) => ({ path, change: 'created' as const }));
  const modified = record.filesModified.map((path) => ({ path, change: 'modified' as const }));
  return [...created, ...modified];
}

function diffEvidence(record: ExecutionRecord): WorkRecordDiffEvidence[] {
  return (record.diffEvidence ?? []).map((item) => ({
    summary: item.summary,
    filesChanged: item.filesChanged,
  }));
}

function verificationEvidence(record: ExecutionRecord): WorkRecordVerificationEvidence[] {
  if (record.verificationEvidence?.length) {
    return record.verificationEvidence.map((item) => ({
      type: item.type,
      action: redactSecretText(item.action),
      status: item.status,
      summary: redactSecretText(item.summary),
      failureReason: item.failureReason ? redactSecretText(item.failureReason) : undefined,
      timestamp: item.timestamp,
    }));
  }
  return record.verificationResults.map((result) => ({
    type: 'VALIDATION',
    action: 'legacy verification',
    status: result.ok ? 'passed' : 'failed',
    summary: `${result.ok ? 'Passed' : 'Failed'}: ${redactSecretText(result.description)}`,
    timestamp: record.completedAt ?? record.startedAt,
  }));
}

function timeline(record: ExecutionRecord): WorkRecordTimelineItem[] {
  if (record.timeline.length === 0) {
    return [
      {
        timestamp: record.startedAt,
        label: record.status === 'in_progress' ? 'Work record created' : 'Work recorded',
        status: record.status === 'failed' ? 'failed' : record.status === 'abandoned' ? 'stopped' : 'completed',
      },
    ];
  }
  return record.timeline.map((entry) => ({
    timestamp: entry.startedAt,
    label: entry.label || entry.type,
    status: entry.ok ? 'completed' : 'failed',
    detail: entry.endedAt > entry.startedAt ? `${Math.max(1, Math.round((entry.endedAt - entry.startedAt) / 1000))}s` : undefined,
  }));
}

// ExecutionRecord (frozen, ExecutionRecordTypes.ts) has no structured plan/architecture field of
// its own — only derived evidence (commands/files/verification) plus the model's own free-text
// `summary`. These sections must never infer a plan or architecture from unrelated evidence (that
// would be fabrication) — but when the model's own recorded text contains a real Markdown heading
// like "## Plan" or "## Architecture", that heading and the text under it IS real, direct evidence
// (the model's own words), not an inference. Extracting it honestly reflects what was actually
// written; extraction failing (no matching heading) still yields the honest empty state below.
const HEADING_LINE_RE = /^(#{1,6})\s+(.*)$/;

function extractMarkdownSection(text: string | undefined, headingPattern: RegExp): string | null {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const at = (idx: number): string => lines[idx] ?? '';
  let startIndex = -1;
  let startLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = HEADING_LINE_RE.exec(at(i));
    if (!match) continue;
    if (headingPattern.test((match[2] ?? '').trim())) {
      startIndex = i;
      startLevel = (match[1] ?? '#').length;
      break;
    }
  }
  if (startIndex === -1) return null;

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = HEADING_LINE_RE.exec(at(i));
    if (match && (match[1] ?? '#').length <= startLevel) {
      endIndex = i;
      break;
    }
  }
  const body = lines.slice(startIndex + 1, endIndex).join('\n').trim();
  return body.length > 0 ? body : null;
}

function splitPlanItems(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim()) items.push(current.trim());
    current = '';
  };
  for (const line of lines) {
    const bulletMatch = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (bulletMatch) {
      flush();
      current = bulletMatch[1] ?? '';
    } else if (line.trim() === '') {
      flush();
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  flush();
  return items.length > 0 ? items : [text.trim()];
}

const ARCHITECTURE_HEADING_RE = /^(architecture|technical architecture|system architecture|tech stack|technology stack)\b/i;
const PLAN_HEADING_RE = /^(plan|implementation plan|project plan|steps|approach)\b/i;

function architecture(record: ExecutionRecord): WorkRecordSection<WorkRecordArchitecture> {
  const extracted = extractMarkdownSection(record.summary, ARCHITECTURE_HEADING_RE);
  if (!extracted) {
    return { status: 'empty', items: [], note: 'Architecture not captured for this work.' };
  }
  return { status: 'available', items: [{ nodes: [], edges: [], diagram: extracted }] };
}

function plan(record: ExecutionRecord): WorkRecordSection<string> {
  const extracted = extractMarkdownSection(record.summary, PLAN_HEADING_RE);
  if (!extracted) {
    return { status: 'empty', items: [], note: 'Plan not captured for this work.' };
  }
  return { status: 'available', items: splitPlanItems(extracted) };
}

/**
 * Only computed for STOPPED/FAILED work. Every line is grounded in real ExecutionRecord evidence:
 * "completedSteps" comes straight from real timeline entries that actually succeeded (ok === true).
 * "incompleteAreas" is derived per-category from the evidence PawOS itself already captured —
 * 'blocked' only when a real commandEvidence/fileEvidence entry recorded status/result === 'blocked',
 * 'not_executed' only when that category has zero attempted entries. Never infer that a category was
 * attempted just because it would normally come next in a coding task.
 */
function blockedSummary(record: ExecutionRecord, completion: WorkRecord['completion']): WorkRecordBlockedSummary | undefined {
  if (completion.status !== 'FAILED' && completion.status !== 'STOPPED') return undefined;

  const completedSteps = record.timeline.filter((entry) => entry.ok).map((entry) => entry.label || entry.type);
  const incompleteAreas: WorkRecordBlockedItem[] = [];

  const commandItems = record.commandEvidence ?? [];
  const hasBlockedCommand = commandItems.some((item) => item.status === 'blocked');
  const hasAttemptedCommand = commandItems.length > 0 || record.commandsExecuted.length > 0;
  if (hasBlockedCommand) incompleteAreas.push({ label: 'Run commands', status: 'blocked' });
  else if (!hasAttemptedCommand) incompleteAreas.push({ label: 'Run commands', status: 'not_executed' });

  const fileItems = record.fileEvidence ?? [];
  const hasBlockedFile = fileItems.some((item) => item.result === 'blocked');
  const hasAttemptedFile = fileItems.length > 0 || record.filesCreated.length + record.filesModified.length > 0;
  if (hasBlockedFile) incompleteAreas.push({ label: 'Create or modify files', status: 'blocked' });
  else if (!hasAttemptedFile) incompleteAreas.push({ label: 'Create or modify files', status: 'not_executed' });

  const verificationItems = record.verificationEvidence ?? [];
  const attemptedBuild = verificationItems.some((item) => item.type === 'BUILD' && (item.status === 'passed' || item.status === 'failed'));
  if (!attemptedBuild) incompleteAreas.push({ label: 'Run build', status: 'not_executed' });

  const attemptedTest =
    verificationItems.some((item) => item.type === 'TEST' && (item.status === 'passed' || item.status === 'failed')) ||
    record.verificationResults.length > 0;
  if (!attemptedTest) incompleteAreas.push({ label: 'Run tests', status: 'not_executed' });

  return {
    reason: completion.reason,
    nextAction: completion.nextAction,
    completedSteps,
    incompleteAreas,
  };
}

/**
 * Maps an already-computed WorkRecordSection (plus optional real per-item
 * failure/blocked predicates) onto the explicit CAPTURED/NOT_CAPTURED/
 * NOT_EXECUTED/FAILED/BLOCKED vocabulary — a display categorization of facts
 * that already exist, never a new inference. `neverCaptured` distinguishes
 * Plan/Architecture (an architectural gap in the frozen pipeline) from every
 * other section (where an empty section honestly means "not executed this
 * run", not "can never be captured").
 */
export function evidenceState<T>(
  section: WorkRecordSection<T>,
  options: {
    neverCaptured?: boolean;
    hasBlocked?: (items: T[]) => boolean;
    hasFailed?: (items: T[]) => boolean;
  } = {},
): WorkRecordEvidenceState {
  if (section.items.length === 0) {
    return options.neverCaptured ? 'NOT_CAPTURED' : 'NOT_EXECUTED';
  }
  if (options.hasBlocked?.(section.items)) return 'BLOCKED';
  if (options.hasFailed?.(section.items)) return 'FAILED';
  return 'CAPTURED';
}

export function buildWorkRecord(record: ExecutionRecord): WorkRecord {
  const completion = completionFromExecution(record);
  return {
    id: record.id,
    source: record,
    identity: {
      workId: record.id,
      projectId: record.projectId,
      taskId: record.taskId,
      userId: record.userId,
      runtime: record.runtime,
      organizationId: record.organizationId,
    },
    request: {
      original: record.goal,
      normalizedGoal: record.goal.trim(),
    },
    state: stateFromExecution(record),
    createdAt: record.startedAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    durationMs: record.durationMs,
    timeline: timeline(record),
    plan: plan(record),
    architecture: architecture(record),
    commands: section(commandEvidence(record)),
    files: section(fileEvidence(record)),
    diffs: section(diffEvidence(record), 'No diff evidence recorded.'),
    verification: section(verificationEvidence(record)),
    usage: {
      pawComputeUsed: record.pawComputeUsed,
      pawComputeRemaining: record.pawComputeRemaining,
    },
    completion,
    blocked: blockedSummary(record, completion),
  };
}
