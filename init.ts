// Arranque de la suite: prende sources y FSMs una sola vez por sesión.

import { timeSession } from "./sources/timeSession";
import { scrollYData } from "./sources/scrollYData";
import { clicks } from "./sources/clicks";
import { startRelevantSession } from "./FSMs/relevantSession";
import { startActiveSession } from "./FSMs/activeSession";
import { startScrollDepth } from "./FSMs/scrollDepth";
import { startReadingScroll } from "./FSMs/readingScroll";
import { startSkimScroll } from "./FSMs/skimScroll";
import { startDiagonalScroll } from "./FSMs/diagonalScroll";
import { startToTopScroll } from "./FSMs/toTopScroll";
import { startBounce } from "./FSMs/bounce";
import { startTotalClicks } from "./FSMs/totalClicks";
import { startRageClick } from "./FSMs/rageClick";

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
  ];

  teardown = () => {
    fsms.forEach(fsm => fsm.stop());
    clicks.stop();
    scrollYData.stop();
    timeSession.stop();
    teardown = null;
  };
  return teardown;
}
