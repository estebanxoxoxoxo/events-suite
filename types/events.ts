// Catálogo tipado de eventos: comportamiento (FSMs de la suite) + negocio
// (emitidos desde la app). Nombres como enums, payloads indexados por nombre.

import type { GeneralInfo, ScrollDirection } from "./sources";

// ── Comportamiento (FSMs) ────────────────────────────────────────────

export enum BehaviorEventNames {
  RelevantSession = "relevant_session",
  ActiveSession = "active_session",
  Scroll25 = "scroll_25",
  Scroll50 = "scroll_50",
  Scroll75 = "scroll_75",
  Scroll90 = "scroll_90",
  ReadingScroll = "reading_scroll",
  SkimScroll = "skim_scroll",
  ToTopScroll = "to_top_scroll",
  DiagonalScroll = "diagonal_scroll",
  Bounce = "bounce",
  Click = "click",
  RageClick = "rage_click",
  ComponentFocus = "component_focus",
}

/** TODAS las propiedades del evento viajan dentro de `values`: un array donde
 * cada item es UNA propiedad, ya con su nombre — `{ "quantity": 3 }`. Un solo
 * contenedor para todos los eventos, así el que los lee no necesita conocer el
 * esquema de cada uno para recorrerlos. */
export type Values<T> = { [K in keyof Required<T>]: Pick<Required<T>, K> }[keyof Required<T>][];

export interface BehaviorEvents {
  [BehaviorEventNames.RelevantSession]: { values: Values<RelevantSessionValues> };
  [BehaviorEventNames.ActiveSession]: { values: Values<ActiveSessionValues> };
  /** El umbral está en el nombre del evento, así que el payload no lo repite:
   * lleva CUÁNTO TARDÓ en llegar, que es lo que el nombre no dice. */
  [BehaviorEventNames.Scroll25]: { values: Values<ScrollMilestoneValues> };
  [BehaviorEventNames.Scroll50]: { values: Values<ScrollMilestoneValues> };
  [BehaviorEventNames.Scroll75]: { values: Values<ScrollMilestoneValues> };
  [BehaviorEventNames.Scroll90]: { values: Values<ScrollMilestoneValues> };
  [BehaviorEventNames.ReadingScroll]: { values: Values<ScrollStreakValues> };
  [BehaviorEventNames.DiagonalScroll]: { values: Values<ScrollStreakValues> };
  [BehaviorEventNames.SkimScroll]: { values: Values<SkimScrollValues> };
  [BehaviorEventNames.ToTopScroll]: { values: Values<ToTopScrollValues> };
  [BehaviorEventNames.Bounce]: { values: Values<BounceValues> };
  [BehaviorEventNames.Click]: { values: Values<ClickValues> };
  [BehaviorEventNames.RageClick]: { values: Values<RageClickValues> };
  [BehaviorEventNames.ComponentFocus]: { values: Values<ComponentFocusValues> };
}

/** `engaged_seconds` en los eventos de sesión y en los hitos: todos leen el
 * mismo reloj de atención (timeSession), no el de pared. */
type RelevantSessionValues = { engaged_seconds: number } & Partial<
  Record<`count_${BehaviorEventNames}`, number>
>;

interface ActiveSessionValues {
  engaged_seconds: number;
  scroll_depth: number;
}

interface BounceValues {
  engaged_seconds: number;
}

/** Hito de profundidad: segundos de atención hasta cruzarlo. */
interface ScrollMilestoneValues {
  engaged_seconds: number;
}

/** Racha de gestos: cuántos, el detalle px de cada uno en orden, y cuánto duró.
 * `quantity` es `gestures.length` — redundante a propósito, para no tener que
 * contar el array en cada consulta. */
interface ScrollStreakValues {
  quantity: number;
  gestures: number[];
  span_seconds: number;
}

interface SkimScrollValues {
  delta_px: number;
  direction: ScrollDirection;
}

interface ToTopScrollValues {
  delta_px: number;
  from_depth: number;
  to_depth: number;
}

/** Un click, un evento: `x`/`y` como FRACCIÓN del documento (0..1), no en
 * píxeles — así el mismo punto significa lo mismo en mobile y en desktop.
 * Escalares separados, como en rage_click: cada medición es una punta simple
 * y aguas abajo se vuelve una columna propia. */
interface ClickValues {
  x: number;
  y: number;
}

/** `quantity` = clicks de la ráfaga, mismo nombre que en las rachas. `x`/`y`
 * son fracción del documento, como en `click`. */
interface RageClickValues {
  quantity: number;
  span_ms: number;
  x: number;
  y: number;
}

interface ComponentFocusValues {
  component: string;
  dwell_seconds: number;
  entered_from?: ScrollDirection;
  exited_to?: ScrollDirection;
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
