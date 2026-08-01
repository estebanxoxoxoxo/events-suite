// Canal de entrada de delivery — UNA SOLA VÍA: el gateway EMPUJA acá.
// Delivery no conoce ni consulta al gateway (cero imports de 2-gateway en
// toda la fase): deliver() recibe, guarda su propio historial (backfill para
// pushers que arrancan tarde) y reparte a los dispatchers registrados.

import type { EventEnvelope, Unsubscribe } from "../types";

type Dispatcher = (envelope: EventEnvelope) => void;

const dispatchers = new Set<Dispatcher>();
const received: EventEnvelope[] = []; // llega únicamente por el push del gateway

/** LA función de entrada a la fase: el gateway la llama por cada evento. */
export function deliver(envelope: EventEnvelope): void {
  received.push(envelope);
  dispatchers.forEach(dispatch => {
    try {
      dispatch(envelope);
    } catch {
      /* un pusher roto no frena a los demás */
    }
  });
}

/** Registro interno de pushers: repone el historial recibido (backfill) y
 * suma el dispatcher al reparto. */
export function registerDispatcher(dispatch: Dispatcher): Unsubscribe {
  received.forEach(envelope => {
    try {
      dispatch(envelope);
    } catch {
      /* noop */
    }
  });
  dispatchers.add(dispatch);
  return () => {
    dispatchers.delete(dispatch);
  };
}
