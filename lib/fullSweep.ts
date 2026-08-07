// «Barrida completa al tope»: la frontera entre to_top_scroll y todo lo demás.
//
// Vive acá y no en una FSM porque la usan cuatro y tiene que ser LA misma: to_top
// se la queda, y skim, reading y diagonal la ceden. Con los números copiados en
// cada config, uno se desincroniza y el mismo gesto termina contado dos veces o
// ninguna.

import type { ScrollGesture } from "../types";

/** 0..1: sale de más profundo que `fromDepth` y aterriza más arriba que `toDepth`. */
export const FULL_SWEEP = {
  fromDepth: 0.8,
  toDepth: 0.2,
};

export const isFullSweepToTop = (gesture: ScrollGesture): boolean =>
  gesture.direction === "up" &&
  gesture.fromDepth > FULL_SWEEP.fromDepth &&
  gesture.scrollDepth < FULL_SWEEP.toDepth;
