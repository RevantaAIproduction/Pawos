import type { LivingAction } from './LivingDesktopEngine';

// Maps living actions to behavior/action IDs in CompanionOS packs.
// Core must remain data-driven; this file provides only a mapping helper.

export type LivingActionMapping = {
  actionIdByLivingAction: Partial<Record<LivingAction, string>>;
};

export function mapLivingActionToActionId(mapping: LivingActionMapping, action: LivingAction): string | undefined {
  return mapping.actionIdByLivingAction[action];
}

