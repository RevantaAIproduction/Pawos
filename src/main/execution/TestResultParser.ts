import type { TestRunSummary } from '../../shared/actions/ExecutionLifecycle';

const TEST_COMMAND_PATTERN = /\b(npm\s+(run\s+)?test|yarn\s+test|pnpm\s+test|jest|vitest|pytest|mocha|go\s+test)\b/i;

/** Best-effort — a command string looking like a test-runner invocation, not a guarantee it produces parseable output. */
export function looksLikeTestCommand(command: string): boolean {
  return TEST_COMMAND_PATTERN.test(command);
}

/**
 * Best-effort regex parse of known test-runner summary lines (Jest/Vitest,
 * Mocha, pytest). Never fabricates pass/fail counts — if no recognized
 * summary line is found, falls back to exit-code-only status (the exit
 * code itself is real signal even without granular counts: 'failed' for
 * a non-zero exit, 'passed' for a zero exit).
 */
export function parseTestOutput(output: string, exitCode: number | null): TestRunSummary {
  const tail = output.trim().slice(-500) || undefined;

  // Jest/Vitest: "Tests:       2 failed, 8 passed, 10 total"
  const jestMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/i);
  if (jestMatch) {
    const failed = jestMatch[1] ? Number(jestMatch[1]) : 0;
    const passed = jestMatch[2] ? Number(jestMatch[2]) : 0;
    const total = Number(jestMatch[3]);
    return { status: failed > 0 ? 'failed' : 'passed', passed, failed, total, failureDetail: failed > 0 ? tail : undefined };
  }

  // Mocha: "10 passing" / "2 failing"
  const mochaPassing = output.match(/(\d+)\s+passing/i);
  const mochaFailing = output.match(/(\d+)\s+failing/i);
  if (mochaPassing || mochaFailing) {
    const passed = mochaPassing ? Number(mochaPassing[1]) : 0;
    const failed = mochaFailing ? Number(mochaFailing[1]) : 0;
    return { status: failed > 0 ? 'failed' : 'passed', passed, failed, total: passed + failed, failureDetail: failed > 0 ? tail : undefined };
  }

  // pytest: "5 passed, 1 failed in 2.34s" / "5 passed in 1.2s"
  const pytestMatch = output.match(/(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?in\s+[\d.]+s/i);
  if (pytestMatch && (pytestMatch[1] || pytestMatch[2])) {
    const failed = pytestMatch[1] ? Number(pytestMatch[1]) : 0;
    const passed = pytestMatch[2] ? Number(pytestMatch[2]) : 0;
    return { status: failed > 0 ? 'failed' : 'passed', passed, failed, total: passed + failed, failureDetail: failed > 0 ? tail : undefined };
  }

  return { status: exitCode === 0 ? 'passed' : 'failed', failureDetail: exitCode !== 0 ? tail : undefined };
}
