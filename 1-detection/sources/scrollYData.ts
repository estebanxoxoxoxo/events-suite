// Source «scrollYData»: cada gesto de scroll vertical, asentado con debounce de 250 ms.
// Emite el neto del gesto completo: px, dirección, profundidad de salida y de llegada.

import { createEmitter } from "../../lib/emitter";
import type { ScrollDirection, ScrollGesture } from "../../types";

const DEBOUNCE_MS = 250;

const emitter = createEmitter<ScrollGesture>();

let lastY = 0;
let debounce: ReturnType<typeof setTimeout> | null = null;
let listening = false;
let hasScrolled = false;
let lastRawY = 0;
let liveDirection: ScrollDirection | null = null;

function settle() {
  const y = window.scrollY;
  if (y === lastY) return; // gesto sin desplazamiento neto (p. ej. rebote elástico)
  const { scrollHeight } = document.documentElement;
  const depthAt = (atY: number) =>
    Math.min(1, +((atY + window.innerHeight) / scrollHeight).toFixed(4));
  const gesture: ScrollGesture = {
    deltaPx: Math.abs(y - lastY),
    direction: y > lastY ? "down" : "up",
    fromDepth: depthAt(lastY),
    scrollDepth: depthAt(y),
    timestamp: Date.now(),
  };
  lastY = y;
  emitter.emit(gesture);
}

function onScroll() {
  hasScrolled = true;
  const y = window.scrollY;
  if (y !== lastRawY) {
    liveDirection = y > lastRawY ? "down" : "up";
    lastRawY = y;
  }
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(settle, DEBOUNCE_MS);
}

export const scrollYData = {
  subscribe: emitter.subscribe,
  /** true desde el primer scroll crudo de la sesión — se prende ANTES de que
   * asiente el primer gesto (los eventos scroll disparan antes que los
   * callbacks de IntersectionObserver en el mismo frame). */
  hasScrolled: () => hasScrolled,
  /** Dirección del scroll EN CURSO, leída de los eventos crudos — disponible
   * antes de que el gesto asiente (null hasta el primer scroll). */
  liveDirection: () => liveDirection,
  start() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    lastY = window.scrollY;
    lastRawY = lastY;
    window.addEventListener("scroll", onScroll, { passive: true });
  },
  stop() {
    if (!listening) return;
    listening = false;
    window.removeEventListener("scroll", onScroll);
    if (debounce) clearTimeout(debounce);
    debounce = null;
  },
};
