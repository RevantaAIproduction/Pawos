import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type {
  ControlGrantKind,
  RemoteClickPayload,
  RemoteCursorPayload,
  RemoteKeyPayload,
  RemoteTerminalDataPayload,
} from '../../shared/organization/RemoteAssistanceTypes';

type RelayedAction = { requestId: string; kind: ControlGrantKind; request: ActionRequest };
type RelayedResult = { requestId: string; result: ActionResult };

/**
 * Phase 5 — the actual control-transfer mechanism behind Section 6's
 * "Remote Control" grants. Scoping decision (disclosed): rather than
 * synthesizing raw OS-level mouse/keyboard events (which would require a
 * new native input-injection dependency and a far larger security surface
 * than a desktop collaboration feature warrants), the higher-risk grant
 * kinds route through the EXISTING Desktop Execution Engine — the helper's
 * requested action (a terminal command, a file write, a browser action, a
 * deploy/rollback) is relayed to the host over the same Realtime broadcast
 * pattern every other Phase 4/5 feature uses, and executes locally on the
 * host's own machine through the exact same plugins/confirmation gates
 * already in place for every other action in this app. This keeps "no new
 * backend paradigm" (roadmap Section 0) intact and reuses 100% of the
 * confirm-then-retry and destructive-action safety machinery that already
 * exists, rather than building a parallel one for remote input.
 *
 * Move cursor / Click UI are the one exception: those stay UI-layer
 * concerns (a rendered ghost cursor, synthetic DOM events scoped to the
 * shared Workspace Runtime region), not something this service handles.
 *
 * Every relayed action is checked against a live grants map BEFORE
 * executing — the host never trusts that a request it receives implies a
 * live grant; it re-checks fresh state on every single message.
 */
export class RemoteControlHostSession {
  private channel: RealtimeChannel | null = null;
  private terminalProcessId: string | null = null;
  private grantIsActive: (kind: ControlGrantKind) => boolean = () => false;

  async open(
    sessionId: string,
    grantChecker: (kind: ControlGrantKind) => boolean,
    onTerminalStarted: (processId: string) => void
  ): Promise<void> {
    this.grantIsActive = grantChecker;
    const supabase = await getSupabaseClient();
    const channel = supabase.channel(`remote-control:${sessionId}`, { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'action-request' }, async ({ payload }) => {
      const { requestId, kind, request } = payload as RelayedAction;
      if (!this.grantIsActive(kind)) {
        channel.send({
          type: 'broadcast',
          event: 'action-result',
          payload: { requestId, result: { ok: false, message: 'Permission was not granted or has been revoked.' } } satisfies RelayedResult,
        });
        return;
      }
      const result = await ipc.actionExecute(request);
      channel.send({ type: 'broadcast', event: 'action-result', payload: { requestId, result } satisfies RelayedResult });
    });

    channel.on('broadcast', { event: 'terminal-start' }, async () => {
      if (!this.grantIsActive('terminal')) return;
      const homeDir = await ipc.systemGetHomeDir();
      const result = await ipc.remoteAssistanceStartSharedTerminal(homeDir, 'Shared terminal (remote assistance)');
      if (result.ok) {
        this.terminalProcessId = result.info.id;
        onTerminalStarted(result.info.id);
        channel.send({ type: 'broadcast', event: 'terminal-started', payload: { processId: result.info.id } });
      }
    });

    channel.on('broadcast', { event: 'terminal-input' }, async ({ payload }) => {
      if (!this.grantIsActive('terminal') || !this.terminalProcessId) return;
      const { data } = payload as RemoteTerminalDataPayload;
      await ipc.processWriteStdin(this.terminalProcessId, data);
    });

    await new Promise<void>((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()));
    this.channel = channel;
  }

  /** Called by the host's own process:output listener to forward real shell output to the helper. */
  forwardTerminalOutput(processId: string, chunk: string): void {
    if (processId !== this.terminalProcessId) return;
    this.channel?.send({ type: 'broadcast', event: 'terminal-output', payload: { data: chunk } satisfies RemoteTerminalDataPayload });
  }

  async close(): Promise<void> {
    await this.channel?.unsubscribe();
    this.channel = null;
    this.terminalProcessId = null;
  }
}

export class RemoteControlHelperSession {
  private channel: RealtimeChannel | null = null;
  private pending = new Map<string, (result: ActionResult) => void>();

  async open(
    sessionId: string,
    onTerminalOutput: (chunk: string) => void,
    onCursor?: (payload: RemoteCursorPayload) => void
  ): Promise<void> {
    const supabase = await getSupabaseClient();
    const channel = supabase.channel(`remote-control:${sessionId}`, { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'action-result' }, ({ payload }) => {
      const { requestId, result } = payload as RelayedResult;
      this.pending.get(requestId)?.(result);
      this.pending.delete(requestId);
    });
    channel.on('broadcast', { event: 'terminal-output' }, ({ payload }) => onTerminalOutput((payload as RemoteTerminalDataPayload).data));
    if (onCursor) channel.on('broadcast', { event: 'cursor' }, ({ payload }) => onCursor(payload as RemoteCursorPayload));

    await new Promise<void>((resolve) => channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()));
    this.channel = channel;
  }

  /** Submit an action for the host to run locally — resolves once the host reports back. Rejects only on transport timeout; a denied/revoked grant resolves with `{ok:false}`, same as any other ActionResult. */
  submitAction(kind: ControlGrantKind, request: ActionRequest, timeoutMs = 15000): Promise<ActionResult> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The host did not respond in time.'));
      }, timeoutMs);
      this.pending.set(requestId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      this.channel?.send({ type: 'broadcast', event: 'action-request', payload: { requestId, kind, request } satisfies RelayedAction });
    });
  }

  startTerminal(): void {
    this.channel?.send({ type: 'broadcast', event: 'terminal-start', payload: {} });
  }

  sendTerminalInput(data: string): void {
    this.channel?.send({ type: 'broadcast', event: 'terminal-input', payload: { data } satisfies RemoteTerminalDataPayload });
  }

  sendCursor(payload: RemoteCursorPayload): void {
    this.channel?.send({ type: 'broadcast', event: 'cursor', payload });
  }

  sendClick(payload: RemoteClickPayload): void {
    this.channel?.send({ type: 'broadcast', event: 'click', payload });
  }

  sendKey(payload: RemoteKeyPayload): void {
    this.channel?.send({ type: 'broadcast', event: 'key', payload });
  }

  async close(): Promise<void> {
    await this.channel?.unsubscribe();
    this.channel = null;
    this.pending.clear();
  }
}
