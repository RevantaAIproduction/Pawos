import React, { useState } from 'react';
import styles from './HelpWidget.module.css';
import { HelpWidgetPanel } from './HelpWidgetPanel';

export function HelpWidgetLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <HelpWidgetPanel onClose={() => setOpen(false)} />}
      <button type="button" className={styles.launcher} onClick={() => setOpen((v) => !v)} aria-label="Help">
        <span style={{ fontSize: 22, lineHeight: 1 }}>{open ? '✕' : '?'}</span>
      </button>
    </>
  );
}
