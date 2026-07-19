import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { CompanionManagerPanel } from './CompanionManagerPanel';
import { CompanionGalleryPanel } from './CompanionGalleryPanel';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import { validateUploadedFile } from '../../../avatar/CompanionUploadPipeline';
import { generateCompanionThumbnail } from '../../../avatar/CompanionThumbnailGenerator';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';

type Tab = 'my-companions' | 'gallery' | 'upload';

export function CompanionLabSection() {
  const [tab, setTab] = useState<Tab>('my-companions');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = React.useRef(0);
  const { createFromUpload, setAvatar } = useCompanionProfiles();

  const processUpload = async (filePath: string) => {
    setUploadError(null);
    const validation = validateUploadedFile(filePath);
    if (!validation.ok) {
      setUploadError(validation.message);
      return;
    }
    setUploading(true);
    try {
      const name = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'Uploaded Companion';
      const profile = createFromUpload({ name, filePath });
      setTab('my-companions');
      // Thumbnail generation is cosmetic-only — a failure here (e.g. a file three.js can load
      // structurally but can't frame sensibly) should never undo an otherwise-successful upload.
      try {
        const thumbnail = await generateCompanionThumbnail(filePath);
        setAvatar(profile.id, thumbnail);
      } catch {
        // No thumbnail; the card falls back to its text-only layout.
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to add that companion.');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    setUploadError(null);
    const filePath = await ipc.companionPickUploadFile();
    if (!filePath) return;
    await processUpload(filePath);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const filePath = ipc.companionGetPathForFile(file);
    if (!filePath) {
      setUploadError('Could not read that file — try the "Browse for a file" button instead.');
      return;
    }
    await processUpload(filePath);
  };

  return (
    <div>
      <div className={styles.tabRow}>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === 'my-companions' ? styles.tabButtonActive : ''}`}
          onClick={() => setTab('my-companions')}
        >
          My Companions
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === 'gallery' ? styles.tabButtonActive : ''}`}
          onClick={() => setTab('gallery')}
        >
          Gallery
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === 'upload' ? styles.tabButtonActive : ''}`}
          onClick={() => setTab('upload')}
        >
          Upload Companion
        </button>
      </div>

      {tab === 'my-companions' && (
        <div key="my-companions" className={styles.fadeInUp}>
          <CompanionManagerPanel onOpenLab={() => setTab('upload')} />
        </div>
      )}

      {tab === 'gallery' && (
        <div key="gallery" className={styles.fadeInUp}>
          <CompanionGalleryPanel />
        </div>
      )}

      {tab === 'upload' && (
        <div key="upload" className={styles.fadeInUp}>
          <h3 className={styles.subheading} style={{ marginTop: 0 }}>
            Upload Companion
          </h3>
          <p className={styles.cardBody} style={{ marginBottom: 12 }}>
            Bring your own 3D model. PawOS validates the file, auto-rigs it onto the shared
            skeleton when it doesn't already have one, and wires up expressions and lip sync where
            the model supports them — no photo capture or AI generation required.
          </p>

          <div
            className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e)}
          >
            {uploading ? (
              <>
                <p className={styles.dropZoneTitle}>
                  <span className={styles.spinner} />
                  Adding your companion…
                </p>
                <p className={styles.dropZoneHint}>Validating and rigging the model — this only takes a moment.</p>
              </>
            ) : (
              <>
                <p className={styles.dropZoneTitle}>Drag and drop a companion file here</p>
                <p className={styles.dropZoneHint}>Supports GLB, GLTF, VRM, FBX, and OBJ</p>
                <button type="button" className={styles.chip} style={{ marginTop: 8 }} onClick={handleUpload}>
                  Or browse for a file
                </button>
              </>
            )}
          </div>

          {uploadError && (
            <p className={`${styles.cardBody} ${styles.fadeInUp}`} style={{ marginTop: 10, color: 'var(--danger, #e05a5a)' }}>
              {uploadError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
