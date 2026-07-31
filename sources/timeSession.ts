// Source «timeSession»: segundos desde el inicio de la sesión, tick de a 1 s.

import { createEmitter } from "./emitter";

const emitter = createEmitter<number>();

let seconds = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export const timeSession = {
  getSeconds: () => seconds,
  /** El listener recibe el contador en cada tick. */
  subscribe: emitter.subscribe,
  start() {
    if (timer) return;
    timer = setInterval(() => emitter.emit(++seconds), 1000);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
  },
};
