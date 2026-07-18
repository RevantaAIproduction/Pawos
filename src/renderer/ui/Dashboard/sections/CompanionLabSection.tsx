import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { CompanionManagerPanel } from './CompanionManagerPanel';
import { AvatarViewer } from './AvatarViewer';
import { CompanionLabPanel } from './CompanionLabPanel';

type Tab = 'my-companions' | 'avatar-lab';

export function CompanionLabSection() {
  const [tab, setTab] = useState<Tab>('my-companions');
  const [labOpen, setLabOpen] = useState(false);

  return (
    <div>
      <div className={styles.tabRow}>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === 'my-companions' ? styles.tabButtonActive : ''}`}
          onClick={() => setTab('my-companions')}
        >
          My Companions
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === 'avatar-lab' ? styles.tabButtonActive : ''}`}
          onClick={() => setTab('avatar-lab')}
        >
          Avatar Lab
        </button>
      </div>

      {tab === 'my-companions' && <CompanionManagerPanel onOpenLab={() => setTab('avatar-lab')} />}

      {tab === 'avatar-lab' && (
        <div>
          <AvatarViewer />

          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className={styles.subheading} style={{ marginBottom: 0 }}>
                Add your avatar
              </h3>
              {!labOpen && (
                <button type="button" className={styles.primaryButton} onClick={() => setLabOpen(true)}>
                  Add your avatar
                </button>
              )}
            </div>

            {labOpen && (
              <div style={{ marginTop: 12 }}>
                <CompanionLabPanel
                  onDone={() => {
                    setLabOpen(false);
                    setTab('my-companions');
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
