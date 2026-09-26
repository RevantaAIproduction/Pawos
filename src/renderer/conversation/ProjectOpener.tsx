import React, { useEffect, useRef, useState } from 'react';
import styles from './projectOpener.module.css';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { ManagedProcessInfo } from '../../shared/actions/ProcessTypes';
import { checkRepoUrl, joinPath, projectName } from './projectClone';

interface ProjectOpenerProps {
  projectFolder: string | null;
  onOpenProject: (folder: string) => void;
  onCloseProject: () => void;
  selectFolder: () => Promise<string | null>;
  executeAction: (request: ActionRequest) => Promise<ActionResult>;
}

const CLONE_POLL_MS = 1000;
const CLONE_MAX_MS = 15 * 60 * 1000;

/**
 * Top-left project button: open a local folder, or clone a repository URL into a folder you pick —
 * either becomes the open project PawOS works on. Cloning runs `git clone` as a background process
 * (no time limit for big repos) and opens the new folder when it finishes.
 */
export function ProjectOpener({ projectFolder, onOpenProject, onCloseProject, selectFolder, executeAction }: ProjectOpenerProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<{ kind: 'idle' | 'working' | 'error'; text?: string }>({ kind: 'idle' });
  const rootRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => () => {
    cancelledRef.current = true;
  }, []);

  const openFolder = async () => {
    const folder = await selectFolder();
    if (!folder) return;
    onOpenProject(folder);
    setStatus({ kind: 'idle' });
    setOpen(false);
  };

  const clone = async () => {
    const check = checkRepoUrl(url);
    if (!check.ok) {
      setStatus({ kind: 'error', text: check.message });
      return;
    }
    const parent = await selectFolder();
    if (!parent) return;
    const destination = joinPath(parent, check.folderName);
    setStatus({ kind: 'working', text: `Cloning ${check.folderName}…` });

    const started = await executeAction({ type: 'startProcess', command: `git clone ${check.url}`, cwd: parent, label: `git clone ${check.folderName}` });
    if (!started.ok) {
      setStatus({ kind: 'error', text: started.message || 'Couldn’t start git clone.' });
      return;
    }
    const processId = (started.data as { id?: string } | undefined)?.id;
    if (!processId) {
      setStatus({ kind: 'error', text: 'Couldn’t track the clone.' });
      return;
    }

    const deadline = Date.now() + CLONE_MAX_MS;
    while (!cancelledRef.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, CLONE_POLL_MS));
      const list = await executeAction({ type: 'listProcesses' });
      const info = ((list.data as { processes?: ManagedProcessInfo[] } | undefined)?.processes ?? []).find((p) => p.id === processId);
      if (!info || info.status === 'running' || info.status === 'starting') continue;
      if (info.status === 'exited' && info.exitCode === 0) {
        onOpenProject(destination);
        setUrl('');
        setStatus({ kind: 'idle' });
        setOpen(false);
        return;
      }
      const output = await executeAction({ type: 'getProcessOutput', processId, maxChars: 600 });
      const tail = String((output.data as { output?: string } | undefined)?.output ?? '').trim().split(/\r?\n/).slice(-3).join(' ');
      setStatus({ kind: 'error', text: tail ? `Clone failed: ${tail}` : 'Clone failed.' });
      return;
    }
    if (!cancelledRef.current) setStatus({ kind: 'error', text: 'The clone is taking too long — check Tasks for its progress.' });
  };

  const label = projectFolder ? projectName(projectFolder) : 'Open project';

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.trigger} ${projectFolder ? styles.triggerActive : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={projectFolder ?? 'Open a project folder or clone a repository'}
        aria-expanded={open}
      >
        <span aria-hidden="true" className={styles.folderIcon}>▣</span>
        <span className={styles.triggerLabel}>{label}</span>
        <span aria-hidden="true" className={styles.chevron}>▾</span>
      </button>

      {open && (
        <div className={styles.menu} role="dialog" aria-label="Open project">
          {projectFolder && (
            <div className={styles.current}>
              <div className={styles.currentLabel}>Open project</div>
              <div className={styles.currentPath} title={projectFolder}>{projectFolder}</div>
            </div>
          )}

          <button type="button" className={styles.item} onClick={() => void openFolder()} disabled={status.kind === 'working'}>
            Open folder…
          </button>

          <div className={styles.cloneSection}>
            <div className={styles.cloneLabel}>Clone a repository</div>
            <div className={styles.cloneRow}>
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.currentTarget.value);
                  if (status.kind === 'error') setStatus({ kind: 'idle' });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void clone();
                }}
                placeholder="https://github.com/owner/repo.git"
                disabled={status.kind === 'working'}
              />
              <button type="button" onClick={() => void clone()} disabled={!url.trim() || status.kind === 'working'}>
                Clone
              </button>
            </div>
            <div className={styles.hint}>You’ll pick the folder to clone into.</div>
          </div>

          {status.text && (
            <div className={status.kind === 'error' ? styles.error : styles.working} role="status">
              {status.text}
            </div>
          )}

          {projectFolder && (
            <button
              type="button"
              className={`${styles.item} ${styles.closeItem}`}
              onClick={() => {
                onCloseProject();
                setOpen(false);
              }}
            >
              Close project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
