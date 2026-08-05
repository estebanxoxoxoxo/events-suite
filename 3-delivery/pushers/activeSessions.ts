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
import type { EventEnvelope, HostingMetadata } from "../../types";
import type { Database } from "firebase/database";

const config = {
  /** Nodo raíz. Un hijo por pestaña abierta. */
  root: "activeSessions",
  /** Vacío = se deduce de projectId (instancia default). */
  databaseURL: "",
  /** Config del proyecto: la sirve el host (la misma que usa la app). */
  configEndpoint: "/api/firebase-config",
  idleTimeoutMs: 3000,
  idleFallbackMs: 1500,
  /** Refresco de `last_seen`, para distinguir vivo de colgado. */
  heartbeatMs: 30000,
};

type FirebaseConfig = { projectId?: string; databaseURL?: string };
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
  hosting: HostingMetadata,
  startedAt: string,
): ActiveSessionNode {
  return {
    started_at: startedAt,
    last_seen: envelope.timestamp,
    // el nodo existe mientras el socket viva; esto dice si la están MIRANDO
    visible: isVisible(),
    page: envelope.context.page,
    engaged_time_sec: envelope.context.engaged_time_sec,
    geo: toGeo(hosting),
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
  void api.update(
    api.ref(db, nodePath),
    toSessionNode(envelope, metadata.metaDataFromHosting, startedAt),
  ).catch(swallow);
}

async function connect(cfg: typeof config, unsubs: (() => void)[]) {
  try {
    const [{ initializeApp, getApps }, database] = await Promise.all([
      import("firebase/app"),
      import("firebase/database"),
    ]);
    // Para ESCRIBIR en RTDB alcanza el databaseURL: el apiKey y el resto de la
    // config solo hacen falta para auth. Si la app lo pasa, no dependemos de
    // ningún endpoint suyo; si no, se deduce del projectId que sirva el host.
    let projectConfig: FirebaseConfig = {};
    if (!cfg.databaseURL) {
      const response = await fetch(cfg.configEndpoint);
      projectConfig = response.ok ? await response.json() : {};
    }
    const databaseURL =
      cfg.databaseURL ||
      projectConfig.databaseURL ||
      (projectConfig.projectId
        ? `https://${projectConfig.projectId}-default-rtdb.firebaseio.com`
        : "");
    if (!databaseURL) return;

    // app con nombre propio: no pisa la que la app usa para auth. Reusar si ya
    // existe: initializeApp con el mismo nombre tira (pasa con el HMR).
    const name = "events-suite";
    const app =
      getApps().find(existing => existing.name === name) ??
      initializeApp({ ...projectConfig, databaseURL }, name);
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
      void api.update(node, {
        started_at: startedAt,
        last_seen: new Date().toISOString(),
        visible: isVisible(),
        page: window.location.pathname,
        // desde el primer instante, aunque todavía no haya eventos: el panel no
        // tiene que lidiar con campos que aparecen más tarde. El valor real lo
        // trae cada envelope; delivery no puede leerle el reloj a 1-detection.
        engaged_time_sec: lastEngagedSec,
        geo: toGeo(sessionMetadata.get().metaDataFromHosting),
      }).catch(swallow);
    });

    const beat = setInterval(() => {
      if (!api || !db) return;
      void api.update(api.ref(db, nodePath), {
        last_seen: new Date().toISOString(),
        visible: isVisible(),
        engaged_time_sec: lastEngagedSec,
      }).catch(swallow);
    }, cfg.heartbeatMs);
    unsubs.push(() => clearInterval(beat));

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
