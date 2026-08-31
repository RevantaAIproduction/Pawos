import React, { useState } from 'react';
import styles from '../Dashboard/dashboard.module.css';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

export interface CreateProjectModalProps {
  open: boolean;
  organizationId: string | null;
  onClose: () => void;
  onCreated?: (projectId: string) => void;
}

export function CreateProjectModal({ open, organizationId, onClose, onCreated }: CreateProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setProjectName('');
    setSelectedFolder(null);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectFolder = async () => {
    try {
      const folder = await ipc.selectFolder();
      if (folder) {
        setSelectedFolder(folder);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select folder');
    }
  };

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }
    if (!selectedFolder) {
      setError('Please select a project folder');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      // Create project
      const project = await ipc.projectCreate(projectName.trim(), organizationId);

      // Attach local path (main process verifies folder and may mark verified)
      await ipc.projectAttach(project.id, selectedFolder);

      // Request verification (main process checks folder exists/accessible)
      await ipc.projectMarkVerified(project.id);

      resetForm();
      handleClose();
      onCreated?.(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.ratingModalOverlay}>
      <div className={styles.ratingModalPanel} style={{ minWidth: 400 }}>
        <h3 className={styles.cardTitle}>Create New Project</h3>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Project Name Input */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Project Name
            </label>
            <input
              type="text"
              placeholder="e.g., My React App"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={creating}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Folder Selection */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
              Project Folder
            </label>
            <button
              type="button"
              onClick={selectFolder}
              disabled={creating}
              className={styles.primaryButton}
              style={{ width: '100%', textAlign: 'left' }}
            >
              {selectedFolder ? selectedFolder : 'Select Folder…'}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: 8,
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                color: 'rgb(220, 53, 69)',
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!projectName.trim() || !selectedFolder || creating}
              onClick={handleCreate}
            >
              {creating ? 'Creating…' : 'Create Project'}
            </button>
            <button type="button" className={styles.chip} onClick={handleClose} disabled={creating}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
