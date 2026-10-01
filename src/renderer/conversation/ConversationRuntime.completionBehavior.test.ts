import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ReasoningProvider, ReasoningProviderCallbacks, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';

// Several tests here drive full multi-turn runtime flows (and the first one pays the cold import of
// the ConversationRuntime module graph); under full-suite parallel load that can exceed vitest's 5s
// default even though each flow settles quickly on its own.
vi.setConfig({ testTimeout: 20_000 });

const stt = { name: 'test', isSupported: () => true, start: async () => ({ stop: () => {}, cancel: () => {} }) };
const tts = { name: 'test', supportsVisemes: false, isSupported: () => true, speak: async () => {}, stop: () => {} };

describe('ConversationRuntime Completion & Error Recovery Behavior', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    });
  });

  it('does not immediately mark task COMPLETED on recoverable error, allows loop, reaches COMPLETED on success', async () => {
    let callCount = 0;
    const mockProvider: ReasoningProvider = {
      id: 'mock',
      label: 'Mock',
      isSupported: () => true,
      streamResponse(request: ReasoningProviderRequest, callbacks?: ReasoningProviderCallbacks) {
        callCount++;
        if (callCount === 1) {
          setTimeout(() => {
            callbacks?.onToolCall?.({
              id: 'call_1',
              name: 'run_command',
              arguments: { command: 'npm run build', cwd: 'C:/projects/site' }
            });
            callbacks?.onComplete('');
          }, 0);
          return { cancel: () => {} } as any;
        }
        if (callCount === 2) {
          setTimeout(() => {
            callbacks?.onToolCall?.({
              id: 'call_2',
              name: 'run_command',
              arguments: { command: 'npm run build', cwd: 'C:/projects/site' }
            });
            callbacks?.onComplete('');
          }, 0);
          return { cancel: () => {} } as any;
        }
        setTimeout(() => {
          callbacks?.onDelta('Home page added successfully. Status: Completed');
          callbacks?.onComplete('Home page added successfully. Status: Completed');
        }, 0);
        return { cancel: () => {} } as any;
      }
    };

    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');

    const runtime = new ConversationRuntime({
      speechRecognition: stt as any,
      speechSynthesis: tts as any,
      reasoningRuntime: new ReasoningRuntime(mockProvider),
      executeAction: async (req: ActionRequest): Promise<ActionResult> => {
        if (req.type === 'runCommand') {
          if (callCount === 1) {
            return { ok: false, reason: 'failed', message: 'Build failed', data: { exitCode: 1, stdout: '', stderr: 'Build failed' } };
          }
          return { ok: true, data: { exitCode: 0, stdout: 'Build passed', stderr: '' } };
        }
        return { ok: true, data: {} };
      },
      // Permission already granted up front — this test is about recovery, not the chat "allow" question.
      getExecutionMode: () => 'bypass',
      isBypassPermissionsEnabled: () => true,
    });

    runtime.submitTranscript('Add a home page.');
    // Fail -> diagnose -> retry -> succeed -> summarize spans several async round-trips; wait for the
    // turn to genuinely settle (bounded) rather than a fixed sleep.
    for (let i = 0; i < 300 && (runtime.getSnapshot().state !== 'idle' || callCount < 3); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    
    const snapshot = runtime.getSnapshot();
    expect(snapshot.state).toBe('idle');
    expect(callCount).toBe(3);
    
    const log = runtime.getConversationLog();
    const lastTurn = log[log.length - 1];
    
    expect(lastTurn.endedReason).toBe('completed');
    expect(lastTurn.assistantResponse).toContain('Status: Completed');
    expect(lastTurn.actionsExecuted.length).toBe(2);
    expect(lastTurn.actionsExecuted[0].ok).toBe(false);
    expect(lastTurn.actionsExecuted[1].ok).toBe(true);
  });
});

// ── Greetings/thanks answered locally (smallTalk.ts) — kept in this file rather than a new one so no
//    extra worker loads the ConversationRuntime module graph in parallel (that slowed a cold import in
//    ConversationRuntime.voiceOutput.test.ts past its timeout). ─────────────────────────────────────

