// FSM «Bounce» — 1 vez por sesión: la sesión terminó (pagehide) antes del
// umbral mínimo de interacción. Pasado el umbral, la máquina se retira sola.
// El umbral se mide en segundos de ATENCIÓN, no de reloj: el que abre la
// landing, se va a otra pestaña diez minutos y cierra sin leer, rebotó.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../../2-gateway";
import { timeSession } from "../sources/timeSession";
import { BehaviorEventNames, type BounceConfig } from "../../types";

const config: BounceConfig = {
  maxSeconds: 5,
};

type Input = { seconds: number } | { sessionEnd: true };
type Ctx = Record<string, never>;

export const startBounce = (cfg: BounceConfig = config) =>
  createFSM<Input, Ctx>({
    id: "bounce",
    initial: "watching",
    context: {},
    states: {
      watching(input) {
        if ("seconds" in input) {
          return input.seconds >= cfg.maxSeconds ? DONE : undefined;
        }
        // al momento, no del último tick: el source lo calcula por resta
        const seconds = timeSession.getSeconds();
        if (seconds < cfg.maxSeconds) {
          gateway.emit(BehaviorEventNames.Bounce, {
            values: [{ name: "engaged_seconds", value: seconds }],
          });
        }
        return DONE;
      },
    },
    wire: send => {
      const onEnd = () => send({ sessionEnd: true });
      window.addEventListener("pagehide", onEnd);
      return [
        timeSession.subscribe(seconds => send({ seconds })),
        () => window.removeEventListener("pagehide", onEnd),
      ];
    },
  });
