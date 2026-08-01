// Id único por evento. Es la clave de la deduplicación: el pixel y la CAPI mandan
// el MISMO id para el mismo hecho, y Meta cuenta una sola conversión.
export function createEventId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