async function setupSmallTalkRuntime(opts: { reply?: string; autonomousRunId?: string } = {}) {
  const requests: ReasoningProviderRequest[] = [];
  const provider: ReasoningProvider = {
    id: 'mock',
    label: 'Mock',
    isSupported: () => true,
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
      requests.push(request);
      const reply = opts.reply ?? 'Here is the answer.';
      setTimeout(() => {
        callbacks.onDelta(reply);
        callbacks.onComplete(reply);
      }, 0);
      return { cancel: () => {} } as never;
    },
  };
  const { ConversationRuntime } = await import('./ConversationRuntime');
  const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');
  const onTurnUsage = vi.fn();
  const persistTurn = vi.fn(async () => ({ id: 'session-1' }));
  const resolveSession = vi.fn(async () => ({ type: 'auto' as const }));
  const runtime = new ConversationRuntime({
    speechRecognition: stt as never,
    speechSynthesis: tts as never,
    reasoningRuntime: new ReasoningRuntime(provider, 'FULL SYSTEM PROMPT'),
    executeAction: async () => ({ ok: true, data: {} }),
    getExecutionMode: () => 'bypass',
    isBypassPermissionsEnabled: () => true,
    onTurnUsage,
    persistTurn: persistTurn as never,
    resolveSession: resolveSession as never,
    ...(opts.autonomousRunId ? { autonomousRunId: opts.autonomousRunId } : {}),
  });
  const send = async (text: string, context?: Record<string, unknown>) => {
    runtime.submitTranscript(text, context as never);
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 5));
      if (runtime.getSnapshot().state === 'idle') break;
    }
  };
  return { runtime, requests, onTurnUsage, persistTurn, resolveSession, send };
}

const lastAssistantReply = (runtime: { getSnapshot(): { messages: { role: string; content: string }[] } }) =>
  [...runtime.getSnapshot().messages].reverse().find((m) => m.role === 'assistant')?.content;

describe('Greetings and thanks are answered locally — zero Gemini calls', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  it('each greeting/thanks → no provider request, a local reply, zero usage, no session-classifier call', async () => {
    for (const text of ['hii', 'hi', 'hello', 'hey', 'thanks', 'thank you', 'good morning', 'good evening', "what's up"]) {
      const { runtime, requests, onTurnUsage, persistTurn, resolveSession, send } = await setupSmallTalkRuntime();
      await send(text);
      expect(requests, text).toHaveLength(0);
      expect(lastAssistantReply(runtime), text).toBeTruthy();
      expect(onTurnUsage, text).toHaveBeenCalledWith(expect.objectContaining({ requests: [] }));
      await new Promise((r) => setTimeout(r, 10));
      expect(resolveSession, text).not.toHaveBeenCalled();
      expect(persistTurn, text).toHaveBeenCalledWith(expect.objectContaining({ transcript: text, answeredLocally: true }), { type: 'auto' });
    }
  });

  it('the local reply fits the greeting', async () => {
    const { runtime, send } = await setupSmallTalkRuntime();
    await send('good morning');
    expect(lastAssistantReply(runtime)).toMatch(/^Good morning!/);
    await send('thanks');
    expect(lastAssistantReply(runtime)).toMatch(/^You're welcome!/);
  });
});

