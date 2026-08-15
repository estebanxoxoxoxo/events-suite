// Pusher de RudderStack: el viejo src/analytics.js mudado a la suite. Se
// suscribe al gateway (con replay: los eventos previos al arranque salen
// igual), adapta cada envelope y despacha por el SDK, que aporta cola, batch
// y retry. Reglas no negociables del pipeline: batch obligatorio, sin beacon,
// sin page() del SDK (la carga la emite la suite como `page_view` por el
// gateway, ver loadSdk); dataplane y sourceConfig
// same-origin. El tracking de sesión del SDK SÍ va activo (ver load()).
// El SDK se carga con import dinámico en idle para no pesar en el LCP (con
// timeout: las animaciones continuas de la landing pueden postergar
// requestIdleCallback para siempre); lo emitido antes queda en cola local.

import { registerDispatcher } from "../channel";
import { sessionMetadata, setIdentityMetadata } from "../adapters/metadata";
import { toRudderContext, toRudderTrack } from "../adapters/rudderstack";
import type { EventEnvelope, LoginMetadata } from "../../types";

const config = {
  /** Obligatoria: pasala desde la app (única fuente de verdad: src/config.js). */
  writeKey: "",
  flushIntervalMs: 3000,
  idleTimeoutMs: 3000,
  idleFallbackMs: 1500,
};

type RudderSdk = {
  load: (writeKey: string, dataPlaneUrl: string, options?: Record<string, unknown>) => void;
  page: (properties?: Record<string, unknown>, options?: Record<string, unknown>) => void;
  track: (
    event: string,
    properties?: Record<string, unknown>,
    apiOptions?: Record<string, unknown>,
  ) => void;
  identify: (userId: string, traits?: Record<string, unknown>) => void;
  getAnonymousId: () => string | undefined;
  getSessionId: () => number | null | undefined;
};

/** El SDK es el dueño de estos dos ids; los publica en el registry para que
 * los use quien los necesite (presencia agrupa pestañas por anonymous_id).
 * Se relee en cada despacho: el session_id rota tras 30 min de inactividad.
 * Devuelve true cuando ya tiene los dos. */
function publishIdentity(): boolean {
  if (!sdk) return false;
  try {
    const sessionId = sdk.getSessionId();
    // `|| undefined`: en un visitante NUEVO el SDK devuelve "" hasta que
    // termina de crearlos, y un vacío guardado pisa al valor bueno
    const anonymous_id = sdk.getAnonymousId() || undefined;
    const session_id = sessionId ? String(sessionId) : undefined;
    setIdentityMetadata({ anonymous_id, session_id });
    return Boolean(anonymous_id && session_id);
  } catch {
    return false;
  }
}

/** El SDK crea el anonymousId y abre la sesión DURANTE la carga, no antes de
 * que `load()` retorne: leerlos en el mismo tick devuelve vacío en cualquier
 * visitante nuevo. Reintenta hasta tenerlos, con techo. */
function publishIdentityWhenReady(tries = 20): void {
  if (publishIdentity() || tries <= 0) return;
  setTimeout(() => publishIdentityWhenReady(tries - 1), 500);
}

let started = false;
let sdk: RudderSdk | null = null;
let pending: EventEnvelope[] = [];

function dispatch(envelope: EventEnvelope) {
  if (!sdk) {
    pending.push(envelope);
    return;
  }
  const { event, properties, options } = toRudderTrack(envelope, sessionMetadata.get());
  try {
    // Las options las arma el adapter: `originalTimestamp` (la ocurrencia real,
    // no la hora del despacho) y el entorno que el SDK mergea en `context`.
    sdk.track(event, properties, options);
    publishIdentity();
  } catch {
    /* el tracking nunca rompe la página */
  }
}

function identify(login: LoginMetadata) {
  if (!sdk || login.user_id === undefined) return;
  const { user_id, ...traits } = login;
  try {
    sdk.identify(String(user_id), traits);
  } catch {
    /* noop */
  }
}

async function loadSdk(cfg: typeof config) {
  try {
    const { RudderAnalytics } = await import("@rudderstack/analytics-js");
    const origin = window.location.origin;
    const instance = new RudderAnalytics();
    instance.load(cfg.writeKey, origin, {
      configUrl: origin, // /sourceConfig lo servimos nosotros, no api.rudderstack.com
      queueOptions: { batch: { enabled: true, flushInterval: cfg.flushIntervalMs } },
      useBeacon: false,
      polyfillIfRequired: false,
      // OJO: son dos autoTrack distintos. El que el pipeline prohíbe es el de
      // page() automático; el de sesiones es el que agrega context.sessionId a
      // cada evento (timeout por inactividad, 30 min = default del SDK y de
      // GA4). Sin esto, un anonymous_id son N visitas pegadas en una sola.
      sessions: { autoTrack: true, timeout: 1800000 },
      sendAdblockPage: false,
      // el momento exacto en que los ids existen; el reintento de abajo es la
      // red por si el callback no llega (SDK bloqueado a mitad de carga)
      onLoaded: () => publishIdentity(),
    });
    sdk = instance as unknown as RudderSdk;
    // SIN page(): la carga ya la emite la suite como `page_view` por el
    // gateway, con el envelope de todos. La llamada `page` del SDK era el
    // mismo hecho contado dos veces, con otro shape (type=page, event=null y
    // properties propias del SDK) — una fila por carga que no se parecía a
    // ninguna otra. Lo que aportaba no se pierde: el SDK sigue poniendo
    // `context.page` (url, path, referrer, title) en TODOS los eventos.
    publishIdentityWhenReady();
    identify(sessionMetadata.get().login); // por si el login llegó antes que el SDK
    const queued = pending;
    pending = [];
    queued.forEach(dispatch);
  } catch {
    /* SDK bloqueado o sin red: la página sigue como si nada */
  }
}

/** Idempotente y SSR-safe. Arranque EXPLÍCITO: initEventsSuite() no lo llama. */
export function startRudderstackPusher(overrides: Partial<typeof config> = {}): () => void {
  if (started || typeof window === "undefined") return () => {};
  const cfg = { ...config, ...overrides };
  if (!cfg.writeKey) {
    console.warn("[events-suite] pusher de rudderstack sin writeKey: no arranca");
    return () => {};
  }
  started = true;

  const unsubs = [
    registerDispatcher(dispatch), // canal único de la fase; backfill incluido
    sessionMetadata.subscribe(metadata => identify(metadata.login)),
  ];

  const idle = window.requestIdleCallback
    ? (fn: () => void) => window.requestIdleCallback(fn, { timeout: cfg.idleTimeoutMs })
    : (fn: () => void) => setTimeout(fn, cfg.idleFallbackMs);
  idle(() => void loadSdk(cfg));

  return () => {
    unsubs.forEach(unsub => unsub());
    pending = [];
    started = false;
  };
}
