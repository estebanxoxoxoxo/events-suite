// Metadata de sesión de Vercel: país, IP, ciudad, timezone… Son headers que el
// edge le pone al request (x-vercel-ip-*) y el navegador no puede leer por sí
// mismo, así que se piden UNA vez a /api/session-metadata (echo de esos
// headers; en dev lo mockea vite.config). Llega async: hasta entonces {} — los
// adapters enriquecen al despachar, así que lo encolado también la recibe.

import { createEmitter } from "../../../lib/emitter";
import type { VercelMetadata } from "../../../types";

const config = {
  endpoint: "/api/session-metadata",
};

const emitter = createEmitter<VercelMetadata>();

let vercel: VercelMetadata = {};
let requested = false;

/** Idempotente y SSR-safe. Arranque explícito desde la app (es red). */
export function collectVercelMetadata(endpoint: string = config.endpoint): void {
  if (requested || typeof window === "undefined") return;
  requested = true;
  fetch(endpoint)
    .then(response => (response.ok ? response.json() : null))
    .then((data: VercelMetadata | null) => {
      if (!data) return;
      vercel = data;
      emitter.emit(vercel);
    })
    .catch(() => {
      /* sin endpoint (p. ej. otro hosting): la suite sigue sin geo */
    });
}

export const getVercelMetadata = (): VercelMetadata => vercel;

export const onVercelMetadata = emitter.subscribe;
