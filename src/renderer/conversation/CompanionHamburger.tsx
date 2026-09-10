import React, { useState, useRef, useEffect } from 'react';
import styles from './companionHamburger.module.css';
import type { EntitlementSnapshot } from '../../shared/billing/BillingTypes';

interface CompanionHamburgerProps {
  onOpenSettings?: () => void;
  userEmail?: string;
  entitlement?: EntitlementSnapshot | null;
}

export function CompanionHamburger({ onOpenSettings, userEmail = '', entitlement }: CompanionHamburgerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  // Only show user info if data has been loaded (avoid showing defaults during init)
  const userName = userEmail ? userEmail.split('@')[0] : '';
  const userTier = entitlement?.tier || '';
  const hasUserData = userEmail && entitlement;

  const handleFeedback = () => {
    if (feedbackText.trim()) {
      // Send feedback via IPC or API
      console.log('Feedback:', feedbackText);
      setFeedbackText('');
      setFeedbackOpen(false);
    }
  };

  return (
    <div className={styles.container} ref={menuRef} data-interactive="true">
      <button
        className={styles.button}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Menu"
        title="Menu"
      >
        ☰
      </button>

      {menuOpen && (
        <div className={styles.menu}>
          {/* Top Actions */}
          <div className={styles.section}>
            <button className={styles.newButton}>
              <span className={styles.newIcon}>+</span> New
            </button>
          </div>

          {/* Menu Items */}
          <div className={styles.section}>
            <button className={styles.menuItem}>Recent releases/updates</button>
            <button className={styles.menuItem}>Routines</button>
            <button className={styles.menuItem}>Dispatch</button>
          </div>

          {/* Projects & Sessions - Main scrollable area */}
          <div className={styles.projectsSection}>
            <div className={styles.projectsHeader}>Projects & Sessions</div>
            <div className={styles.projectsList}>
              {/* Placeholder - would be populated with real data */}
              <div className={styles.projectGroup}>
                <div className={styles.groupLabel}>Projects</div>
                <div className={styles.emptyState}>No projects yet</div>
              </div>
              <div className={styles.projectGroup}>
                <div className={styles.groupLabel}>Recent Sessions</div>
                <div className={styles.emptyState}>No recent sessions</div>
              </div>
            </div>
          </div>

          {/* User Profile Section - Show when data is loaded */}
          <div className={styles.userSection}>
            {hasUserData && (
              <div className={styles.userInfo}>
                {userName && <div className={styles.userName}>{userName}</div>}
                {userTier && <div className={styles.userTier}>{userTier}</div>}
              </div>
            )}
            <button
              className={styles.feedbackButton}
              onClick={() => setFeedbackOpen(true)}
              title="Send feedback"
            >
              <img src="file:///C:/Users/APPLE/Downloads/Bug.png" alt="Feedback" className={styles.bugIcon} />
            </button>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackOpen && (
        <div className={styles.modalOverlay} onClick={() => setFeedbackOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Send feedback</h2>
            <textarea
              className={styles.feedbackInput}
              placeholder="Describe the issue"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              autoFocus
            />
            <p className={styles.feedbackInfo}>
              This report will include your description and the current session transcript.
              We may use these to debug related issues and improve Claude Code.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setFeedbackOpen(false)}
              >
                Cancel
              </button>
              <button
                className={styles.sendButton}
                onClick={handleFeedback}
                disabled={!feedbackText.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
