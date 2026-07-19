import React from 'react';
import styles from '../dashboard.module.css';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import type { CompanionProfile } from '../../../companion/manager/CompanionProfileTypes';
import { companionGallerySourceRegistry } from '../../../companion/gallery/CompanionGallerySourceRegistry';
import type { CompanionGallerySource } from '../../../companion/gallery/CompanionGalleryTypes';

const RECENT_COUNT = 4;

function CompanionRow({ profiles, activeId, setActive }: { profiles: CompanionProfile[]; activeId: string; setActive: (id: string) => void }) {
  if (profiles.length === 0) {
    return <p className={styles.cardBody}>Nothing here yet.</p>;
  }
  return (
    <div className={styles.grid}>
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className={`${styles.card} ${styles.fadeInUp}`}
          style={{ borderColor: profile.id === activeId ? 'var(--accent, #8b7bff)' : undefined }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {profile.avatarImage ? (
              <img
                src={profile.avatarImage}
                alt=""
                style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(139,123,255,0.25), rgba(77,208,255,0.25))',
                }}
              />
            )}
            <h3 className={styles.cardTitle} style={{ margin: 0 }}>
              {profile.name}
            </h3>
          </div>
          <p className={styles.cardBody}>Skin: {profile.skinId}</p>
          <div className={styles.quickActions}>
            <button type="button" className={styles.chip} onClick={() => setActive(profile.id)}>
              {profile.id === activeId ? 'Active' : 'Set active'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GallerySourceSection({ title, sources }: { title: string; sources: CompanionGallerySource[] }) {
  // Nothing renders — no heading, no placeholder — until a real source is
  // registered. The CompanionGallerySourceRegistry extension point still
  // exists in code (see CompanionGallerySourceRegistry.ts) so a future
  // Community Gallery/Marketplace source can plug in without a UI change,
  // but this UI never shows a "coming soon" card for it.
  if (sources.length === 0) return null;
  return (
    <section style={{ marginTop: 28 }}>
      <h3 className={styles.subheading}>{title}</h3>
      <p className={styles.cardBody}>{sources.length} source(s) connected.</p>
    </section>
  );
}

/**
 * Companion Gallery — sorts existing profiles into the regions from the
 * Runtime 10 spec (Official / User Library / Recent / Imported), all real
 * data derived from CompanionProfileStore's `origin` field. Community
 * Gallery and Marketplace sections only appear once a real
 * CompanionGallerySource is registered — no cloud/marketplace backend is
 * implemented yet, so nothing renders for them today.
 */
export function CompanionGalleryPanel() {
  const { profiles, activeId, setActive } = useCompanionProfiles();

  const official = profiles.filter((p) => p.origin === 'official');
  const userLibrary = profiles.filter((p) => p.origin !== 'official');
  const recent = [...profiles]
    .filter((p) => p.relationship.lastInteractionAt !== null)
    .sort((a, b) => (b.relationship.lastInteractionAt ?? 0) - (a.relationship.lastInteractionAt ?? 0))
    .slice(0, RECENT_COUNT);
  const imported = profiles.filter((p) => p.origin === 'imported');

  const communitySources = companionGallerySourceRegistry.list().filter((s) => s.id.startsWith('community-'));
  const marketplaceSources = companionGallerySourceRegistry.list().filter((s) => s.id.startsWith('marketplace-'));

  return (
    <div>
      <section>
        <h3 className={styles.subheading}>Official Paw Gallery</h3>
        <CompanionRow profiles={official} activeId={activeId} setActive={setActive} />
      </section>

      <section style={{ marginTop: 28 }}>
        <h3 className={styles.subheading}>Recent Companions</h3>
        {recent.length === 0 ? (
          <p className={styles.cardBody}>No companion interactions yet.</p>
        ) : (
          <CompanionRow profiles={recent} activeId={activeId} setActive={setActive} />
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h3 className={styles.subheading}>User Library</h3>
        <CompanionRow profiles={userLibrary} activeId={activeId} setActive={setActive} />
      </section>

      <section style={{ marginTop: 28 }}>
        <h3 className={styles.subheading}>Imported Companions</h3>
        {imported.length === 0 ? (
          <p className={styles.cardBody}>None imported yet — use "Import Companion Package (.paw)" in My Companions.</p>
        ) : (
          <CompanionRow profiles={imported} activeId={activeId} setActive={setActive} />
        )}
      </section>

      <GallerySourceSection title="Community Gallery" sources={communitySources} />
      <GallerySourceSection title="Marketplace" sources={marketplaceSources} />
    </div>
  );
}
