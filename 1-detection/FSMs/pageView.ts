// FSM «Page view» — 1 vez por carga: la suite detecta que la página cargó.
//
// Es la única máquina sin source: el hecho ES el arranque. Por eso tampoco
// tiene payload — todo lo que se podría contar de una carga ya viaja en el
// sobre (`context.page`, `context.loaded_at`, referrer y campaign los pone el
// SDK). El evento es el dato.
//
// Vive acá y no en la app a propósito: la app no tiene que acordarse de
// emitirlo, y al entrar por el gateway lo ven TODOS los destinos por igual
// (bronze, presencia, reader, Meta). Un cliente no tiene entrada propia.

import { createFSM, DONE } from "./createFSM";
import { gateway } from "../../2-gateway";
import { BehaviorEventNames } from "../../types";

export const startPageView = () =>
  createFSM<{ loaded: true }, Record<string, never>>({
    id: "pageView",
    initial: "watching",
    context: {},
    states: {
      watching() {
        gateway.emit(BehaviorEventNames.PageView);
        return DONE;
      },
    },
    // en un tick aparte: createFSM llama a wire() ANTES de guardar las
    // suscripciones, y disparar en el mismo tick dejaría el teardown a medias
    wire: send => {
      const timer = setTimeout(() => send({ loaded: true }), 0);
      return [() => clearTimeout(timer)];
    },
  });
