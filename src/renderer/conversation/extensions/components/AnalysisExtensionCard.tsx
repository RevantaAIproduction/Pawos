import React from 'react';
import type { AnalysisExtension } from '../AnalysisExtensionTypes';
import styles from '../extensions.module.css';

interface AnalysisExtensionCardProps {
  extension: AnalysisExtension;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Analysis extension card — drag from browser, paste URL, analyze Slack/Email/Tickets
 * Unified analysis at 0.30 PC with tier-based limits
 */
export function AnalysisExtensionCard({ extension, onAction }: AnalysisExtensionCardProps) {
  const getStatusIcon = () => {
    switch (extension.status) {
      case 'pending':
        return '⏳';
      case 'checking-limits':
        return '💰';
      case 'limit-exceeded':
        return '⛔';
      case 'analyzing':
        return '🔍';
      case 'processing-results':
        return '📊';
      case 'complete':
        return '✓';
      case 'failed':
        return '⚠️';
      case 'cancelled':
        return '✕';
      default:
        return '?';
    }
  };

  const getSourceIcon = () => {
    switch (extension.source) {
      case 'jira-ticket':
        return '🔗';
      case 'linear-ticket':
        return '🎯';
      case 'github-issue':
      case 'github-pr':
        return '🐙';
      case 'slack-message':
      case 'slack-thread':
        return '💬';
      case 'email':
        return '📧';
      case 'meeting-recording':
        return '🎬';
      case 'transcription':
        return '📝';
      case 'code-review':
        return '👁️';
      case 'git-commit':
        return '📋';
      case 'webpage':
        return '🌐';
      case 'pdf':
        return '📄';
      case 'video':
        return '🎥';
      case 'audio':
        return '🎙️';
      default:
        return '📦';
    }
  };

  const renderAnalyzing = () => (
    <div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
        {extension.status === 'checking-limits' && 'Checking compute limits...'}
        {extension.status === 'analyzing' && `Analyzing... ${extension.progress || 0}%`}
        {extension.status === 'processing-results' && 'Processing results...'}
      </div>
      {typeof extension.progress === 'number' && (
        <>
          <div className={styles.progressBar} style={{ marginTop: 6 }}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min(100, extension.progress)}%` }}
            />
          </div>
          <div className={styles.progressLabel}>{extension.progress}% complete</div>
        </>
      )}
    </div>
  );

  const renderCostDisplay = () => {
    if (!extension.costEstimate && !extension.actualCost) return null;

    const cost = extension.actualCost !== undefined ? extension.actualCost : (extension.costEstimate ?? 0);
    const isFree = cost === 0;

    return (
      <div style={{ fontSize: 10, marginTop: 4, color: isFree ? 'rgba(100, 200, 100, 0.8)' : 'rgba(255, 165, 0, 0.8)' }}>
        {isFree ? '✓ Free (tier allowance)' : `💰 ${cost.toFixed(2)} PC`}
      </div>
    );
  };

  const renderResults = () => {
    if (!extension.result) return null;

    const result = extension.result;

    return (
      <div style={{ marginTop: 8 }}>
        <div className={styles.description} style={{ marginBottom: 6 }}>
          {result.summary}
        </div>

        {result.keywords && result.keywords.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {result.keywords.slice(0, 5).map((kw, i) => (
              <span
                key={i}
                style={{
                  fontSize: 9,
                  background: 'rgba(100, 150, 255, 0.15)',
                  border: '1px solid rgba(100, 150, 255, 0.3)',
                  color: 'rgba(100, 150, 255, 0.9)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                {kw}
              </span>
            ))}
            {result.keywords.length > 5 && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>
                +{result.keywords.length - 5}
              </span>
            )}
          </div>
        )}

        {result.insights && result.insights.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginBottom: 3 }}>
              Key insights:
            </div>
            {result.insights.slice(0, 2).map((insight, i) => (
              <div key={i} className={styles.description} style={{ fontSize: 10, marginBottom: 3 }}>
                • {insight.title}
              </div>
            ))}
            {result.insights.length > 2 && (
              <div className={styles.description} style={{ fontSize: 10 }}>
                +{result.insights.length - 2} more insights
              </div>
            )}
          </div>
        )}

        {result.suggestedActions && result.suggestedActions.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginBottom: 3 }}>
              Next steps:
            </div>
            {result.suggestedActions.slice(0, 2).map((action, i) => (
              <div key={i} className={styles.description} style={{ fontSize: 10, marginBottom: 3 }}>
                ☐ {action.action}
              </div>
            ))}
            {result.suggestedActions.length > 2 && (
              <div className={styles.description} style={{ fontSize: 10 }}>
                +{result.suggestedActions.length - 2} more actions
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderError = () => {
    if (!extension.error) return null;

    return (
      <div style={{ marginTop: 6, color: 'rgba(255, 100, 100, 0.8)' }}>
        <div className={styles.description}>Error: {extension.error.message}</div>
      </div>
    );
  };

  const renderLimitExceeded = () => {
    return (
      <div style={{ marginTop: 6 }}>
        <div className={styles.description} style={{ color: 'rgba(255, 100, 100, 0.8)' }}>
          {extension.error?.message || 'Insufficient compute to analyze'}
        </div>
        <button
          className={`${styles.actionButton} ${styles.success}`}
          onClick={() => onAction?.(extension.id, 'upgrade')}
          style={{ marginTop: 6 }}
        >
          Get More Compute
        </button>
      </div>
    );
  };

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.status]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>
            {getSourceIcon()} Analyzing {extension.source.split('-').join(' ')}
          </div>
          <div className={styles.description}>{extension.sourceTitle}</div>

          {extension.status === 'pending' && (
            <div style={{ marginTop: 6 }}>
              <button
                className={styles.actionButton}
                onClick={() => onAction?.(extension.id, 'confirm-analyze')}
              >
                Analyze (0.30 PC)
              </button>
              <button
                className={`${styles.actionButton} ${styles.danger}`}
                onClick={() => onAction?.(extension.id, 'cancel')}
                style={{ marginLeft: 6 }}
              >
                Cancel
              </button>
            </div>
          )}

          {['checking-limits', 'analyzing', 'processing-results'].includes(extension.status) &&
            renderAnalyzing()}

          {extension.status === 'limit-exceeded' && renderLimitExceeded()}

          {extension.status === 'complete' && (
            <>
              {renderCostDisplay()}
              {renderResults()}
            </>
          )}

          {extension.status === 'failed' && renderError()}

          {extension.status === 'cancelled' && (
            <div className={styles.description} style={{ marginTop: 6 }}>
              Analysis cancelled
            </div>
          )}

          {extension.completedAt && extension.status === 'complete' && (
            <div style={{ marginTop: 6, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
              Completed in{' '}
              {Math.round((extension.completedAt - extension.startedAt) / 1000)}s
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
