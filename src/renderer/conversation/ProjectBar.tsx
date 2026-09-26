import React, { useEffect, useRef, useState } from 'react';
import styles from './projectBar.module.css';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { ConversationSnapshot } from './ConversationTypes';
import { projectName } from './projectClone';
import { agentChangedProject, agentIsBusy, createPrRequest, summarizeDiff, type DiffSummary } from './projectBarModel';

interface ProjectBarProps {
  projectFolder: string;
  snapshot: ConversationSnapshot;
  executeAction: (request: ActionRequest) => Promise<ActionResult>;
  onCreatePr: (request: string) => void;
  onClose: () => void;
}

const icon = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

/**
 * Above the message box, only while a project is open: folder · git branch · +added −deleted ·
 * Create PR (see projectBarModel.ts for exactly when the counts and Create PR appear / enable).
 */
export function ProjectBar({ projectFolder, snapshot, executeAction, onCreatePr, onClose }: ProjectBarProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const busy = agentIsBusy(snapshot);
  const worked = agentChangedProject(snapshot.taskHistory, projectFolder);
  // The parent passes a new function each render — keep the latest without re-running git on every render.
  const executeRef = useRef(executeAction);
  executeRef.current = executeAction;

  // Branch + line counts: when the project changes, and again each time the agent finishes a turn.
  useEffect(() => {
    if (busy) return;
    let cancelled = false;
    const executeAction = executeRef.current;
    void executeAction({ type: 'gitBranch', cwd: projectFolder }).then((result) => {
      if (cancelled) return;
      const current = result.ok ? (result.data as { current?: string } | undefined)?.current : undefined;
      setBranch(current && current !== 'HEAD' ? current : null);
    });
    if (worked) {
      void executeAction({ type: 'gitDiffStat', cwd: projectFolder, includeUntracked: true }).then((result) => {
        if (!cancelled) setDiff(result.ok ? summarizeDiff(result.data) : null);
      });
    } else {
      setDiff(null);
    }
    return () => {
      cancelled = true;
    };
  }, [projectFolder, busy, worked, snapshot.taskHistory?.length]);

  const hasChanges = worked && diff !== null && diff.files > 0;

  return (
    <div className={styles.bar} role="group" aria-label="Open project">
      <span className={styles.item} title={projectFolder}>
        <svg {...icon}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        {projectName(projectFolder)}
      </span>
      {branch && (
        <span className={styles.item} title={`Git branch: ${branch}`}>
          <svg {...icon}>
            <circle cx="6" cy="5" r="2" />
            <circle cx="6" cy="19" r="2" />
            <circle cx="18" cy="8" r="2" />
            <path d="M6 7v10M18 10a6 6 0 0 1-6 6H8" />
          </svg>
          {branch}
        </span>
      )}
      <span className={styles.spacer} />
      {hasChanges && diff && (
        <>
          <span className={styles.diff} title={`${diff.files} file${diff.files === 1 ? '' : 's'} changed`}>
            <span className={styles.added}>+{diff.added.toLocaleString()}</span>
            <span className={styles.deleted}>−{diff.deleted.toLocaleString()}</span>
          </span>
          {branch && (
            <button
              type="button"
              className={styles.prButton}
              disabled={busy}
              title={busy ? 'Available when the agent finishes' : 'Commit, push and open a pull request (asks before each step)'}
              onClick={() => onCreatePr(createPrRequest(projectFolder, branch))}
            >
              Create PR
            </button>
          )}
        </>
      )}
      <button type="button" className={styles.close} onClick={onClose} title="Close project" aria-label="Close project">
        <svg {...icon}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
