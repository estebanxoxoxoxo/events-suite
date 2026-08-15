// FSM «Component focus» — 1 vez por ocasión: el usuario llegó scrolleando a un
// componente etiquetado, se quedó mirándolo al menos minSeconds, y
// scrolleó a otra parte. La identidad del componente la resuelve el source
// focusedComponent; acá vive solo el patrón temporal. El dominante inicial
// (sin scroll previo) no cuenta: nadie "llegó" ahí.
//
// La ocasión se cierra SOLO al perder el foco: cuando otro componente pasa a
// dominar, o cuando ninguno domina. Sin temporizador de quietud a propósito —
// se probó y disparaba dos veces por la misma mirada. Consecuencia asumida: el
// último componente mirado antes de irse no se emite.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { focusedComponent } from "../sources/focusedComponent";
import { scrollYData } from "../sources/scrollYData";
import { BehaviorEventNames, type ComponentFocusConfig, type ScrollDirection } from "../../types";

const config: ComponentFocusConfig = {
  minSeconds: 6,
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
        // sin techo: una mirada larga es la señal más fuerte que hay, no un error
        const emitir = dwell >= cfg.minSeconds;

        if (emitir) {
          const exitedTo = scrollYData.liveDirection();
          gateway.emit(BehaviorEventNames.ComponentFocus, {
            values: [
              { component: focus.component },
              { dwell_seconds: +dwell.toFixed(2) },
              ...(focus.enteredFrom ? [{ entered_from: focus.enteredFrom }] : []),
              ...(exitedTo ? [{ exited_to: exitedTo }] : []),
            ],
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
