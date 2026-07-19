import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import type { CompanionProfile } from '../../../companion/manager/CompanionProfileTypes';
import { CompanionEditorPanel } from './CompanionEditorPanel';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CompanionManagerPanel({ onOpenLab }: { onOpenLab: () => void }) {
  const { profiles, activeId, setActive, duplicate, exportProfile, rename, toggleFavorite, remove, buildPackageInput, createFromImportedPackage } =
    useCompanionProfiles();
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageMessage, setPackageMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleImportPackage = async () => {
    setPackageError(null);
    setPackageMessage(null);
    setImporting(true);
    try {
      const pkg = await ipc.companionImportPackage();
      if (pkg) {
        const profile = createFromImportedPackage(pkg);
        setPackageMessage(`Imported "${profile.name}" — find it below.`);
      }
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : 'Failed to import that companion package.');
    } finally {
      setImporting(false);
    }
  };

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = [...profiles].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

  return (
    <div>
      <div className={styles.managerToolbar}>
        <button type="button" className={styles.primaryButton} onClick={onOpenLab}>
          Upload Companion
        </button>
        <button type="button" className={styles.chip} onClick={handleImportPackage} disabled={importing}>
          {importing ? (
            <>
              <span className={styles.spinner} />
              Importing…
            </>
          ) : (
            'Import Companion Package (.paw)'
          )}
        </button>
      </div>
      <p className={styles.cardBody} style={{ marginTop: 8 }}>
        New companions are added by uploading a GLB, GLTF, VRM, FBX, or OBJ file in the Upload Companion tab. Import
        a shared .paw package to add someone else's companion — restoring a backup uses the same import.
      </p>
      {packageError && (
        <p className={`${styles.cardBody} ${styles.fadeInUp}`} style={{ color: 'var(--danger, #e05a5a)' }}>
          {packageError}
        </p>
      )}
      {packageMessage && (
        <p className={`${styles.cardBody} ${styles.fadeInUp}`} style={{ color: '#4ade80' }}>
          {packageMessage}
        </p>
      )}

      <div className={styles.grid} style={{ marginTop: 18 }}>
        {sorted.map((profile: CompanionProfile) => (
          <div
            key={profile.id}
            className={`${styles.card} ${styles.fadeInUp}`}
            style={{ borderColor: profile.id === activeId ? 'var(--accent, #8b7bff)' : undefined }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {profile.avatarImage ? (
                <img
                  src={profile.avatarImage}
                  alt=""
                  style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(139,123,255,0.25), rgba(77,208,255,0.25))',
                  }}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, minWidth: 0 }}>
              {renamingId === profile.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => {
                    rename(profile.id, draftName);
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      rename(profile.id, draftName);
                      setRenamingId(null);
                    }
                  }}
                  className={styles.chip}
                />
              ) : (
                <h3 className={styles.cardTitle}>
                  {profile.name}
                  {profile.isDefault && ' (Default)'}
                </h3>
              )}
              <button
                type="button"
                onClick={() => toggleFavorite(profile.id)}
                title={profile.favorite ? 'Unfavorite' : 'Favorite'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
              >
                {profile.favorite ? '★' : '☆'}
              </button>
              </div>
            </div>

            <p className={styles.cardBody} style={{ marginTop: 10 }}>
              Skin: {profile.skinId} · {profile.personality.traits.join(', ') || 'no traits set'}
            </p>
            <p className={styles.cardBody}>
              {profile.relationship.interactionCount} interaction{profile.relationship.interactionCount === 1 ? '' : 's'}
            </p>

            <div className={styles.quickActions}>
              <button type="button" className={styles.chip} onClick={() => setActive(profile.id)}>
                {profile.id === activeId ? 'Active' : 'Set active'}
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() => {
                  setRenamingId(profile.id);
                  setDraftName(profile.name);
                }}
              >
                Rename
              </button>
              <button type="button" className={styles.chip} onClick={() => duplicate(profile.id)}>
                Duplicate
              </button>
              <button type="button" className={styles.chip} onClick={() => setEditingId(editingId === profile.id ? null : profile.id)}>
                {editingId === profile.id ? 'Editing…' : 'Edit'}
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() => {
                  const json = exportProfile(profile.id);
                  if (json) download(`${profile.name.replace(/\s+/g, '-').toLowerCase()}.json`, json);
                }}
              >
                Export
              </button>
              <button
                type="button"
                className={styles.chip}
                disabled={exportingId === profile.id}
                onClick={async () => {
                  setPackageError(null);
                  setPackageMessage(null);
                  const input = buildPackageInput(profile.id);
                  if (!input) return;
                  setExportingId(profile.id);
                  try {
                    const path = await ipc.companionExportPackage(input, profile.name.replace(/\s+/g, '-').toLowerCase());
                    if (path) setPackageMessage(`Exported "${profile.name}".`);
                  } catch (error) {
                    setPackageError(error instanceof Error ? error.message : 'Failed to export this companion package.');
                  } finally {
                    setExportingId(null);
                  }
                }}
              >
                {exportingId === profile.id ? (
                  <>
                    <span className={styles.spinner} />
                    Exporting…
                  </>
                ) : (
                  'Export Package (.paw)'
                )}
              </button>
              {!profile.isDefault && (
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => {
                    if (window.confirm(`Delete ${profile.name}? This cannot be undone.`)) remove(profile.id);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editingId && <CompanionEditorPanel profileId={editingId} onClose={() => setEditingId(null)} />}
    </div>
  );
}
