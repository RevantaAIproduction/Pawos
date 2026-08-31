import React, { useState } from 'react';
import styles from './migrationsCard.module.css';
import type { CardConfig } from '../Card';

interface Migration {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled-back';
  timestamp?: string;
  duration?: string;
  details?: string;
}

interface MigrationsCardProps {
  card: CardConfig;
  onRemoveCard: (cardId: string) => void;
}

export function MigrationsCard({ card, onRemoveCard }: MigrationsCardProps) {
  const [migrations] = useState<Migration[]>([
    {
      id: '001',
      name: 'Create users table',
      status: 'completed',
      timestamp: '2024-01-15 10:30',
      duration: '245ms',
    },
    {
      id: '002',
      name: 'Add email index',
      status: 'completed',
      timestamp: '2024-01-15 10:32',
      duration: '182ms',
    },
    {
      id: '003',
      name: 'Create sessions table',
      status: 'running',
      timestamp: '2024-01-15 10:35',
    },
    {
      id: '004',
      name: 'Add auth columns',
      status: 'pending',
    },
  ]);

  const getStatusIcon = (status: Migration['status']) => {
    switch (status) {
      case 'pending':
        return '◯';
      case 'running':
        return '⟳';
      case 'completed':
        return '✓';
      case 'failed':
        return '✕';
      case 'rolled-back':
        return '↶';
      default:
        return '?';
    }
  };

  return (
    <div className={styles.migrationsCard}>
      {migrations.length === 0 ? (
        <div className={styles.empty}>No migrations</div>
      ) : (
        <div className={styles.migrationsList}>
          {migrations.map((migration) => (
            <div key={migration.id} className={`${styles.migrationItem} ${styles[migration.status]}`}>
              <div className={styles.migrationHeader}>
                <span className={`${styles.statusIcon} ${styles[migration.status]}`}>
                  {getStatusIcon(migration.status)}
                </span>
                <span className={styles.migrationName}>{migration.name}</span>
              </div>

              {migration.timestamp && (
                <div className={styles.metadata}>
                  <span>{migration.timestamp}</span>
                  {migration.duration && <span>{migration.duration}</span>}
                </div>
              )}

              {migration.details && (
                <div className={styles.details}>{migration.details}</div>
              )}

              <div className={styles.migrationActions}>
                {migration.status === 'pending' && (
                  <button className={styles.actionButton}>Run</button>
                )}
                {migration.status === 'running' && (
                  <button className={styles.actionButton}>Cancel</button>
                )}
                {migration.status === 'failed' && (
                  <>
                    <button className={styles.actionButton}>Retry</button>
                    <button className={styles.actionButton}>Rollback</button>
                  </>
                )}
                {migration.status === 'completed' && (
                  <button className={styles.actionButton}>Rollback</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
