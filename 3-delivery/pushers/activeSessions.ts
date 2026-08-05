// Pusher «activeSessions»: presencia en vivo en Firebase Realtime Database.
// Un nodo por PESTAÑA mientras está abierta, con la geo, un resumen vivo y los
// eventos tal como salen a la ingesta. Otra app lo lee para el panel de
// "visitantes ahora"; escribir es todo el alcance de acá.
//
// Por qué RTDB y no Firestore: `onDisconnect()` lo ejecuta el SERVIDOR cuando
// se corta el socket, así que el nodo se limpia aunque el navegador no llegue a
// correr nada (crash, batería, swipe). El borrado en `pagehide` es solo el
// camino rápido. Además se escribe por hijo (agregar un evento no reescribe el
// nodo) y factura por tráfico, no por operación.
//
// El SDK de Firebase entra por import dinámico en idle: la landing no paga su
// peso en el LCP. `firebase` ya es dependencia del repo (registro con Google).

import { registerDispatcher } from "../channel";
import { sessionMetadata } from "../adapters/metadata";
import { toRudderTrack } from "../adapters/rudderstack";
import type { EventEnvelope, HostingMetadata, SessionMetadata } from "../../types";
import type { Database } from "firebase/database";

const config = {
  /** Nodo raíz. Un hijo por pestaña abierta. */
  root: "activeSessions",
  /** OBLIGATORIA: sin esto el pusher no arranca. Es pública (viaja en el
   * navegador, como el writeKey) y para ESCRIBIR en RTDB alcanza — el apiKey
   * solo hace falta para auth. Por eso no dependemos de ningún endpoint. */
  databaseURL: "",
  idleTimeoutMs: 3000,
  idleFallbackMs: 1500,
  /** Refresco de `last_seen`, para distinguir vivo de colgado. */
  heartbeatMs: 30000,
};

type DatabaseApi = typeof import("firebase/database");

export interface SessionGeo {
  lat?: number;
  lng?: number;
  city?: string;
  region?: string;
  country?: string;
}

/** Lo que el panel necesita para el mapa y los contadores, sin recorrer eventos. */
export interface ActiveSessionNode {
  started_at: string;
  last_seen: string;
  visible: boolean;
  page: string;
  engaged_time_sec: number;
  geo: SessionGeo;
  /** Un nodo es una PESTAÑA. Agrupar por acá convierte pestañas en personas:
   * dos pestañas del mismo navegador comparten `anonymous_id`. Llega tarde
   * (lo crea el SDK al cargar), así que puede faltar los primeros segundos. */
  anonymous_id?: string;
  session_id?: string;
}

const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/** PURA. lat/lng llegan como string del edge; el mapa los quiere numéricos. */
export function toGeo(hosting: HostingMetadata): SessionGeo {
  const number = (raw?: string) => {
    if (raw === undefined || raw === "") return undefined;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  };
  const lat = number(hosting.latitude);
  const lng = number(hosting.longitude);
  return {
    ...(lat !== undefined ? { lat } : {}),
    ...(lng !== undefined ? { lng } : {}),
    ...(hosting.city ? { city: hosting.city } : {}),
    ...(hosting.region ? { region: hosting.region } : {}),
    ...(hosting.country ? { country: hosting.country } : {}),
  };
}

/** PURA: el resumen vivo que va arriba del nodo. */
export function toSessionNode(
  envelope: EventEnvelope,
  metadata: SessionMetadata,
  startedAt: string,
): ActiveSessionNode {
  const { anonymous_id, session_id } = metadata.identity;
  return {
    started_at: startedAt,
    last_seen: envelope.timestamp,
    // el nodo existe mientras el socket viva; esto dice si la están MIRANDO
    visible: isVisible(),
    page: envelope.context.page,
    engaged_time_sec: envelope.context.engaged_time_sec,
    geo: toGeo(metadata.metaDataFromHosting),
    // undefined rompe a RTDB: se omiten hasta que el SDK los cree
    ...(anonymous_id ? { anonymous_id } : {}),
    ...(session_id ? { session_id } : {}),
  };
}

let started = false;
let api: DatabaseApi | null = null;
let db: Database | null = null;
let nodePath = "";
let startedAt = "";
let pending: EventEnvelope[] = [];
/** Última atención conocida: la trae el envelope. Entre eventos no avanza —
 * delivery no le pide el reloj a 1-detection, el flujo es de una sola vía. */
let lastEngagedSec = 0;

const swallow = () => {
  /* la presencia nunca rompe la página */
};

