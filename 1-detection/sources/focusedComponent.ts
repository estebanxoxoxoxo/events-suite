// Source «focusedComponent»: qué componente etiquetado tiene el usuario
// ENFRENTE. Descubre elementos por selectores (config) y emite cada vez que
// cambia el dominante.
//
// El criterio es el centro: domina el componente cuyo punto medio (x, y) cae
// dentro de la franja central de la pantalla — se descarta `band` arriba,
// abajo y a los costados. Nada de superficie ni de "cuánto se ve": una sección
// de tres pantallas de alto nunca entra entera, pero su medio sí pasa por el
// centro, y eso es exactamente lo que significa estar mirándola.
//
// Se recalcula con el scroll (debounced) y con el resize, no con un
// IntersectionObserver: sus thresholds son fracciones DEL elemento, así que en
// un componente más alto que la ventana dejan de dispararse justo cuando lo
// estás recorriendo.

import { createEmitter } from "../../lib/emitter";
import type { FocusedComponent, FocusedComponentSourceConfig } from "../../types";

const config: FocusedComponentSourceConfig = {
  selectors: ["[data-analytics-id]"],
  /** 0..0.5: fracción de pantalla descartada en cada borde. Con 0.3, la franja
   * que cuenta es el 40% del medio (del 30% al 70%). */
  band: 0.3,
};

const SETTLE_MS = 120;
const RESCAN_MS = 500;

const emitter = createEmitter<FocusedComponent>();

const tracked = new Set<Element>();
let mo: MutationObserver | null = null;
let rescan: ReturnType<typeof setTimeout> | null = null;
let settle: ReturnType<typeof setTimeout> | null = null;
let listening = false;
let current: string | null = null;

const labelOf = (el: Element) =>
  el.getAttribute("data-analytics-id") || el.id || el.tagName.toLowerCase();

function recompute() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minX = vw * config.band;
  const maxX = vw - minX;
  const minY = vh * config.band;
  const maxY = vh - minY;

  let bestEl: Element | null = null;
  let bestDistance = Infinity;
  let bestShare = 0;

  for (const el of tracked) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;
    // si hay más de uno con el medio en la franja, gana el más centrado
    const distance = Math.abs(cy - vh / 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEl = el;
      const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      bestShare = vh > 0 ? (visible * Math.min(rect.width, vw)) / (vh * vw) : 0;
    }
  }

  const next = bestEl ? labelOf(bestEl) : null;
  if (next === current) return;
  current = next;
  emitter.emit({ component: current, share: +bestShare.toFixed(3), at: Date.now() });
}

function discover() {
  tracked.forEach(el => {
    if (el.isConnected === false) tracked.delete(el);
  });
  document.querySelectorAll(config.selectors.join(",")).forEach(el => tracked.add(el));
  recompute();
}

function onMove() {
  if (settle) clearTimeout(settle);
  settle = setTimeout(recompute, SETTLE_MS);
}

export const focusedComponent = {
  subscribe: emitter.subscribe,
  getCurrent: () => current,
  start() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    discover();
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove, { passive: true });
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => {
        if (rescan) clearTimeout(rescan);
        rescan = setTimeout(discover, RESCAN_MS);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  },
  stop() {
    if (!listening) return;
    listening = false;
    window.removeEventListener("scroll", onMove);
    window.removeEventListener("resize", onMove);
    mo?.disconnect();
    mo = null;
    if (rescan) clearTimeout(rescan);
    if (settle) clearTimeout(settle);
    rescan = null;
    settle = null;
    tracked.clear();
    current = null;
  },
};
