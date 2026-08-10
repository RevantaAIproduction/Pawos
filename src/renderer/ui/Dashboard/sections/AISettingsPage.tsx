import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { aiProviderConfigStore } from '../../../ai/AIProviderConfigStore';
import { PAW_MODEL_CATALOG, REASONING_PAW_MODEL_IDS, type PawModelId } from '../../../../shared/ai/PawModelTypes';
import type { EntitlementSnapshot } from '../../../../shared/billing/BillingTypes';

/**
 * Real AI settings, not a placeholder: which reasoning model PawOS uses by
 * default (gated by what your plan actually entitles you to — via
 * EntitlementService, the same source of truth Billing reads), and the full
 * Paw model catalog with genuine availability per model. No per-provider API
 * key or memory-clearing controls here — those don't exist as real, wired
 * features yet, so they aren't shown as if they did.
 */
export function AISettingsPage({ onUpgrade }: { onUpgrade: () => void }) {
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [activeModel, setActiveModelState] = useState<PawModelId>(aiProviderConfigStore.getActivePawModel());

  useEffect(() => {
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
    const unsubscribe = aiProviderConfigStore.subscribe(() =>
      setActiveModelState(aiProviderConfigStore.getActivePawModel())
    );
    return () => {
      unsubscribe();
    };
  }, []);

  const reasoningModels = PAW_MODEL_CATALOG.filter((m) => REASONING_PAW_MODEL_IDS.includes(m.id));
  const otherModels = PAW_MODEL_CATALOG.filter((m) => !REASONING_PAW_MODEL_IDS.includes(m.id));

  const isUnlocked = (id: PawModelId) => entitlement?.models.includes(id) ?? false;

  const chooseModel = (id: PawModelId) => {
    if (!isUnlocked(id)) return;
    aiProviderConfigStore.setActivePawModel(id);
  };

  if (entitlement && entitlement.models.length === 0) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>No AI models available on your current plan</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Your plan doesn't currently unlock any Paw AI models. Go includes real AI (Paw Flash) for
          planning, analysis, and investigation — upgrade to Pro to unlock the full model roster
          and execution (generating/modifying code, running commands, deploying, voice conversations).
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 12 }} onClick={onUpgrade}>
          Upgrade plan
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Default reasoning model</h3>
        <p className={styles.cardBody} style={{ marginBottom: 10 }}>
          Which Paw model handles your conversations by default. You can also switch mid-conversation
          by asking Paw directly.
        </p>
        <div className={styles.quickActions}>
          {reasoningModels.map((m) => {
            const unlocked = isUnlocked(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`${styles.chip} ${activeModel === m.id ? styles.chipActive : ''}`}
                style={{ opacity: unlocked ? 1 : 0.45 }}
                disabled={!unlocked}
                title={m.description}
                onClick={() => chooseModel(m.id)}
              >
                {m.label}
                {!unlocked ? ' (upgrade)' : ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>All Paw models</h3>
        <p className={styles.cardBody} style={{ marginBottom: 10 }}>
          Beyond reasoning, Paw routes to specialized models automatically as your conversation needs them.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {otherModels.map((m) => {
            const unlocked = isUnlocked(m.id);
            const comingSoon = m.status === 'comingSoon';
            return (
              <div key={m.id} className={styles.settingsToggleRow}>
                <div>
                  <div>{m.label}</div>
                  <div className={styles.cardBody} style={{ marginTop: 2 }}>{m.description}</div>
                </div>
                <span className={styles.chip} style={{ opacity: unlocked && !comingSoon ? 1 : 0.45 }}>
                  {comingSoon ? 'Coming soon' : unlocked ? 'Available' : 'Locked'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