describe('Everything else still reaches the model exactly as before', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  it('coding requests, live-data questions and follow-ups → one provider request with the full prompt and every tool', async () => {
    for (const text of ['fix src/auth/login.ts', 'What is the weather today?', 'okay, proceed', 'yes, do that', 'go ahead', 'continue', 'ok']) {
      const { requests, send } = await setupSmallTalkRuntime();
      await send(text);
      expect(requests, text).toHaveLength(1);
      expect(requests[0]!.systemPrompt, text).toBe('FULL SYSTEM PROMPT');
      expect(requests[0]!.tools.length, text).toBeGreaterThan(100);
    }
  });

  it('a greeting after Paw asked a question goes to the model (it may be part of an answer)', async () => {
    const { requests, send } = await setupSmallTalkRuntime({ reply: 'Should I create the folder?' });
    await send('create a notes folder');
    await send('thanks');
    expect(requests).toHaveLength(2);
  });

  it('autonomous runs never use the local path', async () => {
    const { requests, send } = await setupSmallTalkRuntime({ autonomousRunId: 'run-1' });
    await send('hii');
    expect(requests).toHaveLength(1);
  });

  it('a pasted "hi" is content, not a greeting', async () => {
    const { requests, send } = await setupSmallTalkRuntime();
    await send('hi', { source: 'pasted' });
    expect(requests).toHaveLength(1);
  });
});

describe('Simple factual questions take the minimal path (simpleQuestion.ts)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  it('a standalone question → one-line prompt, zero tools, no history, the user text unchanged', async () => {
    const { requests, send } = await setupSmallTalkRuntime();
    for (const text of ['what is 2+2?', 'What is HTTP?', 'Explain recursion.', 'Convert 10 km to miles.', 'What is an API?']) {
      await send(text);
      const req = requests[requests.length - 1]!;
      expect(req.tools, text).toEqual([]);
      expect(req.systemPrompt, text).toBe("You are PawOS. Answer the user's question accurately and concisely.");
      expect(req.history, text).toEqual([]);
      expect(req.input, text).toBe(text);
      expect(req.contextPath, text).toBe('minimal-question');
    }
  });

  it('a follow-up to a plain Q&A keeps just that exchange as context, still zero tools', async () => {
    const { requests, send } = await setupSmallTalkRuntime({ reply: 'HTTP is the web’s request/response protocol.' });
    await send('What is HTTP?');
    await send('Why is HTTP different from HTTPS?');
    const followUp = requests[1]!;
    expect(followUp.contextPath).toBe('minimal-follow-up');
    expect(followUp.tools).toEqual([]);
    expect(followUp.history.map((m) => [m.role, m.content])).toEqual([
      ['user', 'What is HTTP?'],
      ['assistant', 'HTTP is the web’s request/response protocol.'],
    ]);
  });

  it('after a full (tool-capable) turn, a reference back goes to the full path', async () => {
    const { requests, send } = await setupSmallTalkRuntime();
    await send('fix src/auth/login.ts');
    await send('Why is that different from HTTPS?');
    expect(requests[1]!.contextPath).toBe('full');
    expect(requests[1]!.tools.length).toBeGreaterThan(100);
  });

  it('an uploaded file question never takes the minimal path (selection off without prompt parts)', async () => {
    const { requests, send } = await setupSmallTalkRuntime();
    await send('What is HTTP?', { source: 'file', reasoningText: 'file contents' });
    expect(requests[0]!.contextPath).toBe('full');
  });
});

