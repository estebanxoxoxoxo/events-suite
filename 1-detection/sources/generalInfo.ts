// Source «generalInfo»: ruta y viewport, siempre frescos — más el instante de
// carga de la aplicación, capturado una sola vez al evaluarse el módulo
// (constante durante toda la sesión; cambia recién con una recarga).

import type { GeneralInfo } from "../../types";

const loadedAt = new Date().toISOString();

export const generalInfo = {
  get(): GeneralInfo {
    if (typeof window === "undefined") {
      return { page: "/", resolution: { width: 0, height: 0 }, loaded_at: loadedAt };
    }
    const { pathname, search, hash } = window.location;
    return {
      page: `${pathname}${search}${hash}` || "/",
      resolution: { width: window.innerWidth, height: window.innerHeight },
      loaded_at: loadedAt,
    };
  },
};
