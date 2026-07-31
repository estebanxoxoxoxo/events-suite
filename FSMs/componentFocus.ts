// FSM «Component focus» — 1 vez por ocasión: el usuario llegó scrolleando a un
// componente etiquetado, se quedó mirándolo entre minSeconds y maxSeconds, y
// scrolleó a otra parte. La identidad del componente la resuelve el source
// focusedComponent; acá vive solo el patrón temporal. El dominante inicial
// (sin scroll previo) no cuenta: nadie "llegó" ahí.

import { createFSM } from "./createFSM";
import { gateway } from "../gateway";
import { focusedComponent } from "../sources/focusedComponent";
import { scrollYData } from "../sources/scrollYData";
import { BehaviorEventNames, type ComponentFocusConfig, type ScrollDirection } from "../types";

const config: ComponentFocusConfig = {
  minSeconds: 4,
  maxSeconds: 20,
};

type Input = { component: string | null; at: number };

type Focus = { component: string; since: number; enteredFrom: ScrollDirection | null };
type Ctx = { focus: Focus | null };

const arm = (component: string, at: number): Focus => ({
  component,
  since: at,
  // dirección viva del scroll de llegada: disponible ya, sin esperar el gesto
  enteredFrom: scrollYData.liveDirection(),
});

export const startComponentFocus = (cfg: ComponentFocusConfig = config) =>
  createFSM<Input, Ctx>({
    id: "componentFocus",
    initial: "watching",
    context: { focus: null },
    states: {
      watching(input, ctx) {
        // llegada válida = ya hubo scroll crudo. Tiene que ser el flag crudo:
        // el cambio de dominante dispara DURANTE el scroll, antes de que
        // asiente el gesto — esperar el gesto perdía la primera llegada.
        if (input.component && scrollYData.hasScrolled()) {
          ctx.focus = arm(input.component, input.at);
          return "focused";
        }
      },
      focused(input, ctx) {
        const focus = ctx.focus!;
        const dwell = (input.at - focus.since) / 1000;
        if (dwell >= cfg.minSeconds && dwell <= cfg.maxSeconds) {
          const exitedTo = scrollYData.liveDirection();
          gateway.emit(BehaviorEventNames.ComponentFocus, {
            component: focus.component,
            dwell_seconds: +dwell.toFixed(2),
            ...(focus.enteredFrom ? { entered_from: focus.enteredFrom } : {}),
            ...(exitedTo ? { exited_to: exitedTo } : {}),
          });
        }
        if (input.component) {
          ctx.focus = arm(input.component, input.at); // encadena al siguiente
          return;
        }
        ctx.focus = null;
        return "watching";
      },
    },
    wire: send => [
      focusedComponent.subscribe(change => send({ component: change.component, at: change.at })),
    ],
  });
