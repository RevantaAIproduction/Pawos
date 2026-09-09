/**
 * Persistent execution strategy selection.
 *
 * Stores the user's chosen strategy for actionable requests:
 * - undefined: First-time user, hasn't selected a strategy yet
 * - handsOn: User chose "Work with me" - automatically uses acceptEdits
 * - autonomous: User chose "Do it autonomously" - automatically uses plan mode
 *
 * This is separate from the session's executionMode (which is manually controlled via the composer).
 * The strategy provides intelligent defaults for subsequent actionable requests.
 */

export type ExecutionStrategy = 'handsOn' | 'autonomous' | undefined;

const STORAGE_KEY = 'pawos:executionStrategy';

class ExecutionStrategyStore {
  private strategy: ExecutionStrategy = undefined;
  private listeners: Set<(strategy: ExecutionStrategy) => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'handsOn' || stored === 'autonomous') {
        this.strategy = stored;
      } else {
        this.strategy = undefined;
      }
    } catch {
      this.strategy = undefined;
    }
  }

  private saveToStorage(): void {
    try {
      if (this.strategy === undefined) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, this.strategy);
      }
    } catch {
      // Silently ignore localStorage errors (private window, quota exceeded, etc.)
    }
  }

  getStrategy(): ExecutionStrategy {
    return this.strategy;
  }

  setStrategy(strategy: ExecutionStrategy): void {
    if (this.strategy !== strategy) {
      this.strategy = strategy;
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  subscribe(listener: (strategy: ExecutionStrategy) => void): () => void {
    this.listeners.add(listener);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.strategy);
      } catch (error) {
        console.error('[ExecutionStrategyStore] Listener error:', error);
      }
    });
  }

  reset(): void {
    this.setStrategy(undefined);
  }
}

export const executionStrategyStore = new ExecutionStrategyStore();
