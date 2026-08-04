// Metadata de sesión del HOSTING: país, IP, ciudad, timezone… Son headers que
// el edge le pone al request y el navegador no puede leer por sí mismo, así
// que se piden UNA vez a /api/get-vercel-session-metadata (echo de esos headers, con
// `supplier` identificando al proveedor — acá: vercel; mock en vite.config
// para dev). Llega async: hasta entonces {} — los adapters enriquecen al
// despachar, así que lo encolado también la recibe.

import { createEmitter } from "../../../lib/emitter";
import type { HostingMetadata } from "../../../types";

const config = {
  endpoint: "/api/get-vercel-session-metadata",
};

const emitter = createEmitter<HostingMetadata>();

let hosting: HostingMetadata = {};
let requested = false;

/** Idempotente y SSR-safe. Arranque explícito vía startDelivery (es red). */
export function collectHostingMetadata(endpoint: string = config.endpoint): void {
  if (requested || typeof window === "undefined") return;
  requested = true;
  fetch(endpoint)
    .then(response => (response.ok ? response.json() : null))
    .then((data: HostingMetadata | null) => {
      if (!data) return;
      hosting = data;
      emitter.emit(hosting);
    })
    .catch(() => {
      /* sin endpoint (p. ej. hosting sin la función): la suite sigue sin geo */
    });
}

export const getHostingMetadata = (): HostingMetadata => hosting;

export const onHostingMetadata = emitter.subscribe;
