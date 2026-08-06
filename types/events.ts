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
  Click = "click",
  RageClick = "rage_click",
  ComponentFocus = "component_focus",
}

/** Una medición. Los eventos con valores los mandan como lista uniforme, para
 * que silver los desanide sin conocer el esquema de cada evento. Solo métricas:
 * lo categórico (`component`, `direction`) viaja como propiedad suelta, porque
 * es con lo que agrupás, no lo que medís. */
export interface EventValue<N extends string = string, V = number> {
  name: N;
  value: V;
}

export interface BehaviorEvents {
  [BehaviorEventNames.RelevantSession]: {
    values: EventValue<"seconds" | `count_${BehaviorEventNames}`>[];
  };
  [BehaviorEventNames.ActiveSession]: { values: EventValue<"seconds" | "scroll_depth">[] };
  [BehaviorEventNames.DepthScroll]: { values: EventValue<"level" | "scroll_depth">[] };
  [BehaviorEventNames.ReadingScroll]: { values: EventValue<ScrollStreakValue>[] };
  [BehaviorEventNames.SkimScroll]: {
    direction: ScrollDirection;
    values: EventValue<"delta_px">[];
  };
  [BehaviorEventNames.ToTopScroll]: {
    values: EventValue<"delta_px" | "from_depth" | "to_depth">[];
  };
  [BehaviorEventNames.DiagonalScroll]: { values: EventValue<ScrollStreakValue>[] };
  [BehaviorEventNames.Bounce]: { values: EventValue<"engaged_seconds">[] };
  /** Un click, un evento. Un solo value: el par `[x, y]` en coordenadas del
   * DOCUMENTO (no del viewport), que ubican el click en la página sin importar
   * el scroll. La tupla obliga a que sea exactamente esa entrada. */
  [BehaviorEventNames.Click]: { values: [EventValue<"click", ClickPoint>] };
  [BehaviorEventNames.RageClick]: {
    values: EventValue<"clicks" | "span_ms" | "x" | "y">[];
  };
  [BehaviorEventNames.ComponentFocus]: {
    component: string;
    entered_from?: ScrollDirection;
    exited_to?: ScrollDirection;
    values: EventValue<"dwell_seconds">[];
  };
}

/** Los deltas individuales de la racha se resumen: un array adentro de `value`
 * no lo desanida cómodo ningún motor, y lo que se consulta es el agregado. */
type ScrollStreakValue = "gestures" | "total_px" | "span_seconds";

/** Coordenada de un click: `[x, y]`. Es el único `value` que no es un número
 * suelto — `values` sigue siendo siempre la lista de entradas `{name, value}`. */
export type ClickPoint = [number, number];

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
  /** Segundos de ATENCIÓN (pestaña visible), no de reloj: el de reloj sale de
   * `timestamp - loaded_at`. Ver el source timeSession. */
  engaged_time_sec: number;
}

export interface EventEnvelope<N extends KnownEventName = KnownEventName> {
  name: N;
  properties: PayloadOf<N>;
  context: EventContext;
  /** Id único de la ocurrencia: clave de dedup en bronze/plata y eventID de
   * Meta. Distinto del `messageId` del SDK, que identifica el despacho. */
  event_id: string;
  /** ISO 8601. */
  timestamp: string;
}
