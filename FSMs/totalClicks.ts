// FSM «Total de clicks» — 1 vez por sesión: acumula clicks y, al terminar la
// sesión (pagehide, igual que bounce), emite el total.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../gateway";
import { clicks } from "../sources/clicks";
import type { TotalClicksConfig } from "../types";

const config: TotalClicksConfig = {
  minClicks: 0,
};

type Input = { click: true } | { sessionEnd: true };
type Ctx = { total: number };

export const startTotalClicks = (cfg: TotalClicksConfig = config) =>
  createFSM<Input, Ctx>({
    id: "totalClicks",
    initial: "watching",
    context: { total: 0 },
    states: {
      watching(input, ctx) {
        if ("click" in input) {
          ctx.total += 1;
          return;
        }
        if (ctx.total >= cfg.minClicks) {
          gateway.emit("total_clicks", { clicks: ctx.total });
        }
        return DONE;
      },
    },
    wire: send => {
      const onEnd = () => send({ sessionEnd: true });
      window.addEventListener("pagehide", onEnd);
      return [
        clicks.subscribe(() => send({ click: true })),
        () => window.removeEventListener("pagehide", onEnd),
      ];
    },
  });
