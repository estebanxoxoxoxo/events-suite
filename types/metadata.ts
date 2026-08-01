// Tipos de la metadata de sesión (registry en metadata/).

/** Lo que Vercel sabe de la SESIÓN (headers x-vercel-ip-* del edge, servidos
 * por /api/session-metadata) + datos del deploy que ese endpoint adjunta. */
export interface VercelMetadata {
  ip?: string;
  country?: string;
  region?: string;
  city?: string;
  postal_code?: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  deployment?: {
    env?: string;
    url?: string;
    commit?: string;
    branch?: string;
  };
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
  vercel: VercelMetadata;
  login: LoginMetadata;
  fb: FbMetadata;
}
