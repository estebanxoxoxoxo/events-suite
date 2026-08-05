// Registry de metadata de sesión: junta los tres orígenes (hosting: geo/IP de
// sesión vía /api/get-vercel-session-metadata, login: la empuja la app, fb: cookies +
// app) detrás de una sola superficie. Los pushers la leen al despachar
// (enriquecimiento tardío: lo que llega al minuto 3 alcanza a lo que siga en
// cola) y pueden suscribirse para reaccionar (p. ej. identify de RudderStack).

import type { SessionMetadata, Unsubscribe } from "../../../types";
import { collectHostingMetadata, getHostingMetadata, onHostingMetadata } from "./hosting";
import { getIdentityMetadata, onIdentityMetadata, setIdentityMetadata } from "./identity";
import { getLoginMetadata, onLoginMetadata, setLoginMetadata } from "./login";
import { getFbMetadata, onFbMetadata, setFbMetadata } from "./fb";

export { collectHostingMetadata, setIdentityMetadata, setLoginMetadata, setFbMetadata };

export const sessionMetadata = {
  get(): SessionMetadata {
    return {
      metaDataFromHosting: getHostingMetadata(),
      identity: getIdentityMetadata(),
      login: getLoginMetadata(),
      fb: getFbMetadata(),
    };
  },

  /** Notifica con el snapshot completo cada vez que cambia cualquier origen. */
  subscribe(listener: (metadata: SessionMetadata) => void): Unsubscribe {
    const notify = () => listener(sessionMetadata.get());
    const unsubs = [
      onHostingMetadata(notify),
      onIdentityMetadata(notify),
      onLoginMetadata(notify),
      onFbMetadata(notify),
    ];
    return () => unsubs.forEach(unsub => unsub());
  },
};
