// Adapter de RudderStack: función PURA, sin IO — envelope + metadata → track.
// Negocio se aplana (event_type + metadata al tope) para mantener properties
// chatas como espera bronze; comportamiento pasa tal cual. El message_id viaja
// en properties para correlacionar con la dedup de la capa plata.

import { BusinessEventNames } from "../../types";
import type { BusinessEventPayload, EventEnvelope, SessionMetadata } from "../../types";

const BUSINESS = new Set<string>(Object.values(BusinessEventNames));

export interface RudderTrackCall {
  event: string;
  properties: Record<string, unknown>;
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

  const { metaDataFromHosting } = metadata;
  const hasHosting = Boolean(
    metaDataFromHosting.supplier || metaDataFromHosting.country || metaDataFromHosting.ip,
  );

  return {
    event: envelope.name,
    properties: {
      ...flat,
      message_id: envelope.message_id,
      suite: {
        session_time_sec: envelope.context.session_time_sec,
        loaded_at: envelope.context.loaded_at,
        ...(hasHosting ? { metaDataFromHosting } : {}),
      },
    },
  };
}
