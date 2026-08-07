// FSM «Lectura» — 1 vez por racha: gestos cortos y consecutivos, compatibles
// con leer de corrido. `minCount` es un MÍNIMO, no un número exacto: la racha
// acumula mientras los gestos sigan calificando y emite una sola vez al
// cortarse, con la cantidad real. Siete tramos leídos seguidos son un evento de
// siete, no dos de tres.
//
// Se corta de tres formas: llega un gesto que no califica, pasan maxGapSeconds
// sin ninguno, o termina la sesión. Sin esas dos últimas, la racha final —la
// del que leyó hasta el fondo y se fue— quedaría colgada para siempre.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { isFullSweepToTop } from "../../lib/fullSweep";
import { BehaviorEventNames, type ScrollGesture, type ScrollStreakConfig } from "../../types";

const config: ScrollStreakConfig = {
  minCount: 3,
  maxGapSeconds: 20,
  maxPx: 300,
};

type Input = { gesture: ScrollGesture } | { closed: true };
type Ctx = { streak: number[]; startedAt: number; lastAt: number };

const qualifies = (gesture: ScrollGesture, cfg: ScrollStreakConfig) =>
  !isFullSweepToTop(gesture) && // la vuelta al tope no es lectura
  gesture.deltaPx >= (cfg.minPx ?? 0) &&
  gesture.deltaPx <= (cfg.maxPx ?? Infinity);

export const startReadingScroll = (cfg: ScrollStreakConfig = config) =>
  createFSM<Input, Ctx>({
    id: "readingScroll",
    initial: "watching",
    context: { streak: [], startedAt: 0, lastAt: 0 },
    states: {
      watching(input, ctx) {
        const close = () => {
          if (ctx.streak.length >= cfg.minCount) {
            gateway.emit(BehaviorEventNames.ReadingScroll, {
              values: [
                { quantity: ctx.streak.length },
                // el px de cada gesto, en orden: el total es su suma
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
          close(); // el gesto que rompe la racha la cierra
          return;
        }
        if (ctx.streak.length === 0) ctx.startedAt = input.gesture.timestamp;
        ctx.lastAt = input.gesture.timestamp;
        ctx.streak.push(Math.round(input.gesture.deltaPx));
      },
    },
    wire: send => {
      // el temporizador vive acá, como en rageClick: cada gesto lo reinicia
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
