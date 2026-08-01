// La pata del navegador: fbq. El snippet del pixel va en el <head> del HTML
// (ver README); acá solo lo usamos si está cargado.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function isPixelReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}

// Dispara el evento en el pixel pasando eventID: es lo que permite que Meta
// deduplique contra el mismo evento llegado por CAPI.
export function sendFbBrowserEvent(
  eventName: string,
  eventId: string,
  params?: Record<string, unknown>
): void {
  if (!isPixelReady()) return;
  window.fbq!("track", eventName, params || {}, { eventID: eventId });
}
