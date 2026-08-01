// pushEvent: la única línea que escribe la app. Dispara el evento por las DOS patas
// (pixel del navegador + Conversions API vía nuestro endpoint) con el mismo eventId
// para que Meta deduplique, y nunca lanza: el tracking no puede romper la página.

import { FbEvent, type FbUserData, type FbCustomData, type ServerEventPayload } from "./utils/types";
import { createEventId } from "./utils/ids";
import { getFbp, getFbc } from "./utils/cookies";
import { postBeacon } from "./utils/beacon";
import { sendFbBrowserEvent } from "./utils/pixel";

// Ruta del endpoint server-side. Cambiala con setServerEndpoint() si no la montaste
// en /api/send-server-event.
let SERVER_ENDPOINT = "/api/send-server-event";

export function setServerEndpoint(path: string): void {
  SERVER_ENDPOINT = path;
}

// Hook opcional para que la app se entere de cada evento (agregado de sesión,
// analytics propio, logs). Sale del core a propósito: así este template no depende
// de la DB ni del provider de ningún proyecto en particular.
type EventListener = (event: FbEvent, eventId: string) => void;
let listener: EventListener | null = null;

export function onFbEvent(fn: EventListener | null): void {
  listener = fn;
}

export interface PushOptions {
  /** Id externo para atar el evento a un flujo propio (ej. attemptId del registro). */
  eventId?: string;
  /** Atajo: email o teléfono. Se hashea en el server, nunca viaja en crudo. */
  contact?: string;
  /** Datos completos de Advanced Matching (mejor match rate que `contact` solo). */
  userData?: FbUserData;
  /** value / currency / content_*. Obligatorio value+currency en Purchase. */
  customData?: FbCustomData;
  /** Solo pixel, sin CAPI. Para PageView, que el pixel base ya manda. */
  browserOnly?: boolean;
  /** Solo CAPI, sin pixel. Para eventos que ocurren fuera de la vista del usuario. */
  serverOnly?: boolean;
}

export function pushEvent(event: FbEvent, opts: PushOptions = {}): string {
  const eventId = opts.eventId || createEventId();

  try {
    if (!opts.serverOnly) {
      sendFbBrowserEvent(event, eventId, opts.customData as Record<string, unknown>);
    }
    listener?.(event, eventId);
    if (!opts.browserOnly) {
      sendFbServerEvent({
        eventName: event,
        eventId,
        contact: opts.contact,
        userData: opts.userData,
        customData: opts.customData,
      });
    }
  } catch {
    /* noop: el tracking nunca rompe la página */
  }

  return eventId;
}

// Aviso a NUESTRO server (que es quien habla con Meta). Fire-and-forget por beacon:
// sobrevive a la navegación, así que sirve para el Lead disparado antes de un redirect.
export function sendFbServerEvent(
  input: Omit<ServerEventPayload, "fbp" | "fbc" | "eventSourceUrl">
): void {
  postBeacon(SERVER_ENDPOINT, {
    ...input,
    fbp: getFbp(),
    fbc: getFbc(),
    eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
  } satisfies ServerEventPayload);
}