describe('Usage metering continuity — ONE logical user turn = ONE usage collection', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  /** `completeAfterMs`: finish the tool-call stream only after the action has already run — the real
   *  timing that sent the final reply into a second collection ("I heard: yes"). */
  type Step =
    | { tool: string; args: Record<string, unknown>; completeAfterMs?: number }
    /** Several tool calls in ONE model response (e.g. two edits) — the case that produced "I heard: yes". */
    | { tools: { tool: string; args: Record<string, unknown> }[] }
    | { text: string };

  /** Scripted provider: every call reports its own usageMetadata (unique requestId), like Gemini. */
  async function setupMeteringRuntime(steps: Step[], opts: { mode: 'manual' | 'acceptEdits' | 'bypass'; projectFolder?: string }) {
    let callNo = 0;
    const provider: ReasoningProvider = {
      id: 'mock',
      label: 'Mock',
      isSupported: () => true,
      streamResponse(_request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
        const step = steps[callNo] ?? { text: 'Done.' };
        callNo += 1;
        const n = callNo;
        setTimeout(() => {
          callbacks.onUsage?.({ provider: 'gemini', model: 'mock', inputTokens: 100 * n, outputTokens: 10 * n, cachedInputTokens: 0, totalTokens: 110 * n, thoughtsTokens: 0, requestId: `req-${n}` });
          if ('tools' in step) {
            step.tools.forEach((t, i) => callbacks.onToolCall?.({ id: `call_${n}_${i}`, name: t.tool, arguments: t.args }));
            callbacks.onComplete('');
          } else if ('tool' in step) {
            callbacks.onToolCall?.({ id: `call_${n}`, name: step.tool, arguments: step.args });
            if (step.completeAfterMs) setTimeout(() => callbacks.onComplete(''), step.completeAfterMs);
            else callbacks.onComplete('');
          } else {
            callbacks.onDelta(step.text);
            callbacks.onComplete(step.text);
          }
        }, 0);
        return { cancel: () => {} } as never;
      },
    };
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');
    const submissions: { requests: { usage: { requestId: string | null } }[] }[] = [];
    const runtime = new ConversationRuntime({
      speechRecognition: stt as never,
      speechSynthesis: tts as never,
      reasoningRuntime: new ReasoningRuntime(provider, 'FULL SYSTEM PROMPT'),
      executeAction: async () => ({ ok: true, data: { done: true } }),
      getExecutionMode: () => opts.mode,
      isBypassPermissionsEnabled: () => opts.mode === 'bypass',
      onTurnUsage: (submission: never) => submissions.push(submission),
    });
    if (opts.projectFolder) runtime.setProjectFolder(opts.projectFolder);
    // Settled = idle, with no new provider call for a few ticks (a continuation may still be queued).
    const settle = async () => {
      let lastCalls = -1;
      let quietTicks = 0;
      for (let i = 0; i < 400 && quietTicks < 6; i++) {
        await new Promise((r) => setTimeout(r, 5));
        const idle = runtime.getSnapshot().state === 'idle';
        quietTicks = idle && callNo === lastCalls ? quietTicks + 1 : 0;
        lastCalls = callNo;
      }
    };
    const send = async (text: string, context?: Record<string, unknown>) => {
      runtime.submitTranscript(text, context as never);
      await settle();
    };
    const ids = () => submissions.map((s) => s.requests.map((r) => r.usage.requestId));
    const assistantReplies = () => runtime.getSnapshot().messages.filter((m) => m.role === 'assistant').map((m) => m.content);
    return { runtime, send, submissions, ids, assistantReplies, calls: () => callNo };
  }

  const noIHeard = (replies: string[]) => expect(replies.some((r) => /^I heard:/.test(r))).toBe(false);

  it('TEST A — a normal single-call turn reports its usage once', async () => {
    const m = await setupMeteringRuntime([{ text: 'Here you go.' }], { mode: 'manual' });
    await m.send('write me a haiku about the sea');
    expect(m.ids()).toEqual([['req-1']]);
  });

  it('TEST B — every call of a multi-call tool turn lands in the same collection', async () => {
    const m = await setupMeteringRuntime(
      [{ tool: 'read_file', args: { path: 'C:/proj/src/a.ts' } }, { tool: 'read_file', args: { path: 'C:/proj/src/b.ts' } }, { text: 'Both files look fine.' }],
      { mode: 'manual', projectFolder: 'C:/proj' }
    );
    await m.send('look at src/a.ts and src/b.ts');
    expect(m.ids()).toEqual([['req-1', 'req-2', 'req-3']]);
    expect(m.assistantReplies().at(-1)).toBe('Both files look fine.');
  });

  it('TEST C — Accept Edits: calls before the auto-confirmed edit stay in the same turn collection', async () => {
    const m = await setupMeteringRuntime(
      [{ tool: 'write_file', args: { path: 'C:/proj/notes.txt', content: 'hi' } }, { text: 'Saved notes.txt.' }],
      { mode: 'acceptEdits', projectFolder: 'C:/proj' }
    );
    await m.send('save hi to notes.txt');
    expect(m.ids()).toEqual([['req-1', 'req-2']]);
  });

  it('TEST D — Bypass: same invariant for an auto-confirmed command', async () => {
    const m = await setupMeteringRuntime(
      [{ tool: 'run_command', args: { command: 'npm test', cwd: 'C:/proj' } }, { tool: 'run_command', args: { command: 'npm run build', cwd: 'C:/proj' } }, { text: 'Tests and build passed.' }],
      { mode: 'bypass', projectFolder: 'C:/proj' }
    );
    await m.send('run the tests then build');
    expect(m.ids()).toEqual([['req-1', 'req-2', 'req-3']]);
  });

  it('TEST E — hands-on strategy (per-turn Accept Edits): same invariant', async () => {
    const m = await setupMeteringRuntime(
      [{ tool: 'write_file', args: { path: 'C:/proj/fix.ts', content: 'x' } }, { text: 'Applied the fix.' }],
      { mode: 'manual', projectFolder: 'C:/proj' }
    );
    await m.send('apply the fix to fix.ts', { source: 'typed', temporaryExecutionMode: 'acceptEdits' });
    expect(m.ids()).toEqual([['req-1', 'req-2']]);
  });

  it('TEST F — the final reply is the model’s, never "I heard: yes", after an auto-confirmed action', async () => {
    const m = await setupMeteringRuntime(
      // Two edits in one model response, both auto-confirmed (the real "I heard: yes" case).
      [
        { tools: [{ tool: 'write_file', args: { path: 'C:/proj/notes.txt', content: 'hi' } }, { tool: 'write_file', args: { path: 'C:/proj/todo.txt', content: 'x' } }] },
        { text: 'Saved notes.txt for you.' },
      ],
      { mode: 'acceptEdits', projectFolder: 'C:/proj' }
    );
    await m.send('save hi to notes.txt and x to todo.txt');
    expect(m.assistantReplies().at(-1)).toBe('Saved notes.txt for you.');
    noIHeard(m.assistantReplies());
    const log = m.runtime.getConversationLog();
    expect(log.at(-1)?.assistantResponse).toBe('Saved notes.txt for you.');
    expect(m.ids()).toEqual([['req-1', 'req-2']]);
  });

  it('TEST G — no request is ever reported twice (across auto-confirms, retries of the flow and turns)', async () => {
    const m = await setupMeteringRuntime(
      [
        { tool: 'write_file', args: { path: 'C:/proj/a.txt', content: '1' } },
        { tool: 'run_command', args: { command: 'npm test', cwd: 'C:/proj' } },
        { text: 'All done.' },
        { text: 'Second turn.' },
      ],
      { mode: 'bypass', projectFolder: 'C:/proj' }
    );
    await m.send('write a.txt and run the tests');
    await m.send('write me a haiku about the sea');
    const all = m.ids().flat();
    expect(all).toEqual(['req-1', 'req-2', 'req-3', 'req-4']);
    expect(new Set(all).size).toBe(all.length);
    expect(m.submissions).toHaveLength(2); // one per logical user turn
  });

  it('a human "allow" reply is its own user turn with its own collection (unchanged)', async () => {
    const m = await setupMeteringRuntime(
      [{ tool: 'write_file', args: { path: 'C:/proj/notes.txt', content: 'hi' } }, { text: 'Saved.' }],
      { mode: 'manual', projectFolder: 'C:/proj' }
    );
    await m.send('save hi to notes.txt'); // ends on the permission question
    await m.send('allow');
    expect(m.ids()).toEqual([['req-1'], ['req-2']]);
    noIHeard(m.assistantReplies());
  });
});

