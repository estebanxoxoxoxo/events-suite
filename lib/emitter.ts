// Pub/sub mínimo compartido por sources y gateway.

import type { Source, Unsubscribe } from "../types";

export interface Emitter<T> extends Source<T> {
  emit(value: T): void;
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    subscribe(listener: (value: T) => void): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(value: T) {
      listeners.forEach(listener => listener(value));
    },
  };
}
