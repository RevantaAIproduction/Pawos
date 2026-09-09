import React, { useMemo, useState } from 'react';
import styles from './projectContextBar.module.css';
import { getCodingWorkspaceRoots, getLatestActiveFilePath, getPathBasename } from '../workspace/codingWorkspaceModel';
import type { ConversationTaskRecord } from './ConversationTypes';

interface ProjectContextBarProps {
  activeTask?: ConversationTaskRecord;
  currentWorkingFile?: string;
}

export function ProjectContextBar({ activeTask, currentWorkingFile }: ProjectContextBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const workspaceRoots = useMemo(() => {
    return activeTask ? getCodingWorkspaceRoots(activeTask) : [];
  }, [activeTask]);

  const activeFilePath = useMemo(() => {
    return activeTask ? getLatestActiveFilePath(activeTask) : undefined;
  }, [activeTask]);

  const displayedRoot = workspaceRoots[workspaceRoots.length - 1];
  const displayedFile = currentWorkingFile || activeFilePath;

  if (!displayedRoot && !displayedFile) {
    return null;
  }

  const rootName = displayedRoot ? getPathBasename(displayedRoot) : undefined;
  const fileName = displayedFile ? getPathBasename(displayedFile) : undefined;

  return (
    <div className={styles.contextBar} data-interactive="true">
      <div className={styles.contextContent}>
        {rootName && (
          <>
            <div className={styles.badge}>
              <span className={styles.icon}>📁</span>
              <span className={styles.text}>{rootName}</span>
              <span className={styles.chevron}>▾</span>
            </div>
            {fileName && (
              <>
                <span className={styles.separator}>•</span>
                <div className={styles.badge}>
                  <span className={styles.icon}>📄</span>
                  <span className={styles.text}>{fileName}</span>
                </div>
              </>
            )}
          </>
        )}
        {!rootName && fileName && (
          <div className={styles.badge}>
            <span className={styles.icon}>📄</span>
            <span className={styles.text}>{fileName}</span>
          </div>
        )}
      </div>
      {showDropdown && workspaceRoots.length > 0 && (
        <div className={styles.dropdown}>
          <div className={styles.section}>
            <div className={styles.label}>Projects</div>
            {workspaceRoots.map((root, idx) => (
              <button
                key={idx}
                className={`${styles.item} ${root === displayedRoot ? styles.active : ''}`}
                onClick={() => setShowDropdown(false)}
              >
                📁 {getPathBasename(root)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
