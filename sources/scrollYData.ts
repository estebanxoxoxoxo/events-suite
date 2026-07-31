// Source «scrollYData»: cada gesto de scroll vertical, asentado con debounce de 250 ms.
// Emite el neto del gesto completo: px, dirección, profundidad de salida y de llegada.

import { createEmitter } from "./emitter";
import type { ScrollGesture } from "../types";

const DEBOUNCE_MS = 250;

const emitter = createEmitter<ScrollGesture>();

let lastY = 0;
let debounce: ReturnType<typeof setTimeout> | null = null;
let listening = false;

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
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(settle, DEBOUNCE_MS);
}

export const scrollYData = {
  subscribe: emitter.subscribe,
  start() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    lastY = window.scrollY;
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
