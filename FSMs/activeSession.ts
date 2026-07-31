// FSM «Sesión activa» — 1 vez por sesión: el usuario interactuó lo suficiente
// como para considerar la sesión activa.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../gateway";
import { scrollYData } from "../sources/scrollYData";
import { timeSession } from "../sources/timeSession";
import { BehaviorEventNames, type SessionMilestoneConfig } from "../types";

const config: SessionMilestoneConfig = {
  minSeconds: 15,
  minScrollDepth: 0.5,
};

type Input = { seconds: number } | { depth: number };
type Ctx = { seconds: number; maxDepth: number };

export const startActiveSession = (cfg: SessionMilestoneConfig = config) =>
  createFSM<Input, Ctx>({
    id: "activeSession",
    initial: "watching",
    context: { seconds: 0, maxDepth: 0 },
    states: {
      watching(input, ctx) {
        if ("seconds" in input) ctx.seconds = input.seconds;
        else ctx.maxDepth = Math.max(ctx.maxDepth, input.depth);
        if (ctx.seconds >= cfg.minSeconds && ctx.maxDepth >= cfg.minScrollDepth) {
          gateway.emit(BehaviorEventNames.ActiveSession, { seconds: ctx.seconds, scroll_depth: ctx.maxDepth });
          return DONE;
        }
      },
    },
    wire: send => [
      timeSession.subscribe(seconds => send({ seconds })),
      scrollYData.subscribe(gesture => send({ depth: gesture.scrollDepth })),
    ],
  });
