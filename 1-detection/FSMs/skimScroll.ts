// FSM «Scroll despectivo» — 1 vez por ocasión: un solo gesto muy largo,
// compatible con un recorrido superficial del contenido. Hacia abajo dispara
// siempre; hacia arriba también, MENOS la barrida completa al tope, que es
// territorio de toTopScroll. Definido por complemento a propósito: entre los
// dos eventos no queda gesto largo sin clasificar ni gesto contado dos veces.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { isFullSweepToTop } from "../../lib/fullSweep";
import { BehaviorEventNames, type ScrollGesture, type SkimScrollConfig } from "../../types";

const config: SkimScrollConfig = {
  minPx: 2500,
};

export const startSkimScroll = (cfg: SkimScrollConfig = config) =>
  createFSM<ScrollGesture, Record<string, never>>({
    id: "skimScroll",
    initial: "watching",
    context: {},
    states: {
      watching(gesture) {
        if (gesture.deltaPx > cfg.minPx && !isFullSweepToTop(gesture)) {
          gateway.emit(BehaviorEventNames.SkimScroll, {
            values: [{ delta_px: gesture.deltaPx }, { direction: gesture.direction }],
          });
        }
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
