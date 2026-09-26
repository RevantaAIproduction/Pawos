import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import styles from './terminalView.module.css';
import { ensureTerminal, getTerminalSnapshot, sendTerminalLine, subscribeTerminal, clearTerminal, interruptTerminal } from './userTerminalSession';

interface TerminalViewProps {
  /** Where a new shell starts — the open project folder, or home. */
  cwd?: string | null;
}

/**
 * The Terminal panel: a real PowerShell rendered like a terminal — black background, monospace,
 * PowerShell's own "PS C:\…>" prompt with the cursor right after it. The user types every command
 * themselves; Enter runs it, ↑/↓ walk history, Ctrl+L clears.
 */
export function TerminalView({ cwd }: TerminalViewProps) {
  const snapshot = useSyncExternalStore(subscribeTerminal, getTerminalSnapshot);
  const [line, setLine] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void ensureTerminal(cwd);
    inputRef.current?.focus();
    // Only on mount: an open shell keeps its own folder (cd) — "+" starts a fresh one here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [snapshot.chunks]);

  // Everything before the last line prints as-is; the last line (PowerShell's prompt) shares a row
  // with the input so the cursor sits right after "PS C:\…>".
  const fullText = snapshot.chunks.map((c) => c.text).join('');
  const lastBreak = fullText.lastIndexOf('\n');
  const promptTail = fullText.slice(lastBreak + 1);
  let consumed = 0;
  const headChunks = snapshot.chunks
    .map((chunk) => {
      const start = consumed;
      consumed += chunk.text.length;
      const end = Math.min(consumed, lastBreak + 1);
      return end > start ? { ...chunk, text: chunk.text.slice(0, end - start) } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const running = snapshot.status === 'running';

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!running) return;
      const typed = line;
      setLine('');
      setHistoryIndex(null);
      if (typed.trim()) setHistory((h) => [...h.filter((x) => x !== typed), typed].slice(-100));
      void sendTerminalLine(typed);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (history.length === 0) return;
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setLine(history[next] ?? '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex === null) return;
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(null);
        setLine('');
      } else {
        setHistoryIndex(next);
        setLine(history[next] ?? '');
      }
    } else if (event.key.toLowerCase() === 'l' && event.ctrlKey) {
      event.preventDefault();
      clearTerminal();
    } else if (
      event.key.toLowerCase() === 'c' &&
      event.ctrlKey &&
      !window.getSelection()?.toString() &&
      event.currentTarget.selectionStart === event.currentTarget.selectionEnd
    ) {
      // Ctrl+C with nothing selected stops the running command (Ctrl+C on a selection still copies).
      event.preventDefault();
      setLine('');
      void interruptTerminal(cwd);
    }
  };

  return (
    <div
      className={styles.terminal}
      ref={bodyRef}
      onMouseUp={() => {
        // Click anywhere to type — unless the user is selecting text to copy.
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
      role="log"
      aria-label="Terminal"
    >
      <pre className={styles.output}>
        {headChunks.map((chunk, i) => (
          <span key={i} className={chunk.stream === 'stderr' ? styles.stderr : chunk.stream === 'system' ? styles.system : undefined}>
            {chunk.text}
          </span>
        ))}
      </pre>
      <div className={styles.promptRow}>
        <span className={styles.prompt}>{promptTail}</span>
        <input
          ref={inputRef}
          className={styles.input}
          value={line}
          onChange={(e) => setLine(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label="Terminal input"
          disabled={!running}
          placeholder={snapshot.status === 'starting' ? 'Starting PowerShell…' : ''}
        />
      </div>
    </div>
  );
}
