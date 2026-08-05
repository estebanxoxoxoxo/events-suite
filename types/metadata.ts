// Tipos de la metadata de sesión (registry en metadata/).

/** Metadata de sesión que aporta el HOSTING (headers del edge servidos por
 * /api/get-vercel-session-metadata). `supplier` identifica al proveedor (acá: "vercel"). */
export interface HostingMetadata {
  supplier?: string;
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  postal_code?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
}

/** La genera el SDK de RudderStack; la publica su pusher. `anonymous_id` es el
 * id del NAVEGADOR (persistido: sobrevive recargas, pestañas y visitas de otro
 * día) y es la clave para agrupar pestañas en personas. */
export interface IdentityMetadata {
  anonymous_id?: string;
  session_id?: string;
}

/** La empuja la app post-auth vía setLoginMetadata(). */
export interface LoginMetadata {
  user_id?: string | number;
  email?: string;
  name?: string;
  method?: string;
  [key: string]: unknown;
}

/** Cookies de Meta auto-recolectadas + lo que empuje la app vía setFbMetadata(). */
export interface FbMetadata {
  fbp?: string;
  fbc?: string;
  [key: string]: unknown;
}

export interface SessionMetadata {
  metaDataFromHosting: HostingMetadata;
  identity: IdentityMetadata;
  login: LoginMetadata;
  fb: FbMetadata;
}
