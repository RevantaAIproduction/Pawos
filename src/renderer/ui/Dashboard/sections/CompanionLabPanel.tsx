import React, { useRef, useState } from 'react';
import styles from '../dashboard.module.css';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import { aiRouter } from '../../../ai/AIRouter';
import {
  QUICK_CREATE_ANGLES,
  STUDIO_CREATE_REQUIRED_ANGLES,
  STUDIO_CREATE_OPTIONAL_ANGLES,
  type CompanionPhoto,
  type PhotoAngle,
} from '../../../companion/manager/CompanionProfileTypes';

const ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: 'Front',
  left45: 'Left 45°',
  right45: 'Right 45°',
  leftProfile: 'Left profile',
  rightProfile: 'Right profile',
  back: 'Back',
  fullBody: 'Full body (optional)',
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CompanionLabPanel({ onDone }: { onDone: () => void }) {
  const { createFromLab } = useCompanionProfiles();
  const [mode, setMode] = useState<'quick' | 'studio'>('quick');
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState<Partial<Record<PhotoAngle, CompanionPhoto>>>({});
  const [validating, setValidating] = useState<PhotoAngle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAngleRef = useRef<PhotoAngle | null>(null);

  const requiredAngles = mode === 'quick' ? QUICK_CREATE_ANGLES : STUDIO_CREATE_REQUIRED_ANGLES;
  const optionalAngles = mode === 'quick' ? [] : STUDIO_CREATE_OPTIONAL_ANGLES;
  const allAngles = [...requiredAngles, ...optionalAngles];

  const requiredComplete = requiredAngles.every((a) => photos[a]?.validation);
  const canCreate = requiredComplete && name.trim().length > 0;

  const handlePickFile = (angle: PhotoAngle) => {
    pendingAngleRef.current = angle;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (file: File) => {
    const angle = pendingAngleRef.current;
    if (!angle) return;

    const dataUrl = await readFileAsDataUrl(file);
    setPhotos((prev) => ({ ...prev, [angle]: { angle, dataUrl, capturedAt: Date.now() } }));
    setValidating(angle);

    const validation = await aiRouter.validateCompanionPhoto(dataUrl, ANGLE_LABELS[angle]);
    setPhotos((prev) => {
      const existing = prev[angle];
      if (!existing || existing.dataUrl !== dataUrl) return prev; // superseded by a newer capture
      return { ...prev, [angle]: { ...existing, validation } };
    });
    setValidating(null);
  };

  const handleCreate = () => {
    const capturedPhotos = allAngles.map((a) => photos[a]).filter((p): p is CompanionPhoto => Boolean(p));
    createFromLab({ name, mode, photos: capturedPhotos });
    onDone();
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFileChosen(file);
          e.target.value = '';
        }}
      />

      <p className={styles.cardBody} style={{ marginBottom: 16 }}>
        Photos are the input to a future avatar-generation pipeline — they'll become your
        companion's skin/mesh on the same skeleton, animation library, emotion engine, and voice
        Paw already uses. Generation itself isn't built yet; this captures and validates the
        photos so it's ready to run once it is.
      </p>

      <div className={styles.tabRow}>
        <button
          type="button"
          className={`${styles.tabButton} ${mode === 'quick' ? styles.tabButtonActive : ''}`}
          onClick={() => setMode('quick')}
        >
          Quick Create
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${mode === 'studio' ? styles.tabButtonActive : ''}`}
          onClick={() => setMode('studio')}
        >
          Studio Create
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Companion name"
          style={{
            width: '100%',
            maxWidth: 320,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.02)',
            color: '#f5f5f7',
            padding: '9px 12px',
            fontSize: 13,
          }}
        />
      </div>

      <div className={styles.grid}>
        {allAngles.map((angle) => {
          const photo = photos[angle];
          const isOptional = optionalAngles.includes(angle);
          return (
            <div key={angle} className={styles.card}>
              <h3 className={styles.cardTitle}>
                {ANGLE_LABELS[angle]}
                {isOptional && ' (optional)'}
              </h3>

              {photo ? (
                <>
                  <img
                    src={photo.dataUrl}
                    alt={ANGLE_LABELS[angle]}
                    style={{ width: '100%', borderRadius: 8, marginTop: 8, marginBottom: 8 }}
                  />
                  {validating === angle && <p className={styles.cardBody}>Validating…</p>}
                  {photo.validation && (
                    <p className={styles.cardBody} style={{ color: photo.validation.ok ? undefined : '#e0a35d' }}>
                      {photo.validation.ok ? 'Looks good.' : photo.validation.issues.join(' ')}
                    </p>
                  )}
                </>
              ) : (
                <p className={styles.cardBody}>No photo yet.</p>
              )}

              <button type="button" className={styles.chip} style={{ marginTop: 8 }} onClick={() => handlePickFile(angle)}>
                {photo ? 'Retake' : 'Upload photo'}
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.quickActions} style={{ marginTop: 20 }}>
        <button type="button" className={styles.primaryButton} disabled={!canCreate} onClick={handleCreate}>
          Create companion
        </button>
        <button type="button" className={styles.dangerButton} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
