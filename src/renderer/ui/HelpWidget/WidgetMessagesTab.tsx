import React, { useEffect, useRef, useState } from 'react';
import styles from './HelpWidget.module.css';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { aiRouter } from '../../ai/AIRouter';
import { searchHelpArticles } from '../../help/HelpSearch';
import { diagnosticsReportingService } from '../../diagnostics/DiagnosticsReportingService';
import type { SupportConversation, SupportConversationStatus } from '../../services/ipc/ipcTypes';

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#e8e8ec',
  padding: '9px 12px',
  fontSize: 13,
};

const smallButton: React.CSSProperties = {
  background: 'none',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '4px 9px',
  cursor: 'pointer',
  fontSize: 12,
  color: '#e8e8ec',
};

const STATUS_LABELS: Record<SupportConversationStatus, string> = {
  new: 'New',
  investigating: 'Investigating',
  aiFixing: 'AI Fixing',
  waitingPermission: 'Waiting for Permission',
  resolved: 'Resolved',
  closed: 'Closed',
};

function buildSystemPrompt(articleContext: string): string {
  return (
    'You are Paw, the AI-first support assistant inside PawOS. If the user is just greeting you or making ' +
    'small talk, respond warmly and briefly, then ask what they need help with — don\'t treat a greeting as ' +
    'a documentation question. When they do ask a real question, answer it using ONLY the documentation ' +
    'excerpts provided below as grounding context — do not invent features that aren\'t described there. If ' +
    'the documentation answers the question, say so plainly and concisely. If it does not, say you don\'t ' +
    'have a documented answer rather than guessing. You do not have access to the user\'s live logs, system ' +
    'state, or configuration in this conversation — do not claim to have checked them.\n\n' +
    'Documentation context:\n' + articleContext
  );
}

type QuickReplyCategory = {
  label: string;
  placeholder: string;
};

const QUICK_REPLY_CATEGORIES: QuickReplyCategory[] = [
  { label: 'Feature question / how-to', placeholder: 'What feature would you like help with?' },
  { label: 'Billing & subscription', placeholder: "What's your billing question?" },
  { label: 'Technical issue / error', placeholder: 'Describe the error or issue you’re seeing…' },
  { label: 'Usage & limits', placeholder: 'What would you like to know about usage or limits?' },
  { label: 'Something else', placeholder: 'Describe what you need help with…' },
];

/** Genuinely unfinished business is worth resuming; a resolved/closed ticket isn't — start fresh instead. */
const UNRESOLVED_STATUSES: SupportConversationStatus[] = ['new', 'investigating', 'aiFixing', 'waitingPermission'];

