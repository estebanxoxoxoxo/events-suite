// Gateway: acá desemboca todo evento (FSMs y app). Los consumidores
// (ingesta, Meta, …) se enchufan con subscribe() — fuera del scope de la suite.

import { generalInfo } from "../sources/generalInfo";
import { timeSession } from "../sources/timeSession";
import type { EventEnvelope, KnownEventName, PayloadOf, Unsubscribe } from "../types";

const listeners = new Set<(event: EventEnvelope) => void>();
const buffer: EventEnvelope[] = [];

export const gateway = {
  /** Estricto: solo nombres del catálogo (comportamiento + negocio), con el payload exacto de cada uno. */
  emit<N extends KnownEventName>(name: N, properties?: PayloadOf<N>) {
    const event: EventEnvelope = {
      name,
      properties: properties as EventEnvelope["properties"],
      context: { ...generalInfo.get(), session_time_sec: timeSession.getSeconds() },
      timestamp: new Date().toISOString(),
    };
    buffer.push(event);
    listeners.forEach(listener => listener(event));
  },

  /** `replay` (default true) reenvía lo bufferizado para no perder eventos tempranos. */
  subscribe(listener: (event: EventEnvelope) => void, { replay = true } = {}): Unsubscribe {
    if (replay) buffer.forEach(listener);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Historial de la sesión, solo lectura (debug). */
  history: (): readonly EventEnvelope[] => buffer,
};
