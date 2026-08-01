// stageGateway de la etapa 3 «delivery» — único punto de entrada a la fase.
// Plano de EVENTOS: deliver() — la única función por la que entran envelopes
// (canal único con el gateway, ver channel.ts). Plano de CONTROL: arranques y
// setters públicos de la fase. Nada de afuera importa internos de delivery.

export { deliver } from "./channel";

export { sessionMetadata, collectVercelMetadata, setLoginMetadata, setFbMetadata } from "./adapters/metadata";

export { toRudderTrack } from "./adapters/rudderstack";
export type { RudderTrackCall } from "./adapters/rudderstack";
export { toFbPush } from "./adapters/fb";
export type { FbEventMapping, FbPushCall } from "./adapters/fb";

export { startRudderstackPusher } from "./pushers/rudderstack";
export { startFbPusher, setServerEndpoint, onFbEvent, FbEvent } from "./pushers/fb";

import { collectVercelMetadata } from "./adapters/metadata";
import { startRudderstackPusher } from "./pushers/rudderstack";
import { startFbPusher } from "./pushers/fb";

/** Config del arranque de delivery — el contrato público de la fase. */
export interface StartDeliveryConfig {
  /** Sin clave, el pusher de RudderStack no arranca. */
  rudderStackWriteKey?: string;
  fb?: boolean;
  vercelMetadataCollect?: boolean;
}

/** Enciende los destinos pedidos. Única forma de que la suite toque la red. */
export function startDelivery(config: StartDeliveryConfig): void {
  if (config.rudderStackWriteKey) startRudderstackPusher({ writeKey: config.rudderStackWriteKey });
  if (config.fb) startFbPusher();
  if (config.vercelMetadataCollect) collectVercelMetadata();
}
