import React, { useState } from 'react';
import styles from './browserCard.module.css';
import type { CardConfig } from '../Card';

interface Platform {
  id: string;
  name: string;
  icon: string;
  url?: string;
  status: 'connected' | 'disconnected' | 'loading';
  data?: {
    label: string;
    value: string | number;
  }[];
}

interface BrowserCardProps {
  card: CardConfig;
  onRemoveCard: (cardId: string) => void;
}

export function BrowserCard({ card, onRemoveCard }: BrowserCardProps) {
  const [platforms] = useState<Platform[]>([
    {
      id: 'jira',
      name: 'Jira',
      icon: '📋',
      status: 'connected',
      data: [
        { label: 'Open Issues', value: 24 },
        { label: 'In Progress', value: 5 },
      ],
    },
    {
      id: 'github',
      name: 'GitHub',
      icon: '🐙',
      status: 'connected',
      data: [
        { label: 'PRs', value: 3 },
        { label: 'Issues', value: 12 },
      ],
    },
    {
      id: 'linear',
      name: 'Linear',
      icon: '📊',
      status: 'disconnected',
      data: [],
    },
    {
      id: 'preview',
      name: 'Live Preview',
      icon: '🌐',
      status: 'connected',
      data: [
        { label: 'Port', value: '3000' },
        { label: 'Status', value: 'running' },
      ],
    },
  ]);

  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(platforms[0] || null);

  return (
    <div className={styles.browserCard}>
      <div className={styles.platformList}>
        {platforms.map((platform) => (
          <button
            key={platform.id}
            className={`${styles.platformButton} ${selectedPlatform?.id === platform.id ? styles.active : ''}`}
            onClick={() => setSelectedPlatform(platform)}
          >
            <span className={styles.platformIcon}>{platform.icon}</span>
            <span className={styles.platformName}>{platform.name}</span>
            <span className={`${styles.platformStatus} ${styles[platform.status]}`} />
          </button>
        ))}
      </div>

      {selectedPlatform && (
        <div className={styles.platformContent}>
          <div className={styles.platformHeader}>
            <h3>{selectedPlatform.name}</h3>
            <span className={`${styles.statusBadge} ${styles[selectedPlatform.status]}`}>
              {selectedPlatform.status === 'connected' && '✓ Connected'}
              {selectedPlatform.status === 'disconnected' && '✕ Disconnected'}
              {selectedPlatform.status === 'loading' && '⟳ Loading'}
            </span>
          </div>

          {selectedPlatform.status === 'connected' && selectedPlatform.data && selectedPlatform.data.length > 0 ? (
            <div className={styles.dataList}>
              {selectedPlatform.data.map((item, idx) => (
                <div key={idx} className={styles.dataItem}>
                  <span className={styles.dataLabel}>{item.label}</span>
                  <span className={styles.dataValue}>{item.value}</span>
                </div>
              ))}
              <button className={styles.openButton}>
                Open {selectedPlatform.name} ↗
              </button>
            </div>
          ) : selectedPlatform.status === 'disconnected' ? (
            <div className={styles.placeholder}>
              <p>Not connected</p>
              <button className={styles.connectButton}>Connect {selectedPlatform.name}</button>
            </div>
          ) : (
            <div className={styles.placeholder}>
              <p>Loading {selectedPlatform.name}...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
