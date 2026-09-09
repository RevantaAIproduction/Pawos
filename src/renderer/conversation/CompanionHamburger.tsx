import React, { useState } from 'react';
import styles from './companionHamburger.module.css';

interface CompanionHamburgerProps {
  onOpenSettings?: () => void;
}

export function CompanionHamburger({ onOpenSettings }: CompanionHamburgerProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.container} data-interactive="true">
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
          <button
            className={styles.menuItem}
            onClick={() => {
              onOpenSettings?.();
              setMenuOpen(false);
            }}
          >
            Settings
          </button>
          <button className={styles.menuItem}>Customize</button>
          <button className={styles.menuItem}>More</button>
        </div>
      )}
    </div>
  );
}
