// FSM «Lectura rápida en diagonal» — 1 vez por racha: gestos medianos y
// consecutivos, compatibles con un barrido rápido del contenido. `minCount` es
// un MÍNIMO: la racha acumula mientras los gestos sigan calificando y emite una
// sola vez al cortarse, con la cantidad real.
//
// Un gesto tiene TRES destinos, no dos: cuenta, es transparente, o corta.
// Quedarse CORTO de la banda no contradice la diagonal en curso: es el que
// micro-ajusta el centro de lo que está mirando, y eso pasa mientras barre. Ese
// gesto es transparente — ni suma ni corta, esta FSM no lo ve. Pasarse de la
// banda sí es otra intención (barrido largo, salto al tope) y ahí corta.
//
// Los tramos cortos no se pierden: son la banda de `reading_scroll`, que los
// cuenta si van hacia abajo. Un micro-ajuste hacia arriba no es evento de nadie.
// Las dos FSMs corren en paralelo sobre el mismo source: el usuario puede estar
// centrando con tramos cortos mientras la diagonal sigue agregando.
//
// Se corta con un gesto que se pasa de la banda, con maxGapSeconds de silencio,
// o al terminar la sesión.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { scrollYData } from "../sources/scrollYData";
import { isFullSweepToTop } from "../../lib/fullSweep";
import { BehaviorEventNames, type ScrollGesture, type ScrollStreakConfig } from "../../types";

const config: ScrollStreakConfig = {
  minCount: 2,
  maxGapSeconds: 7,
  minPx: 301,
  maxPx: 2500,
};

type Input = { gesture: ScrollGesture } | { closed: true };
type Ctx = { streak: number[]; startedAt: number; lastAt: number };

/** `ignored` es la diferencia con las otras rachas: el gesto no entra pero
 * tampoco cierra. En cualquier dirección — el micro-ajuste sube y baja. */
type Verdict = "counts" | "ignored" | "breaks";

const judge = (gesture: ScrollGesture, cfg: ScrollStreakConfig): Verdict => {
  if (isFullSweepToTop(gesture)) return "breaks"; // volver al tope no es barrer contenido
  if (gesture.deltaPx < (cfg.minPx ?? 0)) return "ignored";
  if (gesture.deltaPx > (cfg.maxPx ?? Infinity)) return "breaks";
  return "counts";
};

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
        // los tres destinos, explícitos. El wire ya filtra los transparentes,
        // pero la FSM tiene que ser correcta sin depender de quién la alimenta.
        const verdict = judge(input.gesture, cfg);
        if (verdict === "ignored") return;
        if (verdict === "breaks") {
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
          // el transparente tampoco reinicia el hueco: así `maxGapSeconds` sigue
          // midiendo lo que dice —el tiempo entre dos gestos DIAGONALES— y una
          // racha no se estira sola a fuerza de micro-ajustes.
          if (judge(gesture, cfg) === "ignored") return;
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
