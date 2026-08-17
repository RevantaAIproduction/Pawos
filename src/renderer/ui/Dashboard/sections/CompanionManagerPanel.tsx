import React, { useEffect, useRef, useState } from 'react';
import styles from '../dashboard.module.css';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import type { CompanionProfile } from '../../../companion/manager/CompanionProfileTypes';
import { CompanionEditorPanel } from './CompanionEditorPanel';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getCompanionModelStatus, COMPANION_STATUS_COLORS } from '../../../companion/manager/companionStatus';
import { MoreIcon, TrashIcon } from '../NavIcons';

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CompanionManagerPanel({
  onOpenLab,
  runtimeConnected,
}: {
  onOpenLab: () => void;
  /** Whether the desktop companion runtime is actually enabled and finished loading right now — real state, not a fabricated network status. See CompanionEditorPanel's "Connect to PawOS" section. */
  runtimeConnected: boolean;
}) {
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRootRef.current && !menuRootRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openMenuId]);

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

      <div className={styles.grid} style={{ marginTop: 18 }} ref={menuRootRef}>
        {sorted.map((profile: CompanionProfile) => {
          const isActive = profile.id === activeId;
          const modelStatus = profile.avatarSource ? getCompanionModelStatus(profile) : null;
          return (
            <div
              key={profile.id}
              className={`${styles.card} ${styles.fadeInUp}`}
              style={{ borderColor: isActive ? 'var(--accent, #8b7bff)' : undefined, position: 'relative' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {profile.avatarImage ? (
                  <img
                    src={profile.avatarImage}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: 'linear-gradient(135deg, rgba(139,123,255,0.25), rgba(77,208,255,0.25))',
                    }}
                  />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
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
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <h3 className={styles.cardTitle} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {profile.name}
                      {profile.isDefault && ' (Default)'}
                    </h3>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        padding: '2px 7px',
                        borderRadius: 6,
                        color: isActive ? '#4ade80' : 'var(--text-secondary, #9a97b5)',
                        border: `1px solid ${isActive ? '#4ade80' : 'var(--text-secondary, #9a97b5)'}`,
                      }}
                    >
                      {isActive ? 'ACTIVE' : 'AVAILABLE'}
                    </span>
                    {modelStatus && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          padding: '2px 7px',
                          borderRadius: 6,
                          color: COMPANION_STATUS_COLORS[modelStatus.tone],
                          border: `1px solid ${COMPANION_STATUS_COLORS[modelStatus.tone]}`,
                        }}
                        title={modelStatus.detail}
                      >
                        {modelStatus.label}
                      </span>
                    )}
                    {profile.behavior.wakeWord && (
                      <span className={styles.cardBody} style={{ fontSize: 11, opacity: 0.75 }}>
                        "{profile.behavior.wakeWord}"
                      </span>
                    )}
                  </div>
                </div>

                {!profile.isDefault && (
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => {
                      if (window.confirm(`Delete ${profile.name}? This cannot be undone.`)) remove(profile.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 6,
                      borderRadius: 6,
                      color: 'var(--text-secondary, #9a97b5)',
                      flexShrink: 0,
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}

                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    type="button"
                    title="More"
                    onClick={() => setOpenMenuId(openMenuId === profile.id ? null : profile.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 6,
                      borderRadius: 6,
                      color: 'var(--text-secondary, #9a97b5)',
                    }}
                  >
                    <MoreIcon />
                  </button>
                  {openMenuId === profile.id && (
                    <div
                      role="menu"
                      className={styles.fadeInUp}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 4,
                        minWidth: 190,
                        background: 'var(--surface-2, #1c1a26)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 10,
                        padding: 6,
                        zIndex: 20,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                      }}
                    >
                      {!isActive && (
                        <button
                          type="button"
                          role="menuitem"
                          className={styles.profileMenuItem}
                          onClick={() => {
                            setActive(profile.id);
                            setOpenMenuId(null);
                          }}
                        >
                          Set active
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        onClick={() => {
                          setEditingId(editingId === profile.id ? null : profile.id);
                          setOpenMenuId(null);
                        }}
                      >
                        {editingId === profile.id ? 'Editing…' : 'Edit (voice, behavior, wake word…)'}
                      </button>
                      <button type="button" role="menuitem" className={styles.profileMenuItem} onClick={() => toggleFavorite(profile.id)}>
                        {profile.favorite ? 'Unfavorite' : 'Favorite'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        onClick={() => {
                          setRenamingId(profile.id);
                          setDraftName(profile.name);
                          setOpenMenuId(null);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        onClick={() => {
                          duplicate(profile.id);
                          setOpenMenuId(null);
                        }}
                      >
                        Duplicate
                      </button>
                      <div className={styles.profileMenuDivider} />
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        onClick={() => {
                          const json = exportProfile(profile.id);
                          if (json) download(`${profile.name.replace(/\s+/g, '-').toLowerCase()}.json`, json);
                          setOpenMenuId(null);
                        }}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.profileMenuItem}
                        disabled={exportingId === profile.id}
                        onClick={async () => {
                          setPackageError(null);
                          setPackageMessage(null);
                          const input = buildPackageInput(profile.id);
                          if (!input) return;
                          setExportingId(profile.id);
                          setOpenMenuId(null);
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
                        {exportingId === profile.id ? 'Exporting…' : 'Export Package (.paw)'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingId && (
        <CompanionEditorPanel
          profileId={editingId}
          onClose={() => setEditingId(null)}
          runtimeConnected={editingId === activeId && runtimeConnected}
        />
      )}
    </div>
  );
}