/** Lo que puede cambiar sin que haya un evento: geo e ids llegan tarde (uno por
 * red, los otros los crea el SDK al cargar), y visible/last_seen son del ahora. */
const ambientPatch = () => {
  const { metaDataFromHosting, identity } = sessionMetadata.get();
  return {
    last_seen: new Date().toISOString(),
    visible: isVisible(),
    engaged_time_sec: lastEngagedSec,
    geo: toGeo(metaDataFromHosting),
    ...(identity.anonymous_id ? { anonymous_id: identity.anonymous_id } : {}),
    ...(identity.session_id ? { session_id: identity.session_id } : {}),
  };
};

function dispatch(envelope: EventEnvelope) {
  if (!api || !db) {
    pending.push(envelope);
    return;
  }
  const metadata = sessionMetadata.get();
  lastEngagedSec = envelope.context.engaged_time_sec;
  // el MISMO adapter que la ingesta: la fidelidad es por construcción
  const { event, properties, options } = toRudderTrack(envelope, metadata);
  void api.set(api.ref(db, `${nodePath}/events/${envelope.event_id}`), {
    event,
    properties,
    options,
  }).catch(swallow);
  void api.update(api.ref(db, nodePath), toSessionNode(envelope, metadata, startedAt)).catch(swallow);
}

async function connect(cfg: typeof config, unsubs: (() => void)[]) {
  try {
    const [{ initializeApp, getApps }, database] = await Promise.all([
      import("firebase/app"),
      import("firebase/database"),
    ]);
    const databaseURL = cfg.databaseURL;

    // app con nombre propio: no pisa la que la app usa para auth. Reusar si ya
    // existe: initializeApp con el mismo nombre tira (pasa con el HMR).
    const name = "events-suite";
    const app =
      getApps().find(existing => existing.name === name) ?? initializeApp({ databaseURL }, name);
    api = database;
    db = database.getDatabase(app, databaseURL);

    nodePath = `${cfg.root}/${newTabId()}`;
    startedAt = new Date().toISOString();

    // Receta de presencia: en CADA (re)conexión hay que volver a dejar puesto
    // el onDisconnect —se consume al dispararse— y reescribir el nodo, que el
    // servidor ya borró.
    api.onValue(api.ref(db, ".info/connected"), snapshot => {
      if (snapshot.val() !== true || !api || !db) return;
      const node = api.ref(db, nodePath);
      void api.onDisconnect(node).remove();
      // desde el primer instante, aunque no haya eventos todavía: el panel no
      // tiene que lidiar con campos que aparecen más tarde
      void api.update(node, {
        started_at: startedAt,
        page: window.location.pathname,
        ...ambientPatch(),
      }).catch(swallow);
    });

    const patch = () => {
      if (!api || !db || !nodePath) return;
      void api.update(api.ref(db, nodePath), ambientPatch()).catch(swallow);
    };
    const beat = setInterval(patch, cfg.heartbeatMs);
    unsubs.push(() => clearInterval(beat));
    // el anonymous_id y la geo llegan después del arranque: en cuanto caen,
    // el nodo se completa sin esperar al próximo evento ni al heartbeat
    unsubs.push(sessionMetadata.subscribe(patch));

    const queued = pending;
    pending = [];
    queued.forEach(dispatch);
  } catch {
    /* sin red, sin config o SDK bloqueado: la landing sigue igual */
  }
}

const newTabId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Idempotente y SSR-safe. Arranque EXPLÍCITO desde startDelivery (es red). */
export function startActiveSessions(overrides: Partial<typeof config> = {}): () => void {
  if (started || typeof window === "undefined") return () => {};
  const cfg = { ...config, ...overrides };
  if (!cfg.databaseURL) {
    console.warn("[events-suite] presencia sin databaseURL: no arranca");
    return () => {};
  }
  started = true;

  const unsubs: (() => void)[] = [registerDispatcher(dispatch)];

  // camino rápido: si el navegador llega a ejecutarlo, el nodo se va ya; si no
  // llega, lo borra el servidor con el onDisconnect
  const onEnd = () => {
    if (api && db && nodePath) void api.remove(api.ref(db, nodePath)).catch(swallow);
  };
  window.addEventListener("pagehide", onEnd);
  unsubs.push(() => window.removeEventListener("pagehide", onEnd));

  const idle = window.requestIdleCallback
    ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: cfg.idleTimeoutMs })
    : (fn: () => void) => setTimeout(fn, cfg.idleFallbackMs);
  idle(() => void connect(cfg, unsubs));

  return () => {
    onEnd();
    unsubs.forEach(unsub => unsub());
    pending = [];
    api = null;
    db = null;
    started = false;
  };
}
