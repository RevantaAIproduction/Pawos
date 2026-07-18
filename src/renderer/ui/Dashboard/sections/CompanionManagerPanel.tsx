import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import type { CompanionProfile } from '../../../companion/manager/CompanionProfileTypes';

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
  const { profiles, activeId, setActive, duplicate, exportProfile, rename, toggleFavorite, remove } =
    useCompanionProfiles();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const sorted = [...profiles].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

  return (
    <div>
      <div className={styles.managerToolbar}>
        <button type="button" className={styles.primaryButton} onClick={onOpenLab}>
          Add your avatar
        </button>
      </div>
      <p className={styles.cardBody} style={{ marginTop: 8 }}>
        New companions are created in the Avatar Lab, from your own photos.
      </p>

      <div className={styles.grid} style={{ marginTop: 18 }}>
        {sorted.map((profile: CompanionProfile) => (
          <div
            key={profile.id}
            className={styles.card}
            style={{ borderColor: profile.id === activeId ? 'var(--accent, #8b7bff)' : undefined }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

            <p className={styles.cardBody}>
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
    </div>
  );
}
