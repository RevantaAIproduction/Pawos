import React, { useState } from 'react';
import styles from './modelSelectorWidget.module.css';
import type { PawModelId, PawModelDescriptor } from '../../shared/ai/PawModelTypes';
import { PAW_MODEL_CATALOG, REASONING_PAW_MODEL_IDS } from '../../shared/ai/PawModelTypes';
import type { EntitlementSnapshot } from '../../shared/billing/BillingTypes';

interface ModelSelectorWidgetProps {
  activePawModel?: PawModelId;
  onSelectModel?: (modelId: PawModelId) => void;
  entitlement?: EntitlementSnapshot | null;
  streamingElapsedSeconds?: number;
}

const MODEL_DISPLAY_NAMES: Record<PawModelId, string> = {
  'haiku-paw': 'Paw Flash',
  'sonnet-paw': 'Paw Swift',
  'opus-paw': 'Paw Core',
  'o1-reasoning-paw': 'Paw O1',
};

export function ModelSelectorWidget({
  activePawModel,
  onSelectModel,
  entitlement,
  streamingElapsedSeconds = 0,
}: ModelSelectorWidgetProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = activePawModel ? MODEL_DISPLAY_NAMES[activePawModel] || 'Paw Core' : 'Paw Core';

  // Calculate usage indicator
  const usagePercent = entitlement?.hasCreditsRemaining
    ? Math.min(100, Math.max(0, (entitlement.creditsUsedThisMonth / (entitlement.creditsUsedThisMonth + entitlement.creditsRemaining)) * 100))
    : 0;

  return (
    <div className={styles.container} data-interactive="true">
      <button
        className={styles.modelButton}
        onClick={() => setMenuOpen(!menuOpen)}
        title="Select model"
      >
        <span className={styles.modelName}>{displayName}</span>
        <span className={styles.chevron}>▾</span>
      </button>
      <div className={styles.usage}>
        <div className={styles.usageBar} style={{ width: `${usagePercent}%` }} />
        <span className={styles.usageText}>{streamingElapsedSeconds}s</span>
      </div>
      {menuOpen && (
        <div className={styles.menu}>
          {[...new Set(REASONING_PAW_MODEL_IDS), ...PAW_MODEL_CATALOG.map((m) => m.id)]
            .slice(0, 4)
            .map((modelId) => (
              <button
                key={modelId}
                className={`${styles.menuItem} ${activePawModel === modelId ? styles.active : ''}`}
                onClick={() => {
                  onSelectModel?.(modelId);
                  setMenuOpen(false);
                }}
              >
                {MODEL_DISPLAY_NAMES[modelId] || modelId}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
