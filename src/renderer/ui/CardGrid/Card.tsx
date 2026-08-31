import React, { useState } from 'react';
import styles from './card.module.css';

export interface CardConfig {
  id: string;
  type: 'terminal' | 'worktree' | 'browser' | 'agents' | 'migrations' | 'tasks' | 'background-tasks';
  title: string;
}

interface CardProps {
  card: CardConfig;
  onClose: (cardId: string) => void;
  onExpand: (cardId: string) => void;
  children: React.ReactNode;
}

export function Card({ card, onClose, onExpand, children }: CardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`${styles.card} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <span className={styles.title}>{card.title}</span>
          <button
            className={styles.addButton}
            title="Add card"
            onClick={() => {
              // Add card logic - will be implemented in parent
            }}
          >
            +
          </button>
        </div>
        <div className={styles.buttonGroup}>
          <button
            className={styles.collapseButton}
            title={isCollapsed ? 'Expand' : 'Collapse'}
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? '⊡' : '⌄'}
          </button>
          <button
            className={styles.expandButton}
            title="Expand to full panel"
            onClick={() => onExpand(card.id)}
          >
            ⊡
          </button>
          <button
            className={styles.closeButton}
            title="Close card"
            onClick={() => onClose(card.id)}
          >
            ✕
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
}
