import type { ActionResult } from '../../shared/actions/ActionTypes';

/** Shared honest failure phrasing every plugin's describeDone() falls back to — never "Action failed," always says what actually happened. */
export function describeFailure(result: Extract<ActionResult, { ok: false }>): string {
  if (result.reason === 'requires-confirmation') {
    return "That would change something on your system, so I'll wait for your confirmation first.";
  }
  if (result.reason === 'not-implemented') {
    return "I can't do that yet — it isn't wired up on this device.";
  }
  return result.message ? `I couldn't finish that — ${result.message}` : "I couldn't finish that.";
}
