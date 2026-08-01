// Metadata de login: la empuja la app cuando la tiene (post-auth).
// Se guarda cruda en memoria; cada adapter decide qué mandar y cómo
// (FB la hashea en el server vía CAPI, RudderStack la lleva a traits).

import { createEmitter } from "../../../lib/emitter";
import type { LoginMetadata } from "../../../types";

const emitter = createEmitter<LoginMetadata>();

let login: LoginMetadata = {};

/** Merge acumulativo: se puede llamar varias veces (uid primero, email después). */
export function setLoginMetadata(data: Partial<LoginMetadata>): void {
  login = { ...login, ...data };
  emitter.emit(login);
}

export const getLoginMetadata = (): LoginMetadata => login;

export const onLoginMetadata = emitter.subscribe;
