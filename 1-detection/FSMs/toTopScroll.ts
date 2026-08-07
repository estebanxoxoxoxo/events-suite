// FSM «Vuelta al tope» — 1 vez por ocasión: barrida completa al tope en UN
// gesto. Su definición ES la frontera compartida de `lib/fullSweep.ts`: sale de
// profundo y aterriza arriba. Sin umbral de píxeles y sin config propia — el
// recorrido ya implica un gesto largo, y en proporción de página significa lo
// mismo en mobile que en desktop.
//
// skim, reading y diagonal ceden estos gestos: entre las cuatro, ninguno queda
// sin clasificar ni se cuenta dos veces.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { isFullSweepToTop } from "../../lib/fullSweep";
import { BehaviorEventNames, type ScrollGesture } from "../../types";

export const startToTopScroll = () =>
  createFSM<ScrollGesture, Record<string, never>>({
    id: "toTopScroll",
    initial: "watching",
    context: {},
    states: {
      watching(gesture) {
        if (isFullSweepToTop(gesture)) {
          gateway.emit(BehaviorEventNames.ToTopScroll, {
            values: [
              { delta_px: gesture.deltaPx },
              { from_depth: gesture.fromDepth },
              { to_depth: gesture.scrollDepth },
            ],
          });
        }
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
