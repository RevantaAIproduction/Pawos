import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';

/** Renders every email template with fixed dummy data — for design review only, nothing here ever sends an email. */
export function MailPreviewSection() {
  const ipc = useIpcBridge();
  const [templates, setTemplates] = useState<{ key: string; label: string }[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ipc.listMailTemplates().then((list) => {
      setTemplates(list);
      if (list[0]) setActiveKey(list[0].key);
    });
  }, [ipc]);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    setLoading(true);
    ipc
      .renderMailPreview(activeKey)
      .then((rendered) => {
        if (!cancelled) setHtml(rendered);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ipc, activeKey]);

  return (
    <div className={styles.mailPreview}>
      <div className={styles.mailPreviewList}>
        {templates.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.mailPreviewItem} ${activeKey === t.key ? styles.mailPreviewItemActive : ''}`}
            onClick={() => setActiveKey(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.mailPreviewFrame}>{!loading && html && <iframe srcDoc={html} title="Email preview" sandbox="" />}</div>
    </div>
  );
}
