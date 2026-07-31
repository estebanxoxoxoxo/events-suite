// Catálogo tipado de eventos: comportamiento (FSMs de la suite) + negocio
// (emitidos desde la app). Nombres como enums, payloads indexados por nombre.

import type { GeneralInfo, ScrollDirection } from "./sources";

// ── Comportamiento (FSMs) ────────────────────────────────────────────

export enum BehaviorEventNames {
  RelevantSession = "relevant_session",
  ActiveSession = "active_session",
  DepthScroll = "depth_scroll",
  ReadingScroll = "reading_scroll",
  SkimScroll = "skim_scroll",
  ToTopScroll = "to_top_scroll",
  DiagonalScroll = "diagonal_scroll",
  Bounce = "bounce",
  TotalClicks = "total_clicks",
  RageClick = "rage_click",
  ComponentFocus = "component_focus",
}

export interface BehaviorEvents {
  [BehaviorEventNames.RelevantSession]: { seconds: number; event_counts: Record<string, number> };
  [BehaviorEventNames.ActiveSession]: { seconds: number; scroll_depth: number };
  [BehaviorEventNames.DepthScroll]: { level: number; scroll_depth: number };
  [BehaviorEventNames.ReadingScroll]: { deltas_px: number[]; span_seconds: number };
  [BehaviorEventNames.SkimScroll]: { delta_px: number; direction: ScrollDirection };
  [BehaviorEventNames.ToTopScroll]: { delta_px: number; from_depth: number; to_depth: number };
  [BehaviorEventNames.DiagonalScroll]: { deltas_px: number[]; span_seconds: number };
  [BehaviorEventNames.Bounce]: { seconds: number };
  [BehaviorEventNames.TotalClicks]: { clicks: number };
  [BehaviorEventNames.RageClick]: { clicks: number; span_ms: number; x: number; y: number };
  [BehaviorEventNames.ComponentFocus]: {
    component: string;
    dwell_seconds: number;
    entered_from?: ScrollDirection;
    exited_to?: ScrollDirection;
  };
}

// ── Negocio (app → gateway) ──────────────────────────────────────────

export enum BusinessEventNames {
  PageView = "page_view",
  CtaClick = "cta_click",
  SubscribeClick = "subscribe_click",
  RegisterButtonClick = "register_button_click",
  SignUpStarted = "sign_up_started",
  SignUpCompleted = "sign_up_completed",
  Login = "login",
  LeadSubmitted = "lead_submitted",
  FormSubmitted = "form_submitted",
  Search = "search",
  ProductViewed = "product_viewed",
  AddToCart = "add_to_cart",
  RemoveFromCart = "remove_from_cart",
  CheckoutStarted = "checkout_started",
  PurchaseCompleted = "purchase_completed",
  VideoPlayed = "video_played",
}

/** Payload uniforme de negocio: lo específico de cada evento va en metadata. */
export interface BusinessEventPayload {
  eventType?: string;
  metadata?: Record<string, unknown>;
}

export interface BusinessEvents {
  [BusinessEventNames.PageView]: BusinessEventPayload;
  [BusinessEventNames.CtaClick]: BusinessEventPayload;
  [BusinessEventNames.SubscribeClick]: BusinessEventPayload;
  [BusinessEventNames.RegisterButtonClick]: BusinessEventPayload;
  [BusinessEventNames.SignUpStarted]: BusinessEventPayload;
  [BusinessEventNames.SignUpCompleted]: BusinessEventPayload;
  [BusinessEventNames.Login]: BusinessEventPayload;
  [BusinessEventNames.LeadSubmitted]: BusinessEventPayload;
  [BusinessEventNames.FormSubmitted]: BusinessEventPayload;
  [BusinessEventNames.Search]: BusinessEventPayload;
  [BusinessEventNames.ProductViewed]: BusinessEventPayload;
  [BusinessEventNames.AddToCart]: BusinessEventPayload;
  [BusinessEventNames.RemoveFromCart]: BusinessEventPayload;
  [BusinessEventNames.CheckoutStarted]: BusinessEventPayload;
  [BusinessEventNames.PurchaseCompleted]: BusinessEventPayload;
  [BusinessEventNames.VideoPlayed]: BusinessEventPayload;
}

// ── Unión ────────────────────────────────────────────────────────────

/** Todos los nombres. TS no une enums nativamente: objeto para usarlo como
 * valor (EventNames.RageClick) + tipo unión con el mismo nombre. */
export const EventNames = { ...BehaviorEventNames, ...BusinessEventNames } as const;
export type EventNames = BehaviorEventNames | BusinessEventNames;

/** Unión de ambos catálogos: nombre → payload. */
export interface Event extends BehaviorEvents, BusinessEvents {}

export type KnownEventName = keyof Event;

export type PayloadOf<N extends KnownEventName> = Event[N];

/** Contexto que el gateway adjunta a todo evento. */
export interface EventContext extends GeneralInfo {
  session_time_sec: number;
}

export interface EventEnvelope<N extends KnownEventName = KnownEventName> {
  name: N;
  properties: PayloadOf<N>;
  context: EventContext;
  /** ISO 8601. */
  timestamp: string;
}
