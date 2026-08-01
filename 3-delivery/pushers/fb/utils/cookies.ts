// Cookies de Meta (_fbp / _fbc). Son los dos campos que más suben el match rate
// de la CAPI, así que vale la pena leerlas siempre que se pueda.

export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// _fbp: id de navegador que setea el pixel. Si el pixel no cargó todavía, no existe.
export function getFbp(): string | undefined {
  return getCookie("_fbp");
}

// _fbc: identifica el CLIC en el anuncio. Si el pixel ya la seteó la usamos; si no,
// la reconstruimos desde el ?fbclid=... de la URL con el formato fb.1.<ts>.<fbclid>.
export function getFbc(): string | undefined {
  const existing = getCookie("_fbc");
  if (existing) return existing;
  if (typeof window === "undefined") return undefined;
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
}
