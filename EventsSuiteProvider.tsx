// LA única y exclusiva conexión de la app con la suite.
// Importar este módulo ya enciende la detección (efecto de módulo en init:
// presencia = medición, cero red). Montarlo habilita el USO: el reader
// opcional y el cliente contextual (useEventsSuite) con el contrato mínimo:
// pushBusinessEvent + startDelivery.

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import "./init"; // usar el contexto es sinónimo de iniciar la suite
import { gateway } from "./2-gateway";
import { IncomingEventReader } from "./IncomingEventReader";
import { startDelivery } from "./3-delivery/stageGateway";
import type { StartDeliveryConfig } from "./3-delivery/stageGateway";
import type { BusinessEventNames, BusinessEventPayload } from "./types";

export interface EventsSuiteCtx {
  /** Emite un evento de negocio al gateway (solo catálogo de negocio). */
  pushBusinessEvent: (name: BusinessEventNames, payload?: BusinessEventPayload) => void;
  /** Enciende los destinos (red): rudderstack / fb / metadata de Vercel. */
  startDelivery: (config: StartDeliveryConfig) => void;
}

// Cliente estable (la suite es singleton por sesión: el contexto es la puerta
// de acceso, no una fábrica de instancias).
const client: EventsSuiteCtx = {
  pushBusinessEvent: (name, payload) => gateway.emit(name, payload),
  startDelivery,
};

const Ctx = createContext<EventsSuiteCtx | null>(null);

export function EventsSuiteProvider({
  reader = false,
  children,
}: {
  /** Muestra el visor de debug (últimos 10 eventos del gateway). */
  reader?: boolean;
  children?: ReactNode;
}) {
  return (
    <Ctx.Provider value={client}>
      {children}
      {reader ? <IncomingEventReader /> : null}
    </Ctx.Provider>
  );
}

export function useEventsSuite(): EventsSuiteCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEventsSuite: falta <EventsSuiteProvider> en el árbol");
  return ctx;
}
