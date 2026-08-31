import React, { useState } from 'react';
import styles from './agentsCard.module.css';
import type { CardConfig } from '../Card';

interface Agent {
  id: string;
  name: string;
  status: 'running' | 'idle' | 'completed' | 'error';
  progress?: number;
  lastUpdate?: string;
  message?: string;
}

interface AgentsCardProps {
  card: CardConfig;
  onRemoveCard: (cardId: string) => void;
}

export function AgentsCard({ card, onRemoveCard }: AgentsCardProps) {
  const [agents] = useState<Agent[]>([
    {
      id: '1',
      name: 'Code Analysis Agent',
      status: 'running',
      progress: 65,
      lastUpdate: '2 seconds ago',
      message: 'Analyzing TypeScript files...',
    },
    {
      id: '2',
      name: 'Test Runner',
      status: 'idle',
      lastUpdate: '5 minutes ago',
      message: 'Waiting for trigger',
    },
    {
      id: '3',
      name: 'Build Agent',
      status: 'completed',
      lastUpdate: '10 minutes ago',
      message: 'Build completed successfully',
    },
  ]);

  return (
    <div className={styles.agentsCard}>
      {agents.length === 0 ? (
        <div className={styles.empty}>No agents running</div>
      ) : (
        <div className={styles.agentsList}>
          {agents.map((agent) => (
            <div key={agent.id} className={`${styles.agentItem} ${styles[agent.status]}`}>
              <div className={styles.agentHeader}>
                <span className={`${styles.statusDot} ${styles[agent.status]}`} />
                <span className={styles.agentName}>{agent.name}</span>
                <span className={styles.statusLabel}>{agent.status}</span>
              </div>

              {agent.progress !== undefined && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${agent.progress}%` }} />
                  </div>
                  <span className={styles.progressText}>{agent.progress}%</span>
                </div>
              )}

              {agent.message && <div className={styles.agentMessage}>{agent.message}</div>}

              {agent.lastUpdate && <div className={styles.timestamp}>{agent.lastUpdate}</div>}

              <div className={styles.agentActions}>
                {agent.status === 'running' && (
                  <button className={styles.actionButton}>Pause</button>
                )}
                {agent.status === 'idle' && (
                  <button className={styles.actionButton}>Start</button>
                )}
                {agent.status === 'error' && (
                  <button className={styles.actionButton}>Retry</button>
                )}
                <button className={styles.actionButton}>View Logs</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
