import { AsyncLocalStorage } from 'async_hooks';
import { accountSession } from '../auth/AccountSession';

/**
 * Connector state belongs to the account it was obtained for — enforced with the account epoch
 * (`accountSession.accountEpoch`, which increases whenever the verified account changes).
 *
 * Every connector operation (connect, restore/authenticate, refresh, a provider call…) runs under
 * the epoch it started in; a call a connector makes to itself keeps that epoch, however long it
 * awaits. When such an operation finishes after the account changed, it is STALE: it may not
 * publish a credential (refused with StaleAccountOperationError, which aborts it before it registers
 * anything) and its other writes — status, clearing state in its own error handling — are ignored,
 * so it can neither leak the old account's token into the new session nor disturb the new
 * account's own connection of the same integration — and its reads find nothing, so it can't hand
 * the new account's token to whoever started it. Reads of account-bound state find nothing once
 * the account has changed, even before the connector's local forget has run.
 */

const operation = new AsyncLocalStorage<number>();

export class StaleAccountOperationError extends Error {
  constructor(what: string, outcome: 'discarded' | 'stopped' = 'discarded') {
    super(
      outcome === 'discarded'
        ? `Discarded ${what}: the signed-in account changed while it was being obtained.`
        : `Stopped ${what}: the signed-in account changed while it was running.`
    );
    this.name = 'StaleAccountOperationError';
  }
}

/** Whether the running connector operation started under an account that is no longer signed in. */
export function isStaleAccountOperation(): boolean {
  const started = operation.getStore();
  return started !== undefined && started !== accountSession.accountEpoch;
}

/**
 * Stops the running operation if it started under an account that is no longer signed in. Called
 * after an await, before a step that would change state the new session now owns — a disconnect
 * clearing a connector, a connection record being written — so that step never runs for it.
 */
export function assertCurrentAccountOperation(what: string): void {
  if (isStaleAccountOperation()) throw new StaleAccountOperationError(what, 'stopped');
}

/** Runs `fn` as a connector operation of the current account (an operation already running keeps its own epoch). */
export function runInAccountEpoch<T>(fn: () => T): T {
  if (operation.getStore() !== undefined) return fn();
  return operation.run(accountSession.accountEpoch, fn);
}

/**
 * Makes every method of a connector run as an operation of the account signed in when it was
 * called. `forgetLocalSession` is left as is: forgetting is never an operation of an old account.
 */
export function bindToAccountEpoch(target: object): true {
  const done = new Set<string>(['constructor', 'forgetLocalSession']);
  for (let proto = Object.getPrototypeOf(target); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (done.has(name)) continue;
      done.add(name);
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      const original = descriptor.value as (...args: unknown[]) => unknown;
      Object.defineProperty(target, name, {
        value: function accountBound(this: unknown, ...args: unknown[]) {
          return runInAccountEpoch(() => original.apply(this, args));
        },
        writable: true,
        configurable: true,
      });
    }
  }
  return true;
}

/**
 * A value a connector holds for the signed-in account (its credential, status, scope). Reads return
 * `empty` once the account has changed. A stale operation's write is refused (`'refuse'`: throws
 * when publishing a value, ignored when clearing) or ignored (`'ignore'`).
 */
export class AccountBound<T> {
  private value: T;
  private epoch: number;

  constructor(
    private readonly empty: T,
    private readonly onStaleWrite: 'refuse' | 'ignore',
    private readonly what: string
  ) {
    this.value = empty;
    this.epoch = accountSession.accountEpoch;
  }

  get(): T {
    // A stale operation sees nothing — not even the new account's value it might otherwise hand on.
    if (isStaleAccountOperation()) return this.empty;
    return this.epoch === accountSession.accountEpoch ? this.value : this.empty;
  }

  set(value: T): void {
    if (isStaleAccountOperation()) {
      if (this.onStaleWrite === 'refuse' && value !== undefined && value !== this.empty) throw new StaleAccountOperationError(this.what);
      return;
    }
    this.value = value;
    this.epoch = accountSession.accountEpoch;
  }
}
