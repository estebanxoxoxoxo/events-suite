// FSM «Click» — 1 vez por click: emite dónde ocurrió, ni bien ocurre.
//
// La posición va como FRACCIÓN del documento (0..1), no en píxeles: 0.5 es la
// mitad de la página tanto en un monitor como en un teléfono, así que los
// clicks de todos los dispositivos caen en el mismo mapa. Parte de las
// coordenadas del DOCUMENTO (no del viewport), o sea que no importa el scroll.
//
// Sin config y sin estado terminal: vive toda la sesión. Al no depender de
// `pagehide` —como sí hacen bounce y las máquinas de cierre— tampoco arrastra
// el caveat de quedar encolado hasta la visita siguiente.

import { createFSM } from "./createFSM";
import { gateway } from "../../2-gateway";
import { clicks } from "../sources/clicks";
import { toDocumentFraction } from "../../lib/position";
import { BehaviorEventNames, type ClickData } from "../../types";

export const startClick = () =>
  createFSM<ClickData, Record<string, never>>({
    id: "click",
    initial: "watching",
    context: {},
    states: {
      watching(click) {
        gateway.emit(BehaviorEventNames.Click, {
          values: [{ click: toDocumentFraction(click.pageX, click.pageY) }],
        });
      },
    },
    wire: send => [clicks.subscribe(send)],
  });
