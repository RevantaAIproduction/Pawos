import React, { useState, useRef, useEffect } from 'react';
import styles from './terminalCard.module.css';
import type { CardConfig } from '../Card';

interface TerminalCardProps {
  card: CardConfig;
  onRemoveCard: (cardId: string) => void;
}

interface TerminalOutput {
  id: string;
  type: 'input' | 'output' | 'error' | 'info';
  text: string;
}

export function TerminalCard({ card, onRemoveCard }: TerminalCardProps) {
  const [outputs, setOutputs] = useState<TerminalOutput[]>([
    { id: '0', type: 'info', text: '$ ready for input...' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputs]);

  const handleExecute = () => {
    if (!input.trim()) return;

    const newId = Date.now().toString();
    setOutputs((prev) => [
      ...prev,
      { id: newId, type: 'input', text: `$ ${input}` },
      {
        id: newId + '-output',
        type: 'output',
        text: `[Command execution simulation: ${input}]`,
      },
    ]);

    setHistory((prev) => [input, ...prev]);
    setHistoryIndex(-1);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = historyIndex + 1;
      if (newIndex < history.length) {
        setHistoryIndex(newIndex);
        setInput(history[newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[newIndex] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  return (
    <div className={styles.terminalCard}>
      <div className={styles.outputArea}>
        {outputs.map((output) => (
          <div key={output.id} className={`${styles.line} ${styles[output.type]}`}>
            {output.text}
          </div>
        ))}
        <div ref={outputEndRef} />
      </div>

      <div className={styles.inputContainer}>
        <span className={styles.prompt}>$</span>
        <input
          type="text"
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command..."
          autoFocus
        />
        <button className={styles.executeButton} onClick={handleExecute} title="Execute (Enter)">
          ▶
        </button>
      </div>
    </div>
  );
}
