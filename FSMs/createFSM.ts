// Runtime mínimo de FSM: un handler puro por estado; "done" es terminal
// y suelta automáticamente las suscripciones hechas en wire().

import type { FSM, FSMDef } from "../types";

export const DONE = "done";

export function createFSM<Input, Ctx>(def: FSMDef<Input, Ctx>): FSM<Input> {
  let state = def.initial;
  let subs: Array<() => void> = [];

  const teardown = () => {
    subs.forEach(unsub => unsub());
    subs = [];
  };

  const send = (input: Input) => {
    if (state === DONE) return;
    const next = def.states[state]?.(input, def.context);
    if (!next) return;
    state = next;
    if (state === DONE) teardown();
  };

  const fsm: FSM<Input> = {
    get state() {
      return state;
    },
    send,
    stop() {
      state = DONE;
      teardown();
    },
  };

  subs = def.wire(send);
  return fsm;
}
