export class EventEmitter<T> {
  private listeners = new Set<(v: T) => void>();

  on(cb: (v: T) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(value: T) {
    for (const cb of this.listeners) cb(value);
  }
}

