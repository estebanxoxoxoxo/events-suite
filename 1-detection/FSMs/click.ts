// FSM «Click» — 1 vez por sesión: acumula los clicks y, al terminar la sesión
// (pagehide, igual que bounce), emite el total y el mapa de dónde ocurrieron.
//
// Las coordenadas son las del DOCUMENTO, no las del viewport: así un click en
// el mismo botón cae siempre en el mismo punto, haya scrolleado o no.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../../2-gateway";
import { clicks } from "../sources/clicks";
import { BehaviorEventNames, type ClickConfig, type ClickPoint } from "../../types";

const config: ClickConfig = {
  minClicks: 0,
};

type Input = { click: ClickPoint } | { sessionEnd: true };
type Ctx = { points: ClickPoint[] };

export const startClick = (cfg: ClickConfig = config) =>
  createFSM<Input, Ctx>({
    id: "click",
    initial: "watching",
    context: { points: [] },
    states: {
      watching(input, ctx) {
        if ("click" in input) {
          ctx.points.push(input.click);
          return;
        }
        if (ctx.points.length >= cfg.minClicks) {
          gateway.emit(BehaviorEventNames.Click, {
            values: [{ name: "clicks", value: ctx.points.length }],
            coordinates: ctx.points,
          });
        }
        return DONE;
      },
    },
    wire: send => {
      const onEnd = () => send({ sessionEnd: true });
      window.addEventListener("pagehide", onEnd);
      return [
        clicks.subscribe(click => send({ click: { x: click.pageX, y: click.pageY } })),
        () => window.removeEventListener("pagehide", onEnd),
      ];
    },
  });
