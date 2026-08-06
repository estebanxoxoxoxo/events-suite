// Source «clicks»: cada click en la página, crudo. Escucha en fase de captura
// para que un stopPropagation de la app no esconda clicks a la analítica.

import { createEmitter } from "../../lib/emitter";
import type { ClickData } from "../../types";

const emitter = createEmitter<ClickData>();

let listening = false;

function onClick(event: MouseEvent) {
  emitter.emit({
    x: event.clientX,
    y: event.clientY,
    // pageX/pageY las da el navegador ya sumadas al scroll
    pageX: Math.round(event.pageX),
    pageY: Math.round(event.pageY),
    timestamp: Date.now(),
  });
}

export const clicks = {
  subscribe: emitter.subscribe,
  start() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    window.addEventListener("click", onClick, { capture: true, passive: true });
  },
  stop() {
    if (!listening) return;
    listening = false;
    window.removeEventListener("click", onClick, { capture: true });
  },
};
