import React, { useEffect, useState } from 'react';
import styles from './HelpWidget.module.css';
import { ALL_ARTICLES, CATEGORY_LABELS } from '../../../shared/help/articleIndex';
import type { HelpCategoryId } from '../../../shared/help/HelpArticleTypes';
import { ArticleDetail } from '../HelpCenter/ArticleDetail';

export function WidgetHelpTab({ initialArticleId, onArticleOpened }: { initialArticleId: string | null; onArticleOpened: () => void }) {
  const [category, setCategory] = useState<HelpCategoryId | null>(null);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (initialArticleId) {
      setOpenArticleId(initialArticleId);
      onArticleOpened();
    }
  }, [initialArticleId, onArticleOpened]);

  if (openArticleId) {
    return <ArticleDetail articleId={openArticleId} onBack={() => setOpenArticleId(null)} onOpenRelated={setOpenArticleId} />;
  }

  const categories = Object.keys(CATEGORY_LABELS) as HelpCategoryId[];
  const filteredCategories = query.trim()
    ? categories.filter((c) => CATEGORY_LABELS[c].toLowerCase().includes(query.trim().toLowerCase()))
    : categories;

  if (category) {
    const articles = ALL_ARTICLES.filter((a) => a.category === category);
    return (
      <div>
        <button type="button" onClick={() => setCategory(null)} style={{ background: 'none', border: 'none', color: '#96969e', fontSize: 12.5, cursor: 'pointer', marginBottom: 10, padding: 0 }}>
          ← Collections
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#f5f5f7' }}>{CATEGORY_LABELS[category]}</h2>
        {articles.map((a) => (
          <button key={a.id} type="button" className={styles.linkRow} onClick={() => setOpenArticleId(a.id)}>
            <span>{a.title}{a.roadmap ? ' (Coming Soon)' : ''}</span>
            <span>›</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 12px', color: '#f5f5f7' }}>Help</h2>
      <input className={styles.searchInput} placeholder="Search for help" value={query} onChange={(e) => setQuery(e.target.value)} />
      {filteredCategories.map((c) => {
        const count = ALL_ARTICLES.filter((a) => a.category === c).length;
        return (
          <button key={c} type="button" className={styles.linkRow} onClick={() => setCategory(c)}>
            <span>
              {CATEGORY_LABELS[c]}
              <span className={styles.linkRowMeta}> · {count} article{count === 1 ? '' : 's'}</span>
            </span>
            <span>›</span>
          </button>
        );
      })}
    </div>
  );
}
