import React, { useMemo, useState } from 'react';
import styles from './conversationPanel.module.css';
import {
  buildArchitectureDiagram,
  getProjectPlanLifecycle,
  parseChecklistLines,
  parseProjectPlanSections,
  summarizePlanCoverage,
  type ProjectPlanStatus,
} from './ProjectPlanningUX';

export function ProjectPlanCard({
  content,
  status = 'DRAFT',
  onBuild,
  onModify,
  onAccept,
}: {
  content: string;
  status?: ProjectPlanStatus;
  onBuild: () => void;
  onModify: () => void;
  onAccept?: () => void;
}) {
  const sections = useMemo(() => parseProjectPlanSections(content), [content]);
  const coverage = useMemo(() => summarizePlanCoverage(content), [content]);
  const diagram = useMemo(() => buildArchitectureDiagram(content), [content]);

  // Real, but local-only: PawOS today has no persisted plan-approval status
  // — approval is purely conversational (the same message this card sends
  // is all the backend ever sees). This reflects the real click that just
  // happened, not a fabricated server-side state; it resets on remount.
  const [locallyAccepted, setLocallyAccepted] = useState(false);
  const effectiveStatus: ProjectPlanStatus = locallyAccepted && status === 'DRAFT' ? 'APPROVED' : status;
  const lifecycle = useMemo(() => getProjectPlanLifecycle(effectiveStatus), [effectiveStatus]);

  const handleAccept = () => {
    setLocallyAccepted(true);
    onAccept?.();
  };

  return (
    <section className={styles.planCard} aria-label="Project plan">
      <div className={styles.planHeader}>
        <div>
          <div className={styles.planKicker}>PROJECT PLAN</div>
          <h3 className={styles.planTitle}>Project Blueprint</h3>
        </div>
        <span className={styles.planStatus}>{effectiveStatus}</span>
      </div>

      <div className={styles.planLifecycle} aria-label="Project lifecycle">
        {lifecycle.map((step) => (
          <span key={step.label} className={`${styles.planLifecycleStep} ${step.active ? styles.planLifecycleActive : ''} ${step.complete ? styles.planLifecycleDone : ''}`}>
            {step.label}
          </span>
        ))}
      </div>

      <div className={styles.planCoverage}>
        <span>Covered: {coverage.covered.length ? coverage.covered.join(', ') : 'None detected'}</span>
        {coverage.missing.length > 0 && <span>Needs detail: {coverage.missing.join(', ')}</span>}
      </div>

      {diagram && (
        <div className={styles.archDiagram} aria-label="Architecture diagram">
          {diagram.nodes.map((node) => (
            <div key={node} className={styles.archNode}>
              {node}
            </div>
          ))}
        </div>
      )}

      <div className={styles.planSections}>
        {sections.map((section, index) => {
          const checklist = parseChecklistLines(section.body);
          return (
            <details key={`${section.title}-${index}`} className={styles.planSection} open={index < 4}>
              <summary>
                <span className={styles.planSectionNumber}>{index + 1}</span>
                {section.title}
              </summary>
              {checklist ? (
                <ul className={styles.planChecklist}>
                  {checklist.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              ) : (
                <p>{section.body}</p>
              )}
            </details>
          );
        })}
      </div>

      <div className={styles.planActions}>
        <button type="button" className={styles.planSecondaryAction} onClick={onModify}>
          Revise Plan
        </button>
        <button type="button" className={locallyAccepted ? styles.planAcceptedAction : styles.planSecondaryAction} onClick={handleAccept} disabled={locallyAccepted}>
          {locallyAccepted ? 'Plan Accepted' : 'Accept Plan'}
        </button>
        <button type="button" className={styles.planPrimaryAction} onClick={onBuild}>
          Build Project
        </button>
      </div>
      <p className={styles.planActionsHint}>
        Build Project starts real execution against this plan — files will be created, commands will run, and results will
        appear in Working History.
      </p>
    </section>
  );
}
