import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildWidgetDocument, parseWidgetMessage, type WidgetTheme } from './widgetDocument';

interface ChatWidgetProps {
  id: string;
  title: string;
  code: string;
  /** Shown one after another while the visual loads. */
  loadingMessages?: string[];
  /** sendPrompt() from the widget. */
  onPrompt?: (text: string) => void;
  /** A link the user clicked inside the widget (already limited to http/https). */
  onLink?: (url: string) => void;
}

/**
 * The chat panel is always dark (its styles don't follow the app's light setting), so widgets
 * always use the dark palette — following <html data-theme="light"> drew white pages in a dark chat.
 */
const CHAT_THEME: WidgetTheme = 'dark';

const DEFAULT_LOADING = ['Drawing the visual'];

/**
 * A visual PawOS drew (show_widget), shown inline in the chat. Runs in a sandboxed frame with an
 * opaque origin (no allow-same-origin), so it can't reach PawOS, the preload bridge or the user's
 * data — see widgetDocument.ts for the CSP.
 */
export function ChatWidget({ id, title, code, loadingMessages, onPrompt, onLink }: ChatWidgetProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const lines = loadingMessages && loadingMessages.length > 0 ? loadingMessages : DEFAULT_LOADING;
  const srcDoc = useMemo(() => buildWidgetDocument(code, id, CHAT_THEME), [code, id]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = parseWidgetMessage(event.data, id);
      if (!message) return;
      if (message.type === 'height') setHeight(message.height);
      else if (message.type === 'ready') setReady(true);
      else if (message.type === 'prompt') onPrompt?.(message.text);
      else onLink?.(message.url);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [id, onPrompt, onLink]);

  // Cycle the loading lines until the widget says it's ready (with a safety stop at 8s).
  useEffect(() => {
    if (ready) return;
    const cycle = setInterval(() => setLoadingIndex((i) => (i + 1) % lines.length), 1400);
    const giveUp = setTimeout(() => setReady(true), 8000);
    return () => {
      clearInterval(cycle);
      clearTimeout(giveUp);
    };
  }, [ready, lines.length]);

  return (
    // Dark bordered panel, like Claude's widgets — the visual always sits on the chat's own dark.
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.025)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        borderRadius: 12,
        padding: 16,
        colorScheme: 'dark',
      }}
    >
      {!ready && (
        <div role="status" style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.6)', padding: '4px 0' }}>
          {lines[loadingIndex % lines.length]}…
        </div>
      )}
      <iframe
        ref={frameRef}
        title={title.replace(/_/g, ' ')}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: ready ? height : Math.max(height, 1),
          border: 'none',
          display: 'block',
          background: 'transparent',
          colorScheme: CHAT_THEME,
          visibility: ready ? 'visible' : 'hidden',
        }}
      />
    </div>
  );
}
