// Registry de metadata de sesión: junta los tres orígenes (vercel: geo/IP de
// sesión vía /api/session-metadata, login: la empuja la app, fb: cookies +
// app) detrás de una sola superficie. Los pushers la leen al despachar
// (enriquecimiento tardío: lo que llega al minuto 3 alcanza a lo que siga en
// cola) y pueden suscribirse para reaccionar (p. ej. identify de RudderStack).

import type { SessionMetadata, Unsubscribe } from "../../../types";
import { collectVercelMetadata, getVercelMetadata, onVercelMetadata } from "./vercel";
import { getLoginMetadata, onLoginMetadata, setLoginMetadata } from "./login";
import { getFbMetadata, onFbMetadata, setFbMetadata } from "./fb";

export { collectVercelMetadata, setLoginMetadata, setFbMetadata };

export const sessionMetadata = {
  get(): SessionMetadata {
    return {
      vercel: getVercelMetadata(),
      login: getLoginMetadata(),
      fb: getFbMetadata(),
    };
  },

  /** Notifica con el snapshot completo cada vez que cambia cualquier origen. */
  subscribe(listener: (metadata: SessionMetadata) => void): Unsubscribe {
    const notify = () => listener(sessionMetadata.get());
    const unsubs = [onVercelMetadata(notify), onLoginMetadata(notify), onFbMetadata(notify)];
    return () => unsubs.forEach(unsub => unsub());
  },
};
