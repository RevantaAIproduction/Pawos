import type { Companion } from '../types/CompanionTypes';
import type { ActivitySnapshot } from '../activity/ActivityEngine';

export type CompanionRuntimeState = {
  state: 'active' | 'paused' | 'sleeping';
  startedAtMs: number;
  mood?: string;
  context?: string;
  lastActivity?: ActivitySnapshot;
};

export type CompanionRuntimeContext = {
  nowMs: number;
  companion: Companion;
};

// Priority values for resolving conflicts between explicit user actions
// and autonomous activity-driven suggestions.
export type CompanionActionPriority = 100 | 80 | 60 | 40 | 20;

export const enum CompanionActionPriorities {
  User = 100,
  System = 80,
  Activity = 60,
  Ambient = 40,
  Idle = 20,
}


