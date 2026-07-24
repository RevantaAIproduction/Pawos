import React, { useEffect, useMemo, useState } from 'react';
import styles from './HelpWidget.module.css';
import { searchHelpArticles } from '../../help/HelpSearch';
import { ALL_ARTICLES } from '../../../shared/help/articleIndex';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { aiRouter } from '../../ai/AIRouter';
import type { HelpActivityState } from '../../services/ipc/ipcTypes';

export function WidgetHomeTab({ onOpenArticle, onGoToMessages }: { onOpenArticle: (id: string) => void; onGoToMessages: () => void }) {
  const [query, setQuery] = useState('');
  const [appVersion, setAppVersion] = useState('…');
  const [activity, setActivity] = useState<HelpActivityState>({ viewCounts: {}, recentlyViewed: [] });
  const [now, setNow] = useState('');

  useEffect(() => {
    ipc.systemGetAppVersion().then(setAppVersion).catch(() => {});
    ipc.helpGetActivity().then(setActivity).catch(() => {});
    setNow(new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
  }, []);

  const aiConfigured = aiRouter.isConfigured(aiRouter.getActiveProviderId());
  const searchResults = useMemo(() => (query.trim() ? searchHelpArticles(query, 6) : []), [query]);

  const suggested = useMemo(() => {
    const withCounts = ALL_ARTICLES.map((a) => ({ a, count: activity.viewCounts[a.id] ?? 0 }));
    withCounts.sort((x, y) => y.count - x.count);
    const top = withCounts.filter((x) => x.count > 0).slice(0, 4).map((x) => x.a);
    if (top.length >= 3) return top;
    return ALL_ARTICLES.filter((a) => a.category === 'gettingStarted').slice(0, 4);
  }, [activity]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 2px', color: '#f5f5f7' }}>Need support?</h2>
      <p style={{ fontSize: 14, color: '#96969e', margin: '0 0 16px' }}>How can we help?</p>

      <div className={styles.statusCard}>
        <span className={styles.statusDot} style={{ background: aiConfigured ? '#4ade80' : '#f5b942' }} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#f5f5f7' }}>
            Status: {aiConfigured ? 'All Systems Operational' : 'AI provider not configured'}
          </div>
          <div style={{ fontSize: 11, color: '#6f6f78' }}>
            v{appVersion} · Checked {now}
          </div>
        </div>
      </div>

      <button type="button" className={styles.messageCta} onClick={onGoToMessages}>
        Send us a message
        <span>→</span>
      </button>

      <input
        className={styles.searchInput}
        placeholder="Search for help"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {searchResults.length > 0 ? (
        <div>
          {searchResults.map((a) => (
            <button key={a.id} type="button" className={styles.linkRow} onClick={() => onOpenArticle(a.id)}>
              <span>{a.title}</span>
              <span>›</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          {suggested.map((a) => (
            <button key={a.id} type="button" className={styles.linkRow} onClick={() => onOpenArticle(a.id)}>
              <span>{a.title}</span>
              <span>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
