// Arranque de la suite: prende la etapa de detección (sources + FSMs) una
// sola vez por sesión. La etapa 1 no tiene gate: es productora pura y este
// init es quien la enciende. Los pushers (delivery) NO arrancan acá: son red
// y se habilitan explícito desde la app (startRudderstackPusher / startFbPusher).

import { timeSession } from "./1-detection/sources/timeSession";
import { scrollYData } from "./1-detection/sources/scrollYData";
import { clicks } from "./1-detection/sources/clicks";
import { focusedComponent } from "./1-detection/sources/focusedComponent";
import { startRelevantSession } from "./1-detection/FSMs/relevantSession";
import { startActiveSession } from "./1-detection/FSMs/activeSession";
import { startScrollDepth } from "./1-detection/FSMs/scrollDepth";
import { startReadingScroll } from "./1-detection/FSMs/readingScroll";
import { startSkimScroll } from "./1-detection/FSMs/skimScroll";
import { startDiagonalScroll } from "./1-detection/FSMs/diagonalScroll";
import { startToTopScroll } from "./1-detection/FSMs/toTopScroll";
import { startBounce } from "./1-detection/FSMs/bounce";
import { startTotalClicks } from "./1-detection/FSMs/totalClicks";
import { startRageClick } from "./1-detection/FSMs/rageClick";
import { startComponentFocus } from "./1-detection/FSMs/componentFocus";

// Vite dev: los singletons de la suite (sources, gateway, máquinas) no
// sobreviven un hot-swap parcial — mezclaría instancias viejas y nuevas.
// Cualquier edición dentro de la suite fuerza recarga completa. Debe ser
// `import.meta.hot` textual: Vite lo detecta lexicalmente, un alias no sirve.
// @ts-ignore -- import.meta.hot existe solo en dev (lo inyecta Vite)
import.meta.hot?.decline();

let teardown: (() => void) | null = null;

/** Idempotente y SSR-safe. Devuelve el teardown (frena sources y FSMs). */
export function initEventsSuite(): () => void {
  if (teardown) return teardown;
  if (typeof window === "undefined") return () => {};

  timeSession.start();
  scrollYData.start();
  clicks.start();
  focusedComponent.start();

  const fsms = [
    startRelevantSession(),
    startActiveSession(),
    startScrollDepth(),
    startReadingScroll(),
    startSkimScroll(),
    startDiagonalScroll(),
    startToTopScroll(),
    startBounce(),
    startTotalClicks(),
    startRageClick(),
    startComponentFocus(),
  ];

  teardown = () => {
    fsms.forEach(fsm => fsm.stop());
    focusedComponent.stop();
    clicks.stop();
    scrollYData.stop();
    timeSession.stop();
    teardown = null;
  };
  return teardown;
}

// Auto-init: la suite presente ES la suite iniciada. Importar cualquier
// superficie pública (el Provider) evalúa este módulo y enciende la
// detección — idempotente y no-op en SSR. La red sigue aparte (startDelivery).
initEventsSuite();
