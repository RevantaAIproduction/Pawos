import React, { useRef } from 'react';
import styles from '../dashboard.module.css';
import { useSkins } from '../../../companion/skin/useSkins';

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SkinManagerPanel() {
  const { skins, activeId, setActive, exportSkin, importSkin, remove } = useSkins();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className={styles.cardBody} style={{ marginBottom: 16 }}>
        A skin is just data plus an asset reference — switching or adding one never changes engine code.
        Future user-uploaded avatars plug in here the same way.
      </p>

      <div className={styles.managerToolbar}>
        <button type="button" className={styles.dangerButton} onClick={() => fileInputRef.current?.click()}>
          Import skin
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === 'string') importSkin(reader.result);
              };
              reader.readAsText(file);
            }
            e.target.value = '';
          }}
        />
      </div>

      <div className={styles.grid} style={{ marginTop: 18 }}>
        {skins.map((skin) => (
          <div
            key={skin.id}
            className={styles.card}
            style={{ borderColor: skin.id === activeId ? 'var(--accent, #8b7bff)' : undefined }}
          >
            <h3 className={styles.cardTitle}>
              {skin.name}
              {skin.isBuiltIn && ' (Built-in)'}
            </h3>
            <p className={styles.cardBody}>
              Pet: {skin.petId} · Glow {skin.glow.enabled ? 'on' : 'off'} · {skin.accessories.length} accessories
            </p>
            <div className={styles.quickActions}>
              <button type="button" className={styles.chip} onClick={() => setActive(skin.id)}>
                {skin.id === activeId ? 'Active' : 'Use this skin'}
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() => {
                  const json = exportSkin(skin.id);
                  if (json) download(`${skin.name.replace(/\s+/g, '-').toLowerCase()}.json`, json);
                }}
              >
                Export
              </button>
              {!skin.isBuiltIn && (
                <button type="button" className={styles.chip} onClick={() => remove(skin.id)}>
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
