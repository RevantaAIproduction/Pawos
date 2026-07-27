import React from 'react';
import styles from './dashboard.module.css';

/**
 * The consistent top-of-page block every Settings sub-page renders: title,
 * one-line description, and an optional live-status/action row. Gives every
 * page — even ones that don't get a bespoke rebuild this pass — the same
 * premium header instead of a bare card title.
 */
export function SettingsPageHeader({
  title,
  description,
  status,
  action,
}: {
  title: string;
  description?: string;
  status?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.settingsPageHeader}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 className={styles.settingsPageHeaderTitle}>{title}</h2>
          {description && <p className={styles.settingsPageHeaderDesc}>{description}</p>}
        </div>
        {action}
      </div>
      {status && <div className={styles.settingsPageHeaderStatus}>{status}</div>}
    </div>
  );
}
