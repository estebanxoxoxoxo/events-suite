// Taxonomía de eventos + forma de los datos que viajan al server.

// Eventos estándar de Meta (Pixel + Conversions API). Usar los estándar y no
// eventos custom es lo que habilita optimización de campaña por conversión.
export enum FbEvent {
  PageView = "PageView",
  ViewContent = "ViewContent",
  Search = "Search",
  Lead = "Lead",
  CompleteRegistration = "CompleteRegistration",
  Contact = "Contact",
  Schedule = "Schedule",
  SubmitApplication = "SubmitApplication",
  InitiateCheckout = "InitiateCheckout",
  AddToCart = "AddToCart",
  AddPaymentInfo = "AddPaymentInfo",
  StartTrial = "StartTrial",
  Subscribe = "Subscribe",
  Purchase = "Purchase",
}

// Datos personales para Advanced Matching. TODO esto se hashea con SHA-256 EN EL
// SERVER; nunca sale del navegador hacia Meta en crudo ni se guarda sin hashear.
export interface FbUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** ISO-3166-1 alpha-2: "AR", "US", ... */
  country?: string;
  /** Id propio y estable del usuario (uid, customer id). Ata eventos sin cookies. */
  externalId?: string;
}

// custom_data del evento. Obligatorio value + currency en Purchase.
export interface FbCustomData {
  value?: number;
  /** ISO-4217: "USD", "ARS", ... */
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
  search_string?: string;
  [key: string]: unknown;
}

// Payload exacto que recibe /api/send-server-event.
export interface ServerEventPayload {
  eventName: string;
  eventId: string;
  /** Atajo: email o teléfono en un solo string; el server decide cuál es. */
  contact?: string;
  userData?: FbUserData;
  customData?: FbCustomData;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
  actionSource?: "website" | "app" | "email" | "phone_call" | "chat" | "other";
  testEventCode?: string;
}
