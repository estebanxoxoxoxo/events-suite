// Gateway: acá desemboca todo evento (FSMs y app). Los consumidores
// (ingesta, Meta, …) se enchufan con subscribe() — fuera del scope de la suite.

import { generalInfo } from "../1-detection/sources/generalInfo";
import { timeSession } from "../1-detection/sources/timeSession";
import { deliver } from "../3-delivery/stageGateway";
import type { EventEnvelope, KnownEventName, PayloadOf, Unsubscribe } from "../types";

const listeners = new Set<(event: EventEnvelope) => void>();
const buffer: EventEnvelope[] = [];

// Id único de la OCURRENCIA: dedup en bronze/plata y eventID de Meta (pixel +
// CAPI). Ojo, no confundir con el `messageId` que genera el SDK de RudderStack
// al despachar: ese es del mensaje y cambia si el evento esperó en cola; este
// es del momento en que pasó y es el que correlaciona los tres sistemas.
const newEventId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const gateway = {
  /** Estricto: solo nombres del catálogo (comportamiento + negocio), con el payload exacto de cada uno. */
  emit<N extends KnownEventName>(name: N, properties?: PayloadOf<N>) {
    const event: EventEnvelope = {
      name,
      properties: properties as EventEnvelope["properties"],
      context: { ...generalInfo.get(), engaged_time_sec: timeSession.getSeconds() },
      event_id: newEventId(),
      timestamp: new Date().toISOString(),
    };
    buffer.push(event);
    listeners.forEach(listener => listener(event));
    deliver(event); // una sola vía: el gateway EMPUJA a delivery (su stageGateway)
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
