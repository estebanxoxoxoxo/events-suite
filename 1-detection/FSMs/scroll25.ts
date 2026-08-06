// FSM «Scroll 25» — 1 vez por sesión: el usuario vio el 25% de la página.
// Sin config: el umbral ES la identidad de la máquina, está en el nombre.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { timeSession } from "../sources/timeSession";
import { BehaviorEventNames } from "../../types";

const LEVEL = 0.25;

export const startScroll25 = () =>
  createFSM<{ depth: number }, Record<string, never>>({
    id: "scroll25",
    initial: "watching",
    context: {},
    states: {
      watching({ depth }) {
        if (depth < LEVEL) return;
        // el umbral ya está en el nombre; lo que aporta es cuánto tardó
        gateway.emit(BehaviorEventNames.Scroll25, {
          values: [{ engaged_seconds: timeSession.getSeconds() }],
        });
        return DONE;
      },
    },
    wire: send => [scrollYData.subscribe(gesture => send({ depth: gesture.scrollDepth }))],
  });
