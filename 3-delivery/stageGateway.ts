// stageGateway de la etapa 3 «delivery» — único punto de entrada a la fase.
// Plano de EVENTOS: deliver() — la única función por la que entran envelopes
// (canal único con el gateway, ver channel.ts). Plano de CONTROL: arranques y
// setters públicos de la fase. Nada de afuera importa internos de delivery.

export { deliver } from "./channel";

export { sessionMetadata, collectHostingMetadata, setLoginMetadata, setFbMetadata } from "./adapters/metadata";

export { toRudderTrack } from "./adapters/rudderstack";
export type { RudderTrackCall } from "./adapters/rudderstack";
export { toFbPush } from "./adapters/fb";
export type { FbEventMapping, FbPushCall } from "./adapters/fb";

export { startRudderstackPusher } from "./pushers/rudderstack";
export { startFbPusher, pushEvent, setServerEndpoint, onFbEvent, FbEvent } from "./pushers/fb";
export { startActiveSessions, toGeo, toSessionNode } from "./pushers/activeSessions";
export type { ActiveSessionNode, SessionGeo } from "./pushers/activeSessions";

import { collectHostingMetadata } from "./adapters/metadata";
import { startRudderstackPusher } from "./pushers/rudderstack";
import { startFbPusher } from "./pushers/fb";
import { startActiveSessions } from "./pushers/activeSessions";

/** Config del arranque de delivery — el contrato público de la fase. */
export interface StartDeliveryConfig {
  /** Sin clave, el pusher de RudderStack no arranca. */
  rudderStackWriteKey?: string;
  fb?: boolean;
  vercelMetadataCollect?: boolean;
  /** Presencia en vivo en Firebase RTDB: un nodo por pestaña abierta bajo
   * `activeSessions`, que se borra solo al cerrarse (ver el pusher). Pasá el
   * `databaseURL` (es público, como el writeKey); con `true` se deduce del
   * projectId que sirva `/api/firebase-config`. */
  activeSessions?: boolean | string;
}

/** Enciende los destinos pedidos. Única forma de que la suite toque la red. */
export function startDelivery(config: StartDeliveryConfig): void {
  if (config.rudderStackWriteKey) startRudderstackPusher({ writeKey: config.rudderStackWriteKey });
  if (config.fb) startFbPusher();
  if (config.vercelMetadataCollect) collectHostingMetadata();
  if (config.activeSessions) {
    startActiveSessions(
      typeof config.activeSessions === "string" ? { databaseURL: config.activeSessions } : {},
    );
  }
}
