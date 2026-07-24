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
    'You are Paw, the AI-first support assistant inside PawOS. Answer the user\'s question using ONLY the ' +
    'documentation excerpts provided below as grounding context — do not invent features that aren\'t ' +
    'described there. If the documentation answers the question, say so plainly and concisely. If it does ' +
    'not, say you don\'t have a documented answer rather than guessing. You do not have access to the ' +
    'user\'s live logs, system state, or configuration in this conversation — do not claim to have checked ' +
    'them.\n\nDocumentation context:\n' + articleContext
  );
}

export function WidgetMessagesTab() {
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [starting, setStarting] = useState(false);
  const [problemInput, setProblemInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [negativeFeedbackOpen, setNegativeFeedbackOpen] = useState(false);
  const [negativeFeedbackText, setNegativeFeedbackText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ipc.helpListConversations().then((list) => {
      const first = list[0];
      if (first) setConversation(first);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.turns.length]);

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
      setSending(false);
      return;
    }

    let full = '';
    provider.streamResponse(
      { systemPrompt: buildSystemPrompt(context || 'No matching documentation was found for this question.'), history: [], input: userText, tools: [] },
      {
        onDelta: (delta) => {
          full += delta;
        },
        onComplete: async (response) => {
          const finalText = response || full;
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
          setSending(false);
        },
        onError: async () => {
          const diagnosis = 'Something went wrong reaching the AI provider. Please try again in a moment.';
          const updated = await ipc.helpAddTurn(conv.id, { role: 'assistant', content: diagnosis, timestamp: Date.now() });
          if (updated) setConversation(updated);
          await ipc.helpUpdateConversation(conv.id, { status: 'closed', diagnosis, currentState: 'AI provider request failed.' });
          setSending(false);
        },
      }
    );
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
    if (starting) {
      return (
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 10px', color: '#f5f5f7' }}>What's going on?</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={inputStyle} placeholder="Describe the issue…" value={problemInput} onChange={(e) => setProblemInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startConversation()} />
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
        <button type="button" className={styles.messageCta} style={{ marginTop: 14, maxWidth: 220 }} onClick={() => setStarting(true)}>
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
