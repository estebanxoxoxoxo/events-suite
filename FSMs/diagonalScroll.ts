// FSM «Lectura rápida en diagonal» — 1 vez por ocasión: racha de gestos
// medianos compatible con un barrido rápido del contenido.

import { createFSM } from "./createFSM";
import { gateway } from "../gateway";
import { scrollYData } from "../sources/scrollYData";
import type { ScrollGesture, ScrollStreakConfig } from "../types";

const config: ScrollStreakConfig = {
  count: 2,
  windowSeconds: 20,
  minPx: 300,
  maxPx: 2501,
};

type Ctx = { streak: { px: number; at: number }[] };

const inRange = (px: number, { minPx = 0, maxPx = Infinity }: ScrollStreakConfig) =>
  px > minPx && px < maxPx;

export const startDiagonalScroll = (cfg: ScrollStreakConfig = config) =>
  createFSM<ScrollGesture, Ctx>({
    id: "diagonalScroll",
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
        gateway.emit("diagonal_scroll", {
          deltas_px: ctx.streak.map(s => s.px),
          span_seconds: (gesture.timestamp - ctx.streak[0].at) / 1000,
        });
        ctx.streak = []; // re-arma: la próxima ocasión necesita gestos nuevos
      },
    },
    wire: send => [scrollYData.subscribe(send)],
  });
