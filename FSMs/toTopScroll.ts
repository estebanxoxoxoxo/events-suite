// FSM «Vuelta al tope» — 1 vez por ocasión: el usuario estaba profundo en la
// página (fromDepth > minDepth) y pegó un gesto largo hacia arriba. La
// profundidad de salida viene en el propio gesto (source scrollYData).

import { createFSM } from "./createFSM";
import { gateway } from "../gateway";
import { scrollYData } from "../sources/scrollYData";
import type { ScrollGesture, ToTopScrollConfig } from "../types";

const config: ToTopScrollConfig = {
  minPx: 2500,
  minDepth: 0.75,
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
          gesture.deltaPx > cfg.minPx &&
          gesture.fromDepth > cfg.minDepth
        ) {
          gateway.emit("to_top_scroll", {
            delta_px: gesture.deltaPx,
            from_depth: gesture.fromDepth,
            to_depth: gesture.scrollDepth,
          });
        }
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