export function WidgetMessagesTab() {
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [stage, setStage] = useState<'empty' | 'consent' | 'categoryPick' | 'composing'>('empty');
  const [composerPlaceholder, setComposerPlaceholder] = useState('Describe what you need help with…');
  const [problemInput, setProblemInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [negativeFeedbackOpen, setNegativeFeedbackOpen] = useState(false);
  const [negativeFeedbackText, setNegativeFeedbackText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ipc.helpListConversations().then((list) => {
      const first = list[0];
      if (first && UNRESOLVED_STATUSES.includes(first.status)) setConversation(first);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.turns.length]);

  function pickCategory(category: QuickReplyCategory) {
    setComposerPlaceholder(category.placeholder);
    setStage('composing');
  }

  async function startConversation() {
    if (!problemInput.trim()) return;
    const text = problemInput.trim();
    const created = await ipc.helpCreateConversation(text);
    setConversation(created);
    setProblemInput('');
    await sendToAI(created, text);
  }

  async function sendToAI(conv: SupportConversation, userText: string) {
    setSending(true);
    try {
      const matches = searchHelpArticles(userText, 3);
      const context = matches.map((a) => `# ${a.title}\n${a.overview}\n${a.howItWorks}`).join('\n\n');

      const afterUserTurn = await ipc.helpAddTurn(conv.id, { role: 'user', content: userText, timestamp: Date.now() });
      if (afterUserTurn) setConversation(afterUserTurn);
      await ipc.helpUpdateConversation(conv.id, { status: 'investigating', currentState: 'Reviewing documentation for a match.' });

      const provider = aiRouter.getReasoningProvider();
      if (!provider.isSupported()) {
        const diagnosis = 'No AI provider is configured yet — please configure one in Settings.';
        const updated = await ipc.helpAddTurn(conv.id, { role: 'assistant', content: diagnosis, timestamp: Date.now() });
        if (updated) setConversation(updated);
        await ipc.helpUpdateConversation(conv.id, { status: 'closed', diagnosis, currentState: 'Waiting for an AI provider to be configured.' });
        return;
      }

      let full = '';
      await new Promise<void>((resolve) => {
        provider.streamResponse(
          { systemPrompt: buildSystemPrompt(context || 'No matching documentation was found for this question.'), history: [], input: userText, tools: [] },
          {
            onDelta: (delta) => {
              full += delta;
            },
            onComplete: async (response) => {
              try {
                const finalText = response || full || "I didn't catch that — could you say a bit more about what you need?";
                const resolved = matches.length > 0;
                const updated = await ipc.helpAddTurn(conv.id, { role: 'assistant', content: finalText, timestamp: Date.now(), matchedArticleIds: matches.map((m) => m.id) });
                if (updated) setConversation(updated);
                await ipc.helpUpdateConversation(conv.id, {
                  status: resolved ? 'resolved' : 'waitingPermission',
                  diagnosis: finalText,
                  currentState: resolved ? 'Answered from documentation.' : 'No documented answer found — consider Report Issue.',
                  needsPermission: !resolved,
                });
                const finalConv = await ipc.helpGetConversation(conv.id);
                if (finalConv) setConversation(finalConv);
              } finally {
                resolve();
              }
            },
            onError: async () => {
              try {
                const diagnosis = 'Something went wrong reaching the AI provider. Please try again in a moment.';
                const updated = await ipc.helpAddTurn(conv.id, { role: 'assistant', content: diagnosis, timestamp: Date.now() });
                if (updated) setConversation(updated);
                await ipc.helpUpdateConversation(conv.id, { status: 'closed', diagnosis, currentState: 'AI provider request failed.' });
              } finally {
                resolve();
              }
            },
          }
        );
      });
    } catch {
      // Anything unexpected (search, IPC, or provider throwing synchronously) still
      // gets a visible reply instead of leaving the UI stuck on "Paw is thinking…".
      const diagnosis = 'Something went wrong on this end. Please try asking again.';
      const updated = await ipc.helpAddTurn(conv.id, { role: 'assistant', content: diagnosis, timestamp: Date.now() });
      if (updated) setConversation(updated);
      await ipc.helpUpdateConversation(conv.id, { status: 'closed', diagnosis, currentState: 'Support widget hit an unexpected error.' });
    } finally {
      setSending(false);
    }
  }

  async function sendFollowUp() {
    if (!conversation || !messageInput.trim()) return;
    const text = messageInput.trim();
    setMessageInput('');
    await sendToAI(conversation, text);
  }

  async function rate(value: 'up' | 'down') {
    if (!conversation) return;
    if (value === 'down') {
      setNegativeFeedbackOpen(true);
      return;
    }
    const updated = await ipc.helpSetConversationRating(conversation.id, 'up');
    if (updated) setConversation(updated);
    const appVersion = await ipc.systemGetAppVersion();
    diagnosticsReportingService
      .submitReport({ type: 'supportRating', reportSource: 'desktop', component: 'backend', summary: `Support conversation rated helpful: ${conversation.problemSummary}`, appVersion, os: navigator.platform })
      .catch(() => {});
  }

  async function submitNegativeFeedback() {
    if (!conversation) return;
    const updated = await ipc.helpSetConversationRating(conversation.id, 'down', negativeFeedbackText.trim() || undefined);
    if (updated) setConversation(updated);
    const appVersion = await ipc.systemGetAppVersion();
    diagnosticsReportingService
      .submitReport({
        type: 'supportRating',
        reportSource: 'desktop',
        component: 'backend',
        summary: `Support conversation rated not helpful: ${conversation.problemSummary}`,
        details: { feedback: negativeFeedbackText.trim() },
        appVersion,
        os: navigator.platform,
      })
      .catch(() => {});
    setNegativeFeedbackOpen(false);
    setNegativeFeedbackText('');
  }

  async function reportIssue() {
    if (!conversation) return;
    const appVersion = await ipc.systemGetAppVersion();
    await diagnosticsReportingService.submitReport({
      type: 'bug',
      reportSource: 'desktop',
      component: 'backend',
      summary: conversation.problemSummary,
      details: { conversationId: conversation.id, diagnosis: conversation.diagnosis },
      appVersion,
      os: navigator.platform,
    });
  }

  if (!conversation) {
    if (stage === 'consent') {
      return (
        <div>
          <div className={styles.agentBubble}>
            Hi! I&apos;m Paw, PawOS&apos;s support assistant. To help with your question I&apos;ll search PawOS&apos;s own
            documentation and send your message to the AI provider you&apos;ve configured in Settings — nothing is sent
            to a third party beyond that provider. This conversation is saved locally so you can pick it back up later.
          </div>
          <button type="button" className={styles.messageCta} onClick={() => setStage('categoryPick')}>
            Accept
          </button>
        </div>
      );
    }
    if (stage === 'categoryPick') {
      return (
        <div>
          <div className={styles.agentBubble}>Hi! I&apos;m Paw. What&apos;s your inquiry about?</div>
          {QUICK_REPLY_CATEGORIES.map((category) => (
            <button key={category.label} type="button" className={styles.quickReplyChip} onClick={() => pickCategory(category)}>
              {category.label}
            </button>
          ))}
        </div>
      );
    }
    if (stage === 'composing') {
      return (
        <div>
          <div className={styles.agentBubble}>Hi! I&apos;m Paw. What&apos;s your inquiry about?</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 10px', color: '#f5f5f7' }}>What's going on?</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={inputStyle}
              placeholder={composerPlaceholder}
              value={problemInput}
              onChange={(e) => setProblemInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startConversation()}
              autoFocus
            />
            <button type="button" style={smallButton} disabled={!problemInput.trim()} onClick={startConversation}>
              Start
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.emptyState}>
        <div style={{ fontSize: 28 }}>💬</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f5f5f7' }}>No messages</div>
        <div style={{ fontSize: 12.5 }}>Messages from Paw will be shown here</div>
        <button type="button" className={styles.messageCta} style={{ marginTop: 14, maxWidth: 220 }} onClick={() => setStage('consent')}>
          Send us a message
          <span>→</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11.5 }}>
          <div>
            <div style={{ color: '#6f6f78' }}>Problem</div>
            <div style={{ color: '#f5f5f7', fontWeight: 600 }}>{conversation.problemSummary}</div>
          </div>
          <div>
            <div style={{ color: '#6f6f78' }}>Status</div>
            <div style={{ color: '#f5f5f7', fontWeight: 600 }}>{STATUS_LABELS[conversation.status]}</div>
          </div>
          <div>
            <div style={{ color: '#6f6f78' }}>Current State</div>
            <div style={{ color: '#f5f5f7' }}>{conversation.currentState}</div>
          </div>
          <div>
            <div style={{ color: '#6f6f78' }}>Need Permission?</div>
            <div style={{ color: '#f5f5f7' }}>{conversation.needsPermission ? 'Yes' : 'No'}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5 }}>
          <div style={{ color: '#6f6f78' }}>Actions Taken</div>
          <div style={{ color: '#96969e' }}>{conversation.actionsTaken.length > 0 ? conversation.actionsTaken.join(', ') : 'None yet'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
        {conversation.turns.map((t, i) => (
          <div key={i} style={{ alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{ background: t.role === 'user' ? 'rgba(139,123,255,0.16)' : 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '7px 11px', fontSize: 12.5, color: '#e8e8ec' }}>
              {t.content}
            </div>
          </div>
        ))}
        {sending && <div style={{ fontSize: 12, color: '#6f6f78' }}>Paw is thinking…</div>}
        <div ref={bottomRef} />
      </div>

      {conversation.turns.some((t) => t.role === 'assistant') && !negativeFeedbackOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: '#6f6f78' }}>Helpful?</span>
          <button type="button" onClick={() => rate('up')} style={{ ...smallButton, color: conversation.supportRating === 'up' ? '#4ade80' : '#e8e8ec' }}>👍</button>
          <button type="button" onClick={() => rate('down')} style={{ ...smallButton, color: conversation.supportRating === 'down' ? '#f87171' : '#e8e8ec' }}>👎</button>
          <button type="button" onClick={reportIssue} style={smallButton}>Report Issue</button>
        </div>
      )}

      {negativeFeedbackOpen && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={inputStyle} placeholder="Tell Paw what went wrong…" value={negativeFeedbackText} onChange={(e) => setNegativeFeedbackText(e.target.value)} />
          <button type="button" style={smallButton} onClick={submitNegativeFeedback}>Send</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <input style={inputStyle} placeholder="Ask a follow-up…" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendFollowUp()} disabled={sending} />
        <button type="button" style={smallButton} disabled={sending || !messageInput.trim()} onClick={sendFollowUp}>Send</button>
      </div>
    </div>
  );
}
