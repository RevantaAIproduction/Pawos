// @ts-nocheck
import React, { useState } from 'react';
import styles from './acceptEditsControl.module.css';
import type { ExecutionStrategy } from './ExecutionStrategyStore';
import { executionStrategyStore } from './ExecutionStrategyStore';

interface AcceptEditsControlProps {
  currentStrategy: ExecutionStrategy;
  onStrategyChange?: (strategy: ExecutionStrategy) => void;
}

const STRATEGY_OPTIONS: Array<{ key: ExecutionStrategy; label: string; description: string }> = [
  { key: 'manual', label: 'Manual', description: 'Always ask before making changes' },
  { key: 'auto_accept', label: 'Accept edits', description: 'Automatically accept all file edits' },
  { key: 'plan_first', label: 'Plan', description: 'Create a plan before making changes' },
];

export function AcceptEditsControl({ currentStrategy, onStrategyChange }: AcceptEditsControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const currentLabel = STRATEGY_OPTIONS.find((opt) => opt.key === currentStrategy)?.label || 'Manual';

  const handleSelectStrategy = (strategy: ExecutionStrategy) => {
    executionStrategyStore.set(strategy);
    onStrategyChange?.(strategy);
    setMenuOpen(false);
  };

  return (
    <div className={styles.container} data-interactive="true">
      <button
        className={styles.button}
        onClick={() => setMenuOpen(!menuOpen)}
        title="Execution strategy"
      >
        <span className={styles.label}>{currentLabel}</span>
      </button>
      {menuOpen && (
        <div className={styles.menu}>
          {STRATEGY_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={`${styles.menuItem} ${currentStrategy === option.key ? styles.active : ''}`}
              onClick={() => handleSelectStrategy(option.key)}
            >
              <div className={styles.itemLabel}>{option.label}</div>
              <div className={styles.itemDescription}>{option.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
