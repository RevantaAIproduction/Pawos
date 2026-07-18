import React, { useEffect, useState } from 'react';
import { voiceDebugBus, type VoiceDebugEvent } from '../conversation/VoiceDebugBus';
import type { ConversationSnapshot } from '../conversation/ConversationTypes';

/**
 * TEMPORARY — for verifying the real-microphone voice pipeline end to end.
 * Remove this file, its import/usage in CompanionExperience.tsx, and
 * VoiceDebugBus.ts (plus the emit() calls in GeminiSttProvider.ts and
 * ConversationRuntime.ts) once that verification is done.
 */

type TimelineStatus = 'ok' | 'error' | 'info';

type TimelineEntry = {
  timestamp: number;
  label: string;
  status: TimelineStatus;
  detail?: string;
  durationMs: number | null;
};

const MAX_TIMELINE_ENTRIES = 200;

/** Maps a bus event to zero, one, or two timeline rows — 'level' is excluded (too frequent to be a meaningful stage). */
function toTimelineRows(event: VoiceDebugEvent): { label: string; status: TimelineStatus; detail?: string }[] {
  switch (event.type) {
    case 'mic':
      return [{ label: 'Microphone opened', status: 'ok', detail: event.deviceLabel }];
    case 'stage':
      return [{ label: event.label, status: event.status, detail: event.detail }];
    case 'recorded':
      return [{ label: 'Recording captured', status: 'ok', detail: `${event.sizeBytes.toLocaleString()} bytes, ${event.durationMs} ms, ${event.mimeType}` }];
    case 'request':
      return [{ label: 'Uploading to Gemini', status: 'info', detail: `${event.mimeType} · ${event.audioBytes.toLocaleString()} b64 chars` }];
    case 'response':
      return [
        {
          label: event.status >= 200 && event.status < 300 ? 'Gemini transcription received' : 'Gemini request failed',
          status: event.status >= 200 && event.status < 300 ? 'ok' : 'error',
          detail: `HTTP ${event.status}`,
        },
      ];
    case 'transcript':
      return [{ label: 'Transcript', status: 'ok', detail: event.text }];
    case 'runtime':
      switch (event.event) {
        case 'generating-response':
          return [{ label: 'Generating response', status: 'info' }];
        case 'starting-tts':
          return [{ label: 'Starting TTS', status: 'info' }];
        case 'action-start':
          return [
            { label: 'Intent detected', status: 'info', detail: String(event.data?.type ?? event.data?.name ?? '—') },
            { label: 'Executing', status: 'info', detail: String(event.data?.name ?? '—') },
          ];
        case 'action-complete':
          return [{ label: 'Action completed', status: event.data?.ok ? 'ok' : 'error', detail: String(event.data?.name ?? '—') }];
        case 'action-error':
          return [{ label: 'Action failed', status: 'error', detail: String(event.data?.message ?? 'unknown error') }];
        case 'turn-ended':
          if (event.data?.reason === 'completed') return [{ label: 'Conversation completed', status: 'ok' }];
          if (event.data?.reason === 'error') return [{ label: 'Conversation failed', status: 'error', detail: String(event.data?.note ?? '') }];
          if (event.data?.reason === 'interrupted') return [{ label: 'Conversation interrupted', status: 'info', detail: String(event.data?.note ?? '') }];
          return [];
        default:
          return [];
      }
    default:
      return [];
  }
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function VoiceDebugPanel({ snapshot }: { snapshot: ConversationSnapshot }) {
  // Collapsed by default: this panel is fixed/full-height and was blocking
  // the conversation panel underneath it. Keep it out of the way until a
  // developer explicitly asks for it.
  const [expanded, setExpanded] = useState(false);
  const [micDevice, setMicDevice] = useState('—');
  const [levels, setLevels] = useState<number[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [requestInfo, setRequestInfo] = useState('—');
  const [responseInfo, setResponseInfo] = useState('—');
  const [transcript, setTranscript] = useState('—');
  const [detectedIntent, setDetectedIntent] = useState('—');
  const [executedAction, setExecutedAction] = useState('—');
  const [executionResult, setExecutionResult] = useState('—');
  const [rawLog, setRawLog] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    return voiceDebugBus.subscribe((event) => {
      switch (event.type) {
        case 'mic':
          setMicDevice(event.deviceLabel);
          break;
        case 'level':
          setLevels((prev) => [...prev.slice(-59), event.level]);
          break;
        case 'recorded':
          setDuration(event.durationMs);
          setSize(event.sizeBytes);
          break;
        case 'request':
          setRequestInfo(`${event.url.split('?')[0]} · ${event.mimeType} · ${event.audioBytes} b64 chars`);
          break;
        case 'response':
          setResponseInfo(`HTTP ${event.status} — ${event.bodyPreview}`);
          break;
        case 'transcript':
          setTranscript(event.text);
          break;
        case 'runtime':
          setRawLog((prev) => [...prev.slice(-29), `${event.event} ${event.data ? JSON.stringify(event.data) : ''}`]);
          if (event.event === 'action-start') {
            setDetectedIntent(String(event.data?.name ?? '—'));
            setExecutedAction('running…');
            setExecutionResult('—');
          }
          if (event.event === 'action-complete') {
            setExecutedAction(String(event.data?.name ?? '—'));
            setExecutionResult(event.data?.ok ? 'ok' : 'failed');
          }
          if (event.event === 'action-error') {
            setExecutedAction(String(event.data?.name ?? '—'));
            setExecutionResult(`error: ${event.data?.message ?? 'unknown'}`);
          }
          break;
      }

      // Raw Timeline: every event gets Timestamp/Duration/Status/Error.
      const rows = toTimelineRows(event);
      if (rows.length === 0) return;
      const timestamp = Date.now();
      setTimeline((prev) => {
        const prevTimestamp = prev.at(-1)?.timestamp ?? null;
        const next = [...prev];
        for (const row of rows) {
          next.push({
            timestamp,
            label: row.label,
            status: row.status,
            detail: row.detail,
            durationMs: prevTimestamp !== null ? timestamp - prevTimestamp : null,
          });
        }
        return next.slice(-MAX_TIMELINE_ENTRIES);
      });
    });
  }, []);

  if (!expanded) {
    return (
      <button type="button" style={collapsedTabStyle} onClick={() => setExpanded(true)}>
        🔧 Debug
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: '#ff8a5c' }}>🔧 Debug Voice (temporary)</div>
        <button type="button" style={collapseBtnStyle} onClick={() => setExpanded(false)}>
          Hide
        </button>
      </div>

      <Row label="Runtime State" value={snapshot.state} />
      <Row label="Microphone Device" value={micDevice} />

      <div style={{ margin: '8px 0' }}>
        <div style={{ fontSize: 11, color: '#96969e', marginBottom: 4 }}>Recording Level</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 32, background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '2px 4px' }}>
          {levels.length === 0 && <span style={{ fontSize: 11, color: '#6c6c74' }}>no data yet</span>}
          {levels.map((l, i) => (
            <div
              key={i}
              style={{
                width: 3,
                flexShrink: 0,
                height: Math.max(2, Math.min(28, l * 28 * 8)),
                background: l > 0.02 ? '#4dd0ff' : '#3a3a42',
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      </div>

      <Row label="Audio Duration" value={duration !== null ? `${duration} ms` : '—'} />
      <Row label="Recording Size" value={size !== null ? `${size.toLocaleString()} bytes` : '—'} />
      <Row label="Transcript" value={transcript} />
      <Row label="Request" value={requestInfo} />
      <Row label="Response" value={responseInfo} />
      <Row label="Detected Intent" value={detectedIntent} />
      <Row label="Executed Action" value={executedAction} />
      <Row label="Execution Result" value={executionResult} />

      <div style={{ fontSize: 11, color: '#96969e', marginTop: 10, marginBottom: 4 }}>Raw Timeline</div>
      <div
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          fontSize: 10.5,
          fontFamily: 'monospace',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 4,
          padding: 6,
        }}
      >
        {timeline.length === 0 && <div style={{ color: '#6c6c74' }}>no events yet</div>}
        {timeline.map((entry, i) => (
          <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8a8a92' }}>
              <span>{formatClock(entry.timestamp)}</span>
              <span>{entry.durationMs !== null ? `+${entry.durationMs}ms` : 'start'}</span>
            </div>
            <div style={{ color: statusColor(entry.status), fontWeight: 600 }}>
              {statusIcon(entry.status)} {entry.label}
            </div>
            {entry.detail && <div style={{ color: '#c8c8ce', wordBreak: 'break-word' }}>{entry.detail}</div>}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#96969e', marginTop: 10, marginBottom: 4 }}>Runtime Log</div>
      <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 10.5, fontFamily: 'monospace', color: '#c8c8ce', background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: 6 }}>
        {rawLog.length === 0 && <div style={{ color: '#6c6c74' }}>no events yet</div>}
        {rawLog.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function statusColor(status: TimelineStatus): string {
  if (status === 'error') return '#ff6b6b';
  if (status === 'ok') return '#4ade80';
  return '#4dd0ff';
}

function statusIcon(status: TimelineStatus): string {
  if (status === 'error') return '✗';
  if (status === 'ok') return '✓';
  return '·';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 5 }}>
      <span style={{ color: '#96969e', flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#f5f5f7', textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  right: 8,
  width: 320,
  maxHeight: '60vh',
  overflowY: 'auto',
  background: 'rgba(8,8,10,0.97)',
  border: '1px solid rgba(255, 138, 92, 0.4)',
  borderRadius: 12,
  padding: 12,
  color: '#f5f5f7',
  fontSize: 12,
  zIndex: 999999,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  pointerEvents: 'auto',
};

const collapsedTabStyle: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  right: 8,
  zIndex: 999999,
  background: 'rgba(8,8,10,0.85)',
  border: '1px solid rgba(255, 138, 92, 0.4)',
  borderRadius: 999,
  padding: '4px 10px',
  color: '#ff8a5c',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  pointerEvents: 'auto',
};

const collapseBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: 'none',
  borderRadius: 999,
  padding: '3px 9px',
  color: '#f5f5f7',
  fontSize: 11,
  cursor: 'pointer',
};
