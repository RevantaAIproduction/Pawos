import React from 'react';
import styles from './contextualPlanPanel.module.css';
import type { ProjectPlan, ProjectPlanStatus } from './ConversationTypes';

interface ContextualPlanPanelProps {
  plan?: ProjectPlan;
  onApprove?: () => void;
  onDeny?: () => void;
  onRevise?: () => void;
}

export function ContextualPlanPanel({ plan, onApprove, onDeny, onRevise }: ContextualPlanPanelProps) {
  if (!plan || plan.status !== 'proposed') {
    return null;
  }

  const steps = plan.steps || [];
  const affectedFiles = plan.affectedFiles || [];
  const additions = affectedFiles.filter((f) => f.type === 'add').length;
  const deletions = affectedFiles.filter((f) => f.type === 'delete').length;
  const modifications = affectedFiles.filter((f) => f.type === 'modify').length;

  return (
    <div className={styles.panel} data-interactive="true">
      <div className={styles.header}>
        <span className={styles.title}>Plan proposed by PawOS</span>
      </div>
      {steps.length > 0 && (
        <div className={styles.steps}>
          {steps.slice(0, 5).map((step, idx) => (
            <div key={idx} className={styles.step}>
              <span className={styles.stepNumber}>{idx + 1}</span>
              <span className={styles.stepText}>{step}</span>
            </div>
          ))}
          {steps.length > 5 && <div className={styles.more}>+{steps.length - 5} more steps</div>}
        </div>
      )}
      {affectedFiles.length > 0 && (
        <div className={styles.affected}>
          <span className={styles.label}>Files affected</span>
          <span className={styles.changes}>
            {additions > 0 && <span className={styles.add}>+{additions}</span>}
            {modifications > 0 && <span className={styles.modify}>~{modifications}</span>}
            {deletions > 0 && <span className={styles.delete}>-{deletions}</span>}
          </span>
        </div>
      )}
      <div className={styles.actions}>
        <button className={styles.revise} onClick={onRevise}>
          Revise
        </button>
        <button className={styles.deny} onClick={onDeny}>
          Deny plan
        </button>
        <button className={styles.approve} onClick={onApprove}>
          Approve plan
        </button>
      </div>
    </div>
  );
}
