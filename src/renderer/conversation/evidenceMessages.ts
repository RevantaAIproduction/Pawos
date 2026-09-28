/**
 * Output/log evidence as a chat message — a labelled code block, never presented as a screenshot.
 * Shared by the live chat (ConversationRuntime) and reopened chats (RestoreConversationAdapter).
 */
export function outputEvidenceMessage(phase: 'before' | 'after', output: { source: string; status: number | null; text: string; timedOut?: boolean }): string {
  const status = output.timedOut
    ? 'timed out'
    : output.status === null
      ? 'no status'
      : /^(GET|POST) /.test(output.source)
        ? `HTTP ${output.status}`
        : `exit code ${output.status}`;
  return [`Output evidence — ${phase} · \`${output.source}\` · ${status}`, '', '```text', output.text.replace(/```/g, "'''"), '```'].join('\n');
}
