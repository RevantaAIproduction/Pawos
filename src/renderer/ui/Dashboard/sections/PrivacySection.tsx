import React from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';

/**
 * Honest, informational only — PawOS has no bulk data-export or
 * delete-everything action implemented yet, so this doesn't offer one.
 * Per-conversation delete already exists in Conversation History.
 */
export function PrivacySection() {
  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>What's stored, and where</h3>
        <p className={styles.cardBody}>
          Everything PawOS remembers — companion memory, conversation history, work history, and
          workspace context — is stored locally on this device. Nothing is uploaded to a PawOS
          server.
        </p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
          <li className={styles.cardBody}>Companion memory and personality settings</li>
          <li className={styles.cardBody}>Conversation history — delete individual conversations anytime in Conversation History</li>
          <li className={styles.cardBody}>Work history and project context</li>
        </ul>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Recording consent</h3>
        <p className={styles.cardBody}>
          PawOS always asks before recording a meeting or phone call — recording never starts
          silently.
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Privacy policy</h3>
        <button
          type="button"
          className={styles.chip}
          onClick={() => ipc.actionExecute({ type: 'openUrl', url: 'https://revantaai.com/privacy' })}
        >
          View Privacy Policy
        </button>
      </div>
    </div>
  );
}
