import React from 'react';
import type { AgentStatusExtension, ExtensionExpandRequest } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface AgentStatusExtensionCardProps {
  extension: AgentStatusExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Agent status extension — shows agent running state with progress
 * Displays step-by-step progress
 */
export function AgentStatusExtensionCard({
  extension,
  onExpand,
  onAction,
}: AgentStatusExtensionCardProps) {
  const getStatusIcon = () => {
    switch (extension.state) {
      case 'idle':
        return '⏳';
      case 'running':
        return '⚙️';
      case 'complete':
        return '✓';
      case 'error':
        return '⚠️';
      case 'stopped':
        return '⏸️';
      default:
        return '?';
    }
  };

  const isRunning = extension.state === 'running';
  const progress = extension.steps
    ? Math.round((extension.steps.filter((s) => s.status === 'completed').length / extension.steps.length) * 100)
    : 0;

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.state]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>{extension.agentName}</div>
          {extension.currentStep && (
            <div className={styles.description}>{extension.currentStep}</div>
          )}
          {extension.totalSteps && (
            <div className={styles.description}>
              Step {extension.steps?.filter((s) => s.status !== 'pending').length || 0}/{extension.totalSteps}
            </div>
          )}
          {isRunning && extension.steps && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className={styles.progressLabel}>{progress}% complete</div>
            </>
          )}
          {extension.steps && extension.steps.length > 0 && (
            <div className={styles.stepsList}>
              {extension.steps.slice(0, 2).map((step) => (
                <div key={step.id} className={styles.stepItem}>
                  <div className={styles.stepProgress}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                      {step.status === 'pending' && '⏳ '}
                      {step.status === 'running' && '⚙️ '}
                      {step.status === 'completed' && '✓ '}
                      {step.status === 'failed' && '⚠️ '}
                      {step.name}
                    </div>
                    {step.status === 'running' && typeof step.progress === 'number' && (
                      <div className={styles.stepProgressBar}>
                        <div
                          className={styles.stepProgressFill}
                          style={{ width: `${step.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {extension.steps.length > 2 && (
                <div className={styles.description}>
                  +{extension.steps.length - 2} more step{extension.steps.length - 2 !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}
          {extension.error && (
            <div className={styles.description} style={{ marginTop: 6, color: 'rgba(255, 100, 100, 0.8)' }}>
              {extension.error}
            </div>
          )}
        </div>
      </div>
      <div className={styles.extensionCardControls}>
        <button
          className={styles.expandButton}
          title="View full agent status"
          onClick={() =>
            onExpand?.({
              extensionId: extension.id,
              extensionType: 'agent-status',
              target: 'agents',
              payload: {
                agentId: extension.agentId,
              },
            })
          }
        >
          ↗
        </button>
      </div>
    </div>
  );
}
