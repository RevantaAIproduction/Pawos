import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import type { ExecutionRecord } from '../../../../shared/actions/ExecutionRecordTypes';

type ProjectSummary = { path: string; name: string; taskCount: number; lastActivity: number };

function dirOf(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : null;
}

/**
 * No project-tracking backend exists yet — there is no feature here beyond
 * grouping the real file paths PawOS has already touched (from Work
 * History's ExecutionRecords) by their containing folder. Records with no
 * file paths (pure conversation/analysis) don't produce a project; that's
 * honest, not a gap to paper over.
 */
function deriveProjects(records: ExecutionRecord[]): ProjectSummary[] {
  const byPath = new Map<string, ProjectSummary>();
  for (const record of records) {
    const paths = [...record.filesCreated, ...record.filesModified];
    const dirs = new Set(paths.map(dirOf).filter((d): d is string => !!d));
    for (const dir of dirs) {
      const existing = byPath.get(dir);
      const name = dir.replace(/\\/g, '/').split('/').pop() || dir;
      if (existing) {
        existing.taskCount += 1;
        existing.lastActivity = Math.max(existing.lastActivity, record.startedAt);
      } else {
        byPath.set(dir, { path: dir, name, taskCount: 1, lastActivity: record.startedAt });
      }
    }
  }
  return [...byPath.values()].sort((a, b) => b.lastActivity - a.lastActivity);
}

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function ProjectsSection({ onOpenFolder }: { onOpenFolder: (path: string) => void }) {
  const ipc = useIpcBridge();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    ipc.listExecutions().then((records) => setProjects(deriveProjects(records))).catch(() => setProjects([]));
  }, []);

  if (projects === null) return null;

  if (projects.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>No projects yet</h3>
        <p className={styles.emptyBody}>
          Projects appear here once Paw creates or edits files somewhere — ask it to open or work on a folder to get started.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {projects.map((p) => (
        <div key={p.path} className={styles.card} style={{ cursor: 'pointer' }} onClick={() => onOpenFolder(p.path)}>
          <h3 className={styles.cardTitle}>{p.name}</h3>
          <p className={styles.cardBody} style={{ wordBreak: 'break-all' }}>{p.path}</p>
          <p className={styles.cardBody} style={{ marginTop: 8 }}>
            {p.taskCount} task{p.taskCount === 1 ? '' : 's'} · {timeAgo(p.lastActivity)}
          </p>
        </div>
      ))}
    </div>
  );
}
