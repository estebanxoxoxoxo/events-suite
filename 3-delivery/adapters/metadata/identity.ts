// Identidad que genera el SDK de RudderStack: el `anonymous_id` del navegador
// (persistido, sobrevive recargas y visitas) y el `session_id` de la sesión en
// curso. La publica el pusher de rudderstack apenas carga el SDK.
//
// Vive acá y no en un pusher porque la necesita más de uno: presencia agrupa
// pestañas por `anonymous_id` (un nodo es una pestaña, no una persona). Los
// pushers no se hablan entre sí: todos pasan por este registry.

import { createEmitter } from "../../../lib/emitter";
import type { IdentityMetadata } from "../../../types";

const emitter = createEmitter<IdentityMetadata>();

let identity: IdentityMetadata = {};

/** Merge acumulativo e idempotente: solo emite si algo cambió — el pusher la
 * refresca en cada despacho y el session_id rota tras 30 min de inactividad. */
export function setIdentityMetadata(data: Partial<IdentityMetadata>): void {
  const next = { ...identity, ...data };
  if (next.anonymous_id === identity.anonymous_id && next.session_id === identity.session_id) return;
  identity = next;
  emitter.emit(identity);
}

export const getIdentityMetadata = (): IdentityMetadata => identity;

export const onIdentityMetadata = emitter.subscribe;
