// Source «timeSession»: segundos de ATENCIÓN — el tiempo con la pestaña
// visible, no el tiempo de reloj. Es lo que GA4 llama engagement time.
//
// Por qué no el reloj: el tiempo de reloj ya lo tenés gratis restando
// `timestamp - loaded_at` en cualquier evento, así que un contador que lo
// repita no aporta nada. Y por qué no un contador de ticks a secas: los
// navegadores estrangulan los timers en pestañas de fondo, así que un
// `setInterval` no mide ni una cosa ni la otra — queda a mitad de camino.
//
// Acá el valor sale de restar instantes (Date.now()) sobre los tramos
// visibles, así que es exacto aunque el navegador atrase el tick: el timer
// solo decide CADA CUÁNTO se avisa, nunca CUÁNTO vale.

import { createEmitter } from "../../lib/emitter";

const emitter = createEmitter<number>();

/** Acumulado de los tramos visibles ya cerrados. */
let accumulatedMs = 0;
/** Instante en que arrancó el tramo visible en curso (null si está oculta). */
let visibleSince: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let listening = false;

const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

const engagedMs = () => accumulatedMs + (visibleSince === null ? 0 : Date.now() - visibleSince);

const startTicking = () => {
  if (timer) return;
  timer = setInterval(() => emitter.emit(timeSession.getSeconds()), 1000);
};

const stopTicking = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

const onVisibilityChange = () => {
  if (isHidden()) {
    // cierra el tramo: a partir de acá el contador no avanza
    if (visibleSince !== null) accumulatedMs += Date.now() - visibleSince;
    visibleSince = null;
    stopTicking();
    return;
  }
  if (visibleSince === null) visibleSince = Date.now();
  startTicking();
};

export const timeSession = {
  /** Segundos de atención acumulados, con 2 decimales. Se calcula al momento:
   * no depende de que el tick haya corrido. */
  getSeconds: () => +(engagedMs() / 1000).toFixed(2),
  /** El listener recibe el acumulado en cada tick (solo mientras es visible). */
  subscribe: emitter.subscribe,
  start() {
    if (listening) return;
    listening = true;
    visibleSince = isHidden() ? null : Date.now();
    document?.addEventListener?.("visibilitychange", onVisibilityChange);
    if (visibleSince !== null) startTicking();
  },
  stop() {
    if (!listening) return;
    listening = false;
    document?.removeEventListener?.("visibilitychange", onVisibilityChange);
    stopTicking();
    if (visibleSince !== null) accumulatedMs += Date.now() - visibleSince;
    visibleSince = null;
  },
};
