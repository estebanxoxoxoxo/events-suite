// FSM «Scroll despectivo» — 1 vez por ocasión: un solo gesto muy largo,
// compatible con un recorrido superficial del contenido. Hacia abajo dispara
// siempre; hacia arriba también, MENOS la barrida completa al tope, que es
// territorio de toTopScroll. Definido por complemento a propósito: entre los
// dos eventos no queda gesto largo sin clasificar ni gesto contado dos veces.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { BehaviorEventNames, type ScrollGesture, type SkimScrollConfig } from "../../types";

const config: SkimScrollConfig = {
  minPx: 2500,
  // lo que le cede a toTopScroll: mismos números que su config
  fullSweepFromDepth: 0.8,
  fullSweepToDepth: 0.2,
};

export const startSkimScroll = (cfg: SkimScrollConfig = config) =>
  createFSM<ScrollGesture, Record<string, never>>({
    id: "skimScroll",
    initial: "watching",
    context: {},
    states: {
      watching(gesture) {
        const fullSweep =
          gesture.direction === "up" &&
          gesture.fromDepth > cfg.fullSweepFromDepth &&
          gesture.scrollDepth < cfg.fullSweepToDepth;
        if (gesture.deltaPx > cfg.minPx && !fullSweep) {
          gateway.emit(BehaviorEventNames.SkimScroll, {
            delta_px: gesture.deltaPx,
            direction: gesture.direction,
          });
        }
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
