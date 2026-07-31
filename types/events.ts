// Catálogo tipado de eventos: los que emiten las FSMs + los típicos de producto.

import type { GeneralInfo, ScrollDirection } from "./sources";

/** Emitidos por las FSMs de la suite. */
export interface SuiteEventPayloads {
  session_relevant: { seconds: number; event_counts: Record<string, number> };
  session_active: { seconds: number; scroll_depth: number };
  scroll_depth: { level: number; scroll_depth: number };
  reading_scroll: { deltas_px: number[]; span_seconds: number };
  skim_scroll: { delta_px: number; direction: ScrollDirection };
  to_top_scroll: { delta_px: number; from_depth: number; to_depth: number };
  diagonal_scroll: { deltas_px: number[]; span_seconds: number };
  bounce: { seconds: number };
  total_clicks: { clicks: number };
  rage_click: { clicks: number; span_ms: number; x: number; y: number };
  component_focus: {
    component: string;
    dwell_seconds: number;
    entered_from?: ScrollDirection;
    exited_to?: ScrollDirection;
  };
}

/** Típicos de producto, para emitir desde cualquier parte de la app. */
export interface AppEventPayloads {
  page_view: { page?: string };
  cta_click: { cta_id?: string; label?: string };
  subscribe_click: { source?: string; attempt_id?: string };
  sign_up_started: { method?: string; attempt_id?: string };
  sign_up_completed: { method?: string; user_id?: string; attempt_id?: string };
  login: { method?: string; user_id?: string };
  lead_submitted: { form_id?: string; source?: string };
  form_submitted: { form_id?: string };
  search: { query: string };
  product_viewed: { product_id: string; name?: string; price?: number; currency?: string };
  add_to_cart: { product_id: string; name?: string; price?: number; quantity?: number; currency?: string };
  remove_from_cart: { product_id: string; quantity?: number };
  checkout_started: { value?: number; currency?: string; num_items?: number };
  purchase_completed: { order_id: string; value: number; currency?: string; num_items?: number };
  video_played: { video_id?: string; position_sec?: number };
}

export interface EventPayloads extends SuiteEventPayloads, AppEventPayloads {}

export type KnownEventName = keyof EventPayloads;

/** Conocidos (con autocompletado) sin cerrar la puerta a nombres custom. */
export type EventName = KnownEventName | (string & {});

export type PayloadOf<N extends EventName> = N extends KnownEventName
  ? EventPayloads[N]
  : Record<string, unknown>;

/** Contexto que el gateway adjunta a todo evento. */
export interface EventContext extends GeneralInfo {
  session_time_sec: number;
}

export interface EventEnvelope<N extends EventName = EventName> {
  name: N;
  properties?: PayloadOf<N>;
  context: EventContext;
  /** ISO 8601. */
  timestamp: string;
}
