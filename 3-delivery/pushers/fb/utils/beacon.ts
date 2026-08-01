// Envío resiliente al cierre/navegación de la pestaña: navigator.sendBeacon con
// fallback a fetch keepalive. Imprescindible para el Lead que se dispara justo
// antes de un redirect (login con Google, checkout): un fetch normal se cancela.
export function postBeacon(url: string, payload: unknown): void {
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      // El type application/json hace que Vercel/Express parseen el body solos.
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    /* cae al fetch de abajo */
  }

  try {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* tracking nunca debe romper la página */
  }
}
