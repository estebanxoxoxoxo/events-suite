// Adapter de Meta: función PURA, sin IO — envelope + metadata + mapping →
// conversión de Meta (o null si el evento no mapea a ninguna). El eventId es
// el message_id del envelope: pixel, CAPI y bronze deduplican con el mismo id.

import type {
  BusinessEventPayload,
  EventEnvelope,
  KnownEventName,
  SessionMetadata,
} from "../../types";
import type { FbCustomData, FbEvent, FbUserData } from "../pushers/fb/utils/types";
import type { PushOptions } from "../pushers/fb/pushEvent";

export type FbEventMapping = Partial<Record<KnownEventName, FbEvent>>;

export interface FbPushCall {
  event: FbEvent;
  options: PushOptions;
}

export function toFbPush(
  envelope: EventEnvelope,
  metadata: SessionMetadata,
  mapping: FbEventMapping,
): FbPushCall | null {
  const event = mapping[envelope.name];
  if (!event) return null;

  const business = (envelope.properties ?? {}) as BusinessEventPayload;
  const data = (business.metadata ?? {}) as Record<string, unknown>;

  const customData: FbCustomData = {};
  if (typeof data.value === "number") customData.value = data.value;
  if (typeof data.currency === "string") customData.currency = data.currency;
  if (typeof data.num_items === "number") customData.num_items = data.num_items;
  if (business.eventType) customData.content_category = business.eventType;

  const { login } = metadata;
  const userData: FbUserData = {
    ...(login.email ? { email: login.email } : {}),
    ...(login.user_id !== undefined ? { externalId: String(login.user_id) } : {}),
  };

  return {
    event,
    options: {
      eventId: envelope.message_id,
      ...(Object.keys(customData).length > 0 ? { customData } : {}),
      ...(Object.keys(userData).length > 0 ? { userData } : {}),
    },
  };
}
