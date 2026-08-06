// FSM «Scroll de lectura» — 1 vez por ocasión: racha de gestos cortos
// compatible con lectura. Un gesto fuera de rango corta la racha.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { BehaviorEventNames, type ScrollGesture, type ScrollStreakConfig } from "../../types";

const config: ScrollStreakConfig = {
  count: 3,
  windowSeconds: 20,
  maxPx: 301,
};

type Ctx = { streak: { px: number; at: number }[] };

const inRange = (px: number, { minPx = 0, maxPx = Infinity }: ScrollStreakConfig) =>
  px > minPx && px < maxPx;

export const startReadingScroll = (cfg: ScrollStreakConfig = config) =>
  createFSM<ScrollGesture, Ctx>({
    id: "readingScroll",
    initial: "watching",
    context: { streak: [] },
    states: {
      watching(gesture, ctx) {
        if (!inRange(gesture.deltaPx, cfg)) {
          ctx.streak = [];
          return;
        }
        const windowMs = cfg.windowSeconds * 1000;
        ctx.streak = [...ctx.streak, { px: gesture.deltaPx, at: gesture.timestamp }].filter(
          s => gesture.timestamp - s.at < windowMs,
        );
        if (ctx.streak.length < cfg.count) return;
        gateway.emit(BehaviorEventNames.ReadingScroll, {
          values: [
            { quantity: ctx.streak.length },
            // el detalle px de cada gesto, en orden: el total es su suma
            { gestures: ctx.streak.map(s => Math.round(s.px)) },
            { span_seconds: (gesture.timestamp - ctx.streak[0].at) / 1000 },
          ],
        });
        ctx.streak = []; // re-arma: la próxima ocasión necesita gestos nuevos
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
