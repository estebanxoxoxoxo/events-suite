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
  login: LoginMetadata;
  fb: FbMetadata;
}
