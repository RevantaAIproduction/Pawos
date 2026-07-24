import React, { useEffect } from 'react';
import styles from '../Dashboard/dashboard.module.css';
import type { HelpArticle } from '../../../shared/help/HelpArticleTypes';
import { getArticleById } from '../../../shared/help/articleIndex';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

const sectionStyle: React.CSSProperties = { marginBottom: 18 };
const headingStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#f5f5f7' };
const bodyStyle: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: '#c4c4cc', margin: 0 };
const listStyle: React.CSSProperties = { margin: '0 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.7, color: '#c4c4cc' };

export function ArticleDetail({ articleId, onBack, onOpenRelated }: { articleId: string; onBack: () => void; onOpenRelated: (id: string) => void }) {
  const article = getArticleById(articleId);

  useEffect(() => {
    ipc.helpRecordArticleView(articleId).catch(() => {});
  }, [articleId]);

  if (!article) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Article not found</h3>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  const openOnline = () => void ipc.actionExecute({ type: 'openUrl', url: `https://revantaai.com/pawos/docs/${article.id}` });

  return (
    <div>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#96969e', fontSize: 12.5, cursor: 'pointer', marginBottom: 14, padding: 0 }}>
        ← Back to articles
      </button>

      {article.roadmap && (
        <div style={{ display: 'inline-block', background: 'rgba(139,123,255,0.16)', color: '#c9c0ff', fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, marginBottom: 10 }}>
          COMING SOON
        </div>
      )}

      <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>{article.title}</h2>
      <p style={{ fontSize: 13, color: '#96969e', margin: '0 0 4px' }}>{article.summary}</p>
      <p style={{ fontSize: 11.5, color: '#6f6f78', margin: '0 0 20px' }}>
        {article.readingTimeMinutes} min read · Updated {article.updated} · v{article.pawosVersion} · {article.author}
      </p>

      <div style={sectionStyle}>
        <div style={headingStyle}>Overview</div>
        <p style={bodyStyle}>{article.overview}</p>
      </div>

      {article.features.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Features</div>
          <ul style={listStyle}>
            {article.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={headingStyle}>How It Works</div>
        <p style={bodyStyle}>{article.howItWorks}</p>
      </div>

      {article.bestPractices.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Best Practices</div>
          <ul style={listStyle}>
            {article.bestPractices.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {article.examples.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Examples</div>
          {article.examples.map((ex) => (
            <div key={ex.title} style={{ marginBottom: 10 }}>
              <p style={{ ...bodyStyle, fontWeight: 600, marginBottom: 4 }}>{ex.title}</p>
              <ol style={listStyle}>
                {ex.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {article.troubleshooting.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Troubleshooting</div>
          <ul style={listStyle}>
            {article.troubleshooting.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {article.requirements.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Requirements</div>
          <ul style={listStyle}>
            {article.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {article.permissions.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Permissions</div>
          <ul style={listStyle}>
            {article.permissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {article.administration && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Administration</div>
          <p style={bodyStyle}>{article.administration}</p>
        </div>
      )}

      {article.billing && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Billing</div>
          <p style={bodyStyle}>{article.billing}</p>
        </div>
      )}

      {article.faq.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Frequently Asked Questions</div>
          {article.faq.map((f) => (
            <div key={f.question} style={{ marginBottom: 10 }}>
              <p style={{ ...bodyStyle, fontWeight: 600, marginBottom: 2 }}>{f.question}</p>
              <p style={bodyStyle}>{f.answer}</p>
            </div>
          ))}
        </div>
      )}

      {(article.relatedArticleIds.length > 0 || (article.relatedSettings?.length ?? 0) > 0 || (article.relatedApps?.length ?? 0) > 0) && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Related</div>
          {article.relatedArticleIds.length > 0 && (
            <p style={bodyStyle}>
              Related Articles:{' '}
              {article.relatedArticleIds.map((id, i) => (
                <React.Fragment key={id}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    onClick={() => onOpenRelated(id)}
                    style={{ background: 'none', border: 'none', color: '#8b7bff', cursor: 'pointer', padding: 0, font: 'inherit' }}
                  >
                    {getArticleById(id)?.title ?? id}
                  </button>
                </React.Fragment>
              ))}
            </p>
          )}
          {article.relatedSettings && article.relatedSettings.length > 0 && (
            <p style={bodyStyle}>Related Settings: {article.relatedSettings.join(', ')}</p>
          )}
          {article.relatedApps && article.relatedApps.length > 0 && (
            <p style={bodyStyle}>Related Apps: {article.relatedApps.join(', ')}</p>
          )}
        </div>
      )}

      <button type="button" className={styles.primaryButton} onClick={openOnline}>
        Continue Reading Online
      </button>
    </div>
  );
}

export type { HelpArticle };
