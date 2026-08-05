// FSM «Scroll despectivo» — 1 vez por ocasión: un solo gesto muy largo HACIA
// ABAJO, compatible con un recorrido superficial del contenido. Subir nunca es
// despectivo: las vueltas al tope (aun partidas en varios gestos por el
// momentum) son territorio de toTopScroll. Además, si el gesto parte de una
// profundidad mayor a maxFromDepth no dispara (espejo del minDepth de toTop).

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { BehaviorEventNames, type ScrollGesture, type SkimScrollConfig } from "../../types";

const config: SkimScrollConfig = {
  minPx: 2500,
  maxFromDepth: 0.75,
};

export const startSkimScroll = (cfg: SkimScrollConfig = config) =>
  createFSM<ScrollGesture, Record<string, never>>({
    id: "skimScroll",
    initial: "watching",
    context: {},
    states: {
      watching(gesture) {
        if (
          gesture.direction === "down" &&
          gesture.deltaPx > cfg.minPx &&
          gesture.fromDepth <= cfg.maxFromDepth
        ) {
          gateway.emit(BehaviorEventNames.SkimScroll, {
            direction: gesture.direction, // dimensión: queda fuera de values
            values: [{ name: "delta_px", value: gesture.deltaPx }],
          });
        }
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
