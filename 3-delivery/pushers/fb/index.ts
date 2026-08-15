// Pusher de Meta: puentea el gateway con el motor pixel+CAPI copiado de
// facebook-push-events (pushEvent: fbq del navegador + /api/send-server-event
// con el MISMO eventID → Meta deduplica). El mapping default es conservador a
// propósito: Lead NO está porque ya lo dispara startRegisterAttempt con
// eventId = attemptId — mapearlo acá contaría conversiones dobles. Y solo
// eventos de negocio: a Meta van conversiones, no 47 scrolls.

import { registerDispatcher } from "../../channel";
import { sessionMetadata } from "../../adapters/metadata";
import { toFbPush } from "../../adapters/fb";
import type { FbEventMapping } from "../../adapters/fb";
import { pushEvent } from "./pushEvent";
import { FbEvent } from "./utils/types";
import { BehaviorEventNames, BusinessEventNames } from "../../../types";

const config = {
  /** false = doble pata: pixel + CAPI vía /api/send-server-event con el MISMO
   * eventID (Meta dedupa). Requiere META_PIXEL_ID y META_ACCESS_TOKEN en el
   * server; si faltan, la CAPI responde 500 y solo cuenta el pixel (sin dobles). */
  browserOnly: false,
  /** Conversiones que van SOLO por el pixel, aunque `browserOnly` sea false:
   * un PageView por CAPI es ruido — Meta ya lo tiene del navegador y no es una
   * conversión. La doble pata se reserva para lo que sí vale. */
  browserOnlyFor: [FbEvent.PageView] as FbEvent[],
  mapping: {
    // page_view lo detecta la suite, no la app: es de comportamiento
    [BehaviorEventNames.PageView]: FbEvent.PageView,
    [BusinessEventNames.SignUpCompleted]: FbEvent.CompleteRegistration,
    [BusinessEventNames.AddToCart]: FbEvent.AddToCart,
    [BusinessEventNames.CheckoutStarted]: FbEvent.InitiateCheckout,
    [BusinessEventNames.PurchaseCompleted]: FbEvent.Purchase,
    [BusinessEventNames.Search]: FbEvent.Search,
  } as FbEventMapping,
};

let started = false;

/** Idempotente y SSR-safe. Arranque EXPLÍCITO: initEventsSuite() no lo llama. */
export function startFbPusher(overrides: Partial<typeof config> = {}): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  const cfg = { ...config, ...overrides };

  const unsub = registerDispatcher(envelope => {
    const mapped = toFbPush(envelope, sessionMetadata.get(), cfg.mapping);
    if (!mapped) return;
    const browserOnly = cfg.browserOnly || cfg.browserOnlyFor.includes(mapped.event);
    pushEvent(mapped.event, { browserOnly, ...mapped.options });
  });

  return () => {
    unsub();
    started = false;
  };
}

export { pushEvent, sendFbServerEvent, setServerEndpoint, onFbEvent } from "./pushEvent";
export { FbEvent } from "./utils/types";
