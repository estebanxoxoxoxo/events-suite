// FSM «Rage click» — 1 vez por ocasión: ráfaga de clicks que se asienta tras
// debounceMs sin actividad; dispara si alguna ventana de windowMs dentro de la
// ráfaga contiene count o más clicks.

import { createFSM } from "./createFSM";
import { gateway } from "../gateway";
import { clicks } from "../sources/clicks";
import { BehaviorEventNames, type ClickData, type RageClickConfig } from "../types";

const config: RageClickConfig = {
  count: 3,
  windowMs: 600,
  debounceMs: 200,
};

type Input = { click: ClickData } | { settled: true };
type Ctx = { burst: ClickData[] };

export const startRageClick = (cfg: RageClickConfig = config) =>
  createFSM<Input, Ctx>({
    id: "rageClick",
    initial: "watching",
    context: { burst: [] },
    states: {
      watching(input, ctx) {
        if ("click" in input) {
          ctx.burst.push(input.click);
          return;
        }
        const burst = ctx.burst;
        ctx.burst = []; // re-arma: la próxima ocasión necesita clicks nuevos
        const qualifies = burst.some((first, i) => {
          let n = 0;
          for (let j = i; j < burst.length && burst[j].timestamp - first.timestamp <= cfg.windowMs; j++) n++;
          return n >= cfg.count;
        });
        if (qualifies) {
          gateway.emit(BehaviorEventNames.RageClick, {
            clicks: burst.length,
            span_ms: burst[burst.length - 1].timestamp - burst[0].timestamp,
            x: burst[0].x,
            y: burst[0].y,
          });
        }
      },
    },
    wire: send => {
      // el debounce vive acá: cada click resetea el timer que cierra la ráfaga
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unsub = clicks.subscribe(click => {
        send({ click });
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => send({ settled: true }), cfg.debounceMs);
      });
      return [
        unsub,
        () => {
          if (timer) clearTimeout(timer);
        },
      ];
    },
  });
