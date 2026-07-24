import React, { useState } from 'react';
import styles from './HelpWidget.module.css';
import { WidgetHomeTab } from './WidgetHomeTab';
import { WidgetMessagesTab } from './WidgetMessagesTab';
import { WidgetHelpTab } from './WidgetHelpTab';

type WidgetTab = 'home' | 'messages' | 'help';

export function HelpWidgetPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<WidgetTab>('home');
  const [articleToOpen, setArticleToOpen] = useState<string | null>(null);

  const openArticle = (articleId: string) => {
    setArticleToOpen(articleId);
    setTab('help');
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span>✳</span> PawOS Support
        </div>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {tab === 'home' && <WidgetHomeTab onOpenArticle={openArticle} onGoToMessages={() => setTab('messages')} />}
        {tab === 'messages' && <WidgetMessagesTab />}
        {tab === 'help' && <WidgetHelpTab initialArticleId={articleToOpen} onArticleOpened={() => setArticleToOpen(null)} />}
      </div>

      <div className={styles.bottomTabs}>
        <button type="button" className={`${styles.bottomTab} ${tab === 'home' ? styles.bottomTabActive : ''}`} onClick={() => setTab('home')}>
          <span>⌂</span> Home
        </button>
        <button type="button" className={`${styles.bottomTab} ${tab === 'messages' ? styles.bottomTabActive : ''}`} onClick={() => setTab('messages')}>
          <span>✉</span> Messages
        </button>
        <button type="button" className={`${styles.bottomTab} ${tab === 'help' ? styles.bottomTabActive : ''}`} onClick={() => setTab('help')}>
          <span>?</span> Help
        </button>
      </div>
    </div>
  );
}
