import React, { useEffect } from 'react';
import styles from './splashScreen.module.css';

export function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1400);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className={styles.splash}>
      <div className={styles.orbWrap}>
        <div className={styles.orbGlow} />
        <div className={styles.orb} />
      </div>
      <div className={styles.wordmark}>PawOS</div>
      <div className={styles.tagline}>Your desktop AI companion</div>
    </div>
  );
}
