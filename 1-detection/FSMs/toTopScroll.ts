// FSM «Vuelta al tope» — 1 vez por ocasión: barrida completa al tope en UN
// gesto: sale de profundo (> minFromDepth) y aterriza arriba (< maxToDepth).
// Sin umbral de píxeles: el recorrido ya implica un gesto largo, y en
// proporción de página significa lo mismo en mobile que en desktop. Las dos
// profundidades vienen en el propio gesto (source scrollYData).

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { BehaviorEventNames, type ScrollGesture, type ToTopScrollConfig } from "../../types";

const config: ToTopScrollConfig = {
  minFromDepth: 0.8,
  maxToDepth: 0.2,
};

export const startToTopScroll = (cfg: ToTopScrollConfig = config) =>
  createFSM<ScrollGesture, Record<string, never>>({
    id: "toTopScroll",
    initial: "watching",
    context: {},
    states: {
      watching(gesture) {
        if (
          gesture.direction === "up" &&
          gesture.fromDepth > cfg.minFromDepth &&
          gesture.scrollDepth < cfg.maxToDepth
        ) {
          gateway.emit(BehaviorEventNames.ToTopScroll, {
            values: [
              { name: "delta_px", value: gesture.deltaPx },
              { name: "from_depth", value: gesture.fromDepth },
              { name: "to_depth", value: gesture.scrollDepth },
            ],
          });
        }
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
