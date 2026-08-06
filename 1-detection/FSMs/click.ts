// FSM «Click» — 1 vez por click: emite dónde ocurrió, ni bien ocurre.
//
// Las coordenadas son las del DOCUMENTO, no las del viewport: así un click en
// el mismo botón cae siempre en el mismo punto, haya scrolleado o no. Las de
// pantalla quedan para rageClick, que juzga cercanía en el monitor.
//
// Sin config y sin estado terminal: vive toda la sesión. Al no depender de
// `pagehide` —como sí hacen bounce y las máquinas de cierre— tampoco arrastra
// el caveat de quedar encolado hasta la visita siguiente.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { clicks } from "../sources/clicks";
import { BehaviorEventNames, type ClickData } from "../../types";

export const startClick = () =>
  createFSM<ClickData, Record<string, never>>({
    id: "click",
    initial: "watching",
    context: {},
    states: {
      watching(click) {
        gateway.emit(BehaviorEventNames.Click, {
          values: [{ name: "click", value: [click.pageX, click.pageY] }],
        });
      },
    },
    wire: send => [clicks.subscribe(send)],
  });
