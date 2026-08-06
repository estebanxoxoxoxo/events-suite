// FSM «Sesión relevante» — 1 vez por sesión: pasó el tiempo mínimo y los
// eventos de la suite cumplen todas las reglas (cada regla SUMA las
// ocurrencias de sus `events`). No conoce a las otras FSMs: cuenta
// escuchando el propio gateway.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../../2-gateway";
import { timeSession } from "../sources/timeSession";
import { BehaviorEventNames, type RelevantSessionConfig } from "../../types";

const config: RelevantSessionConfig = {
  minSeconds: 40,
  minEvents: [{ events: [BehaviorEventNames.ReadingScroll, BehaviorEventNames.DiagonalScroll], min: 5 }],
};

type Input = { seconds: number } | { event: string };
type Ctx = { seconds: number; counts: Record<string, number> };

export const startRelevantSession = (cfg: RelevantSessionConfig = config) => {
  const watched = new Set<string>(cfg.minEvents.flatMap(rule => rule.events));
  return createFSM<Input, Ctx>({
    id: "relevantSession",
    initial: "watching",
    context: { seconds: 0, counts: {} },
    states: {
      watching(input, ctx) {
        if ("seconds" in input) ctx.seconds = input.seconds;
        else ctx.counts[input.event] = (ctx.counts[input.event] ?? 0) + 1;

        const rulesOk = cfg.minEvents.every(
          rule => rule.events.reduce((sum, name) => sum + (ctx.counts[name] ?? 0), 0) >= rule.min,
        );
        if (ctx.seconds >= cfg.minSeconds && rulesOk) {
          gateway.emit(BehaviorEventNames.RelevantSession, {
            engaged_seconds: ctx.seconds,
            // una propiedad por evento contado: `event_counts` era un objeto de
            // claves dinámicas, lo peor posible para consultar en el lake
            ...Object.fromEntries(
              Object.entries(ctx.counts).map(([event, count]) => [`count_${event}`, count]),
            ),
          });
          return DONE;
        }
      },
    },
    wire: send => [
      timeSession.subscribe(seconds => send({ seconds })),
      // el gateway es un source más: solo pasan los nombres que alguna regla mira
      // (también evita re-entrar al handler con la emisión propia)
      gateway.subscribe(event => {
        if (watched.has(event.name)) send({ event: event.name });
      }),
    ],
  });
};
