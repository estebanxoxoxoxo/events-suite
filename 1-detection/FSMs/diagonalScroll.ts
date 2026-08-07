// FSM «Lectura rápida en diagonal» — 1 vez por racha: gestos medianos y
// consecutivos, compatibles con un barrido rápido del contenido. `minCount` es
// un MÍNIMO: la racha acumula mientras los gestos sigan calificando y emite una
// sola vez al cortarse, con la cantidad real.
//
// Se corta con un gesto que no califica, con maxGapSeconds de silencio, o al
// terminar la sesión.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { isFullSweepToTop } from "../../lib/fullSweep";
import { BehaviorEventNames, type ScrollGesture, type ScrollStreakConfig } from "../../types";

const config: ScrollStreakConfig = {
  minCount: 2,
  maxGapSeconds: 20,
  minPx: 301,
  maxPx: 2500,
};

type Input = { gesture: ScrollGesture } | { closed: true };
type Ctx = { streak: number[]; startedAt: number; lastAt: number };

const qualifies = (gesture: ScrollGesture, cfg: ScrollStreakConfig) =>
  !isFullSweepToTop(gesture) && // volver al tope no es barrer contenido
  gesture.deltaPx >= (cfg.minPx ?? 0) &&
  gesture.deltaPx <= (cfg.maxPx ?? Infinity);

export const startDiagonalScroll = (cfg: ScrollStreakConfig = config) =>
  createFSM<Input, Ctx>({
    id: "diagonalScroll",
    initial: "watching",
    context: { streak: [], startedAt: 0, lastAt: 0 },
    states: {
      watching(input, ctx) {
        const close = () => {
          if (ctx.streak.length >= cfg.minCount) {
            gateway.emit(BehaviorEventNames.DiagonalScroll, {
              values: [
                { quantity: ctx.streak.length },
                { gestures: [...ctx.streak] },
                { span_seconds: +((ctx.lastAt - ctx.startedAt) / 1000).toFixed(3) },
              ],
            });
          }
          ctx.streak = [];
        };

        if ("closed" in input) {
          close();
          return;
        }
        if (!qualifies(input.gesture, cfg)) {
          close();
          return;
        }
        if (ctx.streak.length === 0) ctx.startedAt = input.gesture.timestamp;
        ctx.lastAt = input.gesture.timestamp;
        ctx.streak.push(Math.round(input.gesture.deltaPx));
      },
    },
    wire: send => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const onEnd = () => send({ closed: true });
      window.addEventListener("pagehide", onEnd);
      return [
        scrollYData.subscribe(gesture => {
          send({ gesture });
          if (timer) clearTimeout(timer);
          timer = setTimeout(onEnd, cfg.maxGapSeconds * 1000);
        }),
        () => {
          if (timer) clearTimeout(timer);
          window.removeEventListener("pagehide", onEnd);
        },
      ];
    },
  });
