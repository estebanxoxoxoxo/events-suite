// Adapter de RudderStack: función PURA, sin IO — envelope + metadata → track.
// Negocio se aplana (event_type + metadata al tope) para mantener properties
// chatas como espera bronze; comportamiento pasa tal cual. El event_id viaja
// en properties para correlacionar con la dedup de la capa plata: NO es el
// `message_id` de la raíz, que lo genera el SDK al despachar.
//
// Lo que es ENTORNO va a context, no a properties: geo/IP son ambiente, y ese
// es el reparto del spec. Viaja por las options del SDK, que mergea toda clave
// no reservada dentro de context (reservadas: library, consentManagement,
// userAgent, ua-ch, screen). Así el geo cae en `context.ip`/`context.location`,
// donde cualquier warehouse lo aplana solo como context_location_*, en vez de
// quedar en un blob propietario adentro de properties.

import { BusinessEventNames } from "../../types";
import type { BusinessEventPayload, EventEnvelope, SessionMetadata } from "../../types";

const BUSINESS = new Set<string>(Object.values(BusinessEventNames));

export interface RudderTrackCall {
  event: string;
  properties: Record<string, unknown>;
  /** ApiOptions del SDK: `originalTimestamp` pisa el campo top-level del
   * evento; el resto lo mergea el SDK adentro de `context`. */
  options: Record<string, unknown>;
}

export function toRudderTrack(envelope: EventEnvelope, metadata: SessionMetadata): RudderTrackCall {
  const raw = envelope.properties as Record<string, unknown> | undefined;

  let flat: Record<string, unknown>;
  if (BUSINESS.has(envelope.name)) {
    const business = (raw ?? {}) as BusinessEventPayload;
    flat = {
      ...(business.eventType ? { event_type: business.eventType } : {}),
      ...(business.metadata ?? {}),
    };
  } else {
    flat = { ...(raw ?? {}) };
  }

  const hosting = metadata.metaDataFromHosting;
  const location: Record<string, unknown> = {
    ...(hosting.city ? { city: hosting.city } : {}),
    ...(hosting.country ? { country: hosting.country } : {}),
    ...(hosting.region ? { region: hosting.region } : {}),
    ...(hosting.latitude ? { latitude: hosting.latitude } : {}),
    ...(hosting.longitude ? { longitude: hosting.longitude } : {}),
    ...(hosting.postal_code ? { postal_code: hosting.postal_code } : {}),
  };

  const context: Record<string, unknown> = {
    // ancla de la carga de página: `timestamp - loaded_at` es el tiempo real
    // transcurrido, y agrupa los eventos de una misma carga (sessionId no: una
    // sesión de 30 min puede tener varias)
    loaded_at: envelope.context.loaded_at,
    ...(hosting.ip ? { ip: hosting.ip } : {}),
    ...(Object.keys(location).length > 0 ? { location } : {}),
    // no hay campo estándar para "quién reportó esto"
    ...(hosting.supplier ? { hosting: { supplier: hosting.supplier } } : {}),
    // hosting.timezone se DESCARTA a propósito: el SDK ya pone el del
    // navegador, que es el real; el del edge es una adivinanza desde la IP
  };

  return {
    event: envelope.name,
    properties: {
      ...flat,
      event_id: envelope.event_id,
      suite: { engaged_time_sec: envelope.context.engaged_time_sec },
    },
    options: {
      // la ocurrencia REAL: sin esto, lo que esperó en cola heredaría la hora
      // del despacho. Semántica estándar, cero columnas nuevas.
      originalTimestamp: envelope.timestamp,
      context,
    },
  };
}
