import React from 'react';
import styles from './computeCost.module.css';
import {
  COMPUTE_COSTS,
  calculateComputeCost as sharedCalculateComputeCost,
  getCostDescription as sharedGetCostDescription,
  type ActionType,
} from '../../../shared/execution/ComputeCostConstants';

interface ComputeCostProps {
  actionType: ActionType;
  quantity?: number;
  onComputeUsed?: (amount: number) => void;
}

export function ComputeCost({ actionType, quantity = 1, onComputeUsed }: ComputeCostProps) {
  const config = COMPUTE_COSTS[actionType];
  const totalCost = config.baseAmount * quantity;

  React.useEffect(() => {
    onComputeUsed?.(totalCost);
  }, [totalCost, onComputeUsed]);

  return (
    <div className={styles.container}>
      <div className={styles.cost}>
        <span className={styles.amount}>{totalCost.toFixed(3)}</span>
        <span className={styles.label}>Paw Computes</span>
      </div>
      <div className={styles.details}>
        {quantity > 1 && (
          <span className={styles.quantity}>
            {quantity} × {config.baseAmount.toFixed(3)}
          </span>
        )}
        <span className={styles.description}>{config.description}</span>
      </div>
    </div>
  );
}

// Re-export shared utilities
export { calculateComputeCost, getCostDescription } from '../../../shared/execution/ComputeCostConstants';

// Utility for inline cost display
export function ComputeCostBadge({ actionType, quantity = 1 }: Omit<ComputeCostProps, 'onComputeUsed'>) {
  const config = COMPUTE_COSTS[actionType];
  const totalCost = config.baseAmount * quantity;

  return (
    <span className={styles.badge}>
      {totalCost.toFixed(3)} Ⓟ
    </span>
  );
}
