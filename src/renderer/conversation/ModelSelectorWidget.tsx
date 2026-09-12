import React, { useState } from 'react';
import styles from './modelSelectorWidget.module.css';
import type { PawModelId, PawModelDescriptor } from '../../shared/ai/PawModelTypes';
import { PAW_MODEL_CATALOG, REASONING_PAW_MODEL_IDS } from '../../shared/ai/PawModelTypes';
import type { EntitlementSnapshot, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { canUsePawFlash, getAvailableModelsForTier } from '../../ai/ModelSelectionByTier';

interface ModelSelectorWidgetProps {
  activePawModel?: PawModelId;
  onSelectModel?: (modelId: PawModelId) => void;
  entitlement?: EntitlementSnapshot | null;
  streamingElapsedSeconds?: number;
  tier?: SubscriptionTierId;
}

const MODEL_DISPLAY_NAMES: Record<PawModelId, string> = {
  'paw-flash': 'Paw Flash',
  'paw-swift': 'Paw Swift',
  'paw-core': 'Paw Core',
  'paw-fable': 'Paw Fable',
};

export function ModelSelectorWidget({
  activePawModel,
  onSelectModel,
  entitlement,
  streamingElapsedSeconds = 0,
  tier = 'go',
}: ModelSelectorWidgetProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = activePawModel ? MODEL_DISPLAY_NAMES[activePawModel] || 'Paw Core' : 'Paw Core';

  // Check if Paw Flash is available in current tier/credit context
  const hasUsageCredits = (entitlement?.usageCreditsRemaining ?? 0) > 0;
  const pawFlashAvailable = canUsePawFlash(tier, hasUsageCredits);
  const availableModels = getAvailableModelsForTier(tier, hasUsageCredits);

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
            .map((modelId) => {
              const isDisabled = modelId === 'paw-fable' && !pawFlashAvailable;
              const disabledReason = isDisabled ? 'Paw Flash only available with usage credits' : '';

              return (
                <button
                  key={modelId}
                  className={`${styles.menuItem} ${activePawModel === modelId ? styles.active : ''} ${isDisabled ? styles.disabled : ''}`}
                  onClick={() => {
                    if (!isDisabled) {
                      onSelectModel?.(modelId);
                      setMenuOpen(false);
                    }
                  }}
                  disabled={isDisabled}
                  title={disabledReason || `Select ${MODEL_DISPLAY_NAMES[modelId] || modelId}`}
                >
                  {MODEL_DISPLAY_NAMES[modelId] || modelId}
                  {isDisabled && ' (usage credits only)'}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
