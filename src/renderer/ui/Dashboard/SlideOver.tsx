import React, { useEffect } from 'react';
import styles from './dashboard.module.css';

/**
 * A right-side sliding drawer — the replacement for "expand a big form
 * inline under the row you clicked." Used for connector connect/detail
 * flows in ConnectionsPage. Closes on Escape or backdrop click.
 */
export function SlideOver({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className={styles.slideOverBackdrop} onClick={onClose} />
      <div className={styles.slideOverPanel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.slideOverHeader}>
          <div>
            <h3 className={styles.slideOverTitle}>{title}</h3>
            {subtitle && <p className={styles.slideOverSubtitle}>{subtitle}</p>}
          </div>
          <button type="button" className={styles.slideOverClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.slideOverBody}>{children}</div>
      </div>
    </>
  );
}
