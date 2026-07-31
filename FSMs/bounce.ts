// FSM «Bounce» — 1 vez por sesión: la sesión terminó (pagehide) antes del
// umbral mínimo de interacción. Pasado el umbral, la máquina se retira sola.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../gateway";
import { timeSession } from "../sources/timeSession";
import type { BounceConfig } from "../types";

const config: BounceConfig = {
  maxSeconds: 5,
};

type Input = { seconds: number } | { sessionEnd: true };
type Ctx = { startedAt: number };

export const startBounce = (cfg: BounceConfig = config) =>
  createFSM<Input, Ctx>({
    id: "bounce",
    initial: "watching",
    context: { startedAt: Date.now() },
    states: {
      watching(input, ctx) {
        if ("seconds" in input) {
          return input.seconds >= cfg.maxSeconds ? DONE : undefined;
        }
        const seconds = (Date.now() - ctx.startedAt) / 1000;
        if (seconds < cfg.maxSeconds) {
          gateway.emit("bounce", { seconds: +seconds.toFixed(2) });
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
