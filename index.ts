// API pública de events-suite — LA conexión es el Provider:
//   <EventsSuiteProvider reader?> en el árbol
//   useEventsSuite() → { pushBusinessEvent, startDelivery }
// Importar este módulo ya enciende la detección (presencia = medición).
// Todo lo demás es interno: las fases se hablan por sus entradas.

export { EventsSuiteProvider, useEventsSuite } from "./EventsSuiteProvider";
export type { EventsSuiteCtx } from "./EventsSuiteProvider";
export { BusinessEventNames } from "./types/events";
export type { BusinessEventPayload } from "./types/events";
export type { StartDeliveryConfig } from "./3-delivery/stageGateway";
// Conversiones directas de Meta (fuera del gateway): el motor pixel+CAPI vive
// en la suite desde que se retiró facebook-api-template.
export { pushEvent, FbEvent } from "./3-delivery/stageGateway";
