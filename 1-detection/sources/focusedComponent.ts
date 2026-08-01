// Source «focusedComponent»: qué componente etiquetado domina el viewport.
// Descubre elementos por selectores (config), los observa con
// IntersectionObserver y emite cada vez que cambia el dominante. Sin
// coordenadas: dominancia = mayor fracción del viewport ocupada (relativa al
// dispositivo), con un piso de minViewportShare. Componentes que montan tarde
// entran solos vía re-escaneo (MutationObserver debounced).

import { createEmitter } from "../../lib/emitter";
import type { FocusedComponent, FocusedComponentSourceConfig } from "../../types";

const config: FocusedComponentSourceConfig = {
  selectors: ["[data-analytics-id]"],
  minViewportShare: 0.25,
};

const RESCAN_MS = 500;

const emitter = createEmitter<FocusedComponent>();

const shares = new Map<Element, number>();
let io: IntersectionObserver | null = null;
let mo: MutationObserver | null = null;
let rescan: ReturnType<typeof setTimeout> | null = null;
let current: string | null = null;

const labelOf = (el: Element) =>
  el.getAttribute("data-analytics-id") || el.id || el.tagName.toLowerCase();

function recompute() {
  let bestEl: Element | null = null;
  let bestShare = 0;
  for (const [el, share] of shares) {
    if (share > bestShare) {
      bestShare = share;
      bestEl = el;
    }
  }
  const next = bestEl && bestShare >= config.minViewportShare ? labelOf(bestEl) : null;
  if (next === current) return;
  current = next;
  emitter.emit({ component: current, share: +bestShare.toFixed(3), at: Date.now() });
}

function discover() {
  shares.forEach((_, el) => {
    if (el.isConnected === false) shares.delete(el);
  });
  document.querySelectorAll(config.selectors.join(",")).forEach(el => {
    if (!shares.has(el)) {
      shares.set(el, 0);
      io!.observe(el);
    }
  });
}

export const focusedComponent = {
  subscribe: emitter.subscribe,
  getCurrent: () => current,
  start() {
    if (io || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    io = new IntersectionObserver(
      entries => {
        const viewport = window.innerWidth * window.innerHeight;
        for (const entry of entries) {
          const area = entry.intersectionRect.width * entry.intersectionRect.height;
          shares.set(entry.target, viewport > 0 ? area / viewport : 0);
        }
        recompute();
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] },
    );
    discover();
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => {
        if (rescan) clearTimeout(rescan);
        rescan = setTimeout(discover, RESCAN_MS);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  },
  stop() {
    io?.disconnect();
    io = null;
    mo?.disconnect();
    mo = null;
    if (rescan) clearTimeout(rescan);
    rescan = null;
    shares.clear();
    current = null;
  },
};
