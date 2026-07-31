// FSM «Scroll depth» — un evento independiente por nivel alcanzado;
// cada nivel dispara una única vez por sesión.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../gateway";
import { scrollYData } from "../sources/scrollYData";
import type { ScrollDepthConfig } from "../types";

const config: ScrollDepthConfig = {
  levels: [25, 50, 75, 90],
};

type Input = { depth: number };
type Ctx = { pending: number[] };

export const startScrollDepth = (cfg: ScrollDepthConfig = config) =>
  createFSM<Input, Ctx>({
    id: "scrollDepth",
    initial: "watching",
    context: { pending: [...cfg.levels].sort((a, b) => a - b) },
    states: {
      watching({ depth }, ctx) {
        const pct = depth * 100;
        while (ctx.pending.length > 0 && pct >= ctx.pending[0]) {
          gateway.emit("scroll_depth", { level: ctx.pending.shift()!, scroll_depth: depth });
        }
        if (ctx.pending.length === 0) return DONE;
      },
    },
    wire: send => [scrollYData.subscribe(gesture => send({ depth: gesture.scrollDepth }))],
  });
