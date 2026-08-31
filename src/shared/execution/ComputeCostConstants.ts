/**
 * Paw Computes pricing constants for all actions.
 * Used by both frontend (display) and backend (billing/validation).
 * Single source of truth for compute cost calculations.
 */

export type ActionType = 'edit' | 'command' | 'file-access' | 'analysis' | 'generation' | 'execution';

export interface ComputeCostConfig {
  type: ActionType;
  baseAmount: number;
  description: string;
  category: 'code' | 'file' | 'analysis' | 'execution';
}

/**
 * Compute costs per action (in Paw Computes)
 * These values are fixed and enforced server-side
 */
export const COMPUTE_COSTS: Record<ActionType, ComputeCostConfig> = {
  'edit': {
    type: 'edit',
    baseAmount: 0.5,
    description: 'per line edited',
    category: 'code',
  },
  'command': {
    type: 'command',
    baseAmount: 2,
    description: 'per command executed',
    category: 'execution',
  },
  'file-access': {
    type: 'file-access',
    baseAmount: 0.2,
    description: 'per file accessed',
    category: 'file',
  },
  'analysis': {
    type: 'analysis',
    baseAmount: 1.5,
    description: 'code analysis',
    category: 'analysis',
  },
  'generation': {
    type: 'generation',
    baseAmount: 2.5,
    description: 'code generation',
    category: 'code',
  },
  'execution': {
    type: 'execution',
    baseAmount: 2,
    description: 'command execution',
    category: 'execution',
  },
};

/**
 * Calculate total compute cost for an action
 * @param actionType - Type of action
 * @param quantity - Number of times the action is performed (e.g., lines edited)
 * @returns Total Paw Computes cost
 */
export function calculateComputeCost(
  actionType: ActionType,
  quantity: number = 1
): number {
  const config = COMPUTE_COSTS[actionType];
  if (!config) {
    throw new Error(`Unknown action type: ${actionType}`);
  }
  return config.baseAmount * quantity;
}

/**
 * Get cost description for display
 */
export function getCostDescription(actionType: ActionType): string {
  const config = COMPUTE_COSTS[actionType];
  return config?.description || '';
}

/**
 * Get base cost for an action type
 */
export function getBaseCost(actionType: ActionType): number {
  const config = COMPUTE_COSTS[actionType];
  return config?.baseAmount || 0;
}

/**
 * Validate if user has enough compute credits for an action
 * @param userBalance - Current Paw Computes balance
 * @param actionType - Type of action
 * @param quantity - Number of times the action will be performed
 * @returns true if user has sufficient balance
 */
export function hasEnoughComputeCredits(
  userBalance: number,
  actionType: ActionType,
  quantity: number = 1
): boolean {
  const cost = calculateComputeCost(actionType, quantity);
  return userBalance >= cost;
}

/**
 * Get all actions grouped by category
 */
export function getActionsByCategory(category: 'code' | 'file' | 'analysis' | 'execution'): ActionType[] {
  return (Object.keys(COMPUTE_COSTS) as ActionType[]).filter(
    (type) => COMPUTE_COSTS[type].category === category
  );
}

/**
 * Get total cost for multiple actions
 */
export function calculateTotalCost(
  actions: Array<{ type: ActionType; quantity: number }>
): number {
  return actions.reduce((total, action) => {
    return total + calculateComputeCost(action.type, action.quantity);
  }, 0);
}