describe('Per-request capability selection (contextPlanner.ts)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  /** A provider that plays back scripted steps: each call either emits one tool call or replies with text. */
  async function setupSelectionRuntime(steps: ({ tool: string; args: Record<string, unknown> } | { text: string })[]) {
    const requests: ReasoningProviderRequest[] = [];
    const provider: ReasoningProvider = {
      id: 'mock',
      label: 'Mock',
      isSupported: () => true,
      streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
        const step = steps[requests.length] ?? { text: 'Done.' };
        requests.push(request);
        setTimeout(() => {
          if ('tool' in step) {
            callbacks.onToolCall?.({ id: `call_${requests.length}`, name: step.tool, arguments: step.args });
            callbacks.onComplete('');
          } else {
            callbacks.onDelta(step.text);
            callbacks.onComplete(step.text);
          }
        }, 0);
        return { cancel: () => {} } as never;
      },
    };
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');
    const runtime = new ConversationRuntime({
      speechRecognition: stt as never,
      speechSynthesis: tts as never,
      reasoningRuntime: new ReasoningRuntime(provider, 'FULL SYSTEM PROMPT'),
      executeAction: async () => ({ ok: true, data: { content: 'export function login() {}' } }),
      getExecutionMode: () => 'bypass',
      isBypassPermissionsEnabled: () => true,
    });
    runtime.setReasoningPromptParts({ canExecute: true, canMakeResumes: false, personalityAddendum: '', languageInstruction: '', planModeInstruction: '' });
    const send = async (text: string) => {
      runtime.submitTranscript(text);
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 5));
        if (i > 1 && runtime.getSnapshot().state === 'idle') break;
      }
    };
    return { runtime, requests, send };
  }

  const names = (req: ReasoningProviderRequest) => req.tools.map((t) => t.name);

  it('"fix src/auth/login.ts" carries only files/coding/terminal tools + request_capabilities, and the coding prompt sections', async () => {
    const { requests, send } = await setupSelectionRuntime([{ text: 'I will look at it.' }]);
    await send('fix src/auth/login.ts');
    const req = requests[0]!;
    expect(req.contextPath).toBe('selected');
    expect(req.input).toBe('fix src/auth/login.ts'); // the user's words, unchanged
    expect(names(req)).toEqual(expect.arrayContaining(['read_file', 'apply_code_edit', 'run_command', 'request_capabilities']));
    expect(names(req)).not.toContain('browse_web');
    expect(names(req)).not.toContain('start_communication_capture');
    expect(names(req)).not.toContain('deploy_project');
    expect(req.tools.length).toBeLessThan(80);
    expect(req.systemPrompt).toContain('Coding Intelligence:');
    expect(req.systemPrompt).not.toContain('Communication Intelligence');
  });

  it('a tool continuation keeps the same selected tools (so the tool result is interpreted with them)', async () => {
    const { requests, send } = await setupSelectionRuntime([
      { tool: 'read_file', args: { path: 'src/auth/login.ts' } },
      { text: 'Found the bug.' },
    ]);
    await send('fix src/auth/login.ts');
    for (let i = 0; i < 100 && requests.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(requests).toHaveLength(2);
    expect(requests[1]!.contextPath).toBe('selected');
    expect(names(requests[1]!)).toEqual(names(requests[0]!));
  });

  it('request_capabilities widens the same turn: the next request includes the requested group’s tools', async () => {
    const { requests, send } = await setupSelectionRuntime([
      { tool: 'request_capabilities', args: { groups: ['browser'] } },
      { text: 'Now I can browse.' },
    ]);
    await send('fix src/auth/login.ts');
    for (let i = 0; i < 100 && requests.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(requests).toHaveLength(2);
    expect(names(requests[0]!)).not.toContain('browse_web');
    expect(names(requests[1]!)).toContain('browse_web');
    expect(names(requests[1]!)).toContain('read_file');
  });

  it('greetings, simple questions and unplaceable requests are unaffected', async () => {
    const { requests, send } = await setupSelectionRuntime([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    await send('hii');
    expect(requests).toHaveLength(0);
    await send('What is HTTP?');
    expect(requests[0]!.contextPath).toBe('minimal-question');
    await send('check my calendar');
    expect(requests[1]!.contextPath).toBe('full');
    expect(requests[1]!.tools.length).toBeGreaterThan(100);
  });
});
