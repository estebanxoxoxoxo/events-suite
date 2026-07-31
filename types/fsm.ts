// Configs y contratos de las FSMs.

import type { KnownEventName } from "./events";
import type { Unsubscribe } from "./sources";

/** Sesión relevante / activa: umbral de tiempo + profundidad. */
export interface SessionMilestoneConfig {
  minSeconds: number;
  /** 0..1 */
  minScrollDepth: number;
}

/** Regla de eventos: la SUMA de ocurrencias de `events` debe alcanzar `min`. */
export interface EventCountRule {
  events: KnownEventName[];
  min: number;
}

/** Sesión relevante: tiempo mínimo + reglas de eventos (todas deben cumplirse). */
export interface RelevantSessionConfig {
  minSeconds: number;
  minEvents: EventCountRule[];
}

export interface ScrollDepthConfig {
  /** Porcentajes (0..100); cada nivel dispara una única vez. */
  levels: number[];
}

/** Racha: `count` gestos consecutivos dentro del rango de px, en menos de `windowSeconds`. */
export interface ScrollStreakConfig {
  count: number;
  windowSeconds: number;
  /** Cada gesto debe medir más que esto (si se define). */
  minPx?: number;
  /** Cada gesto debe medir menos que esto (si se define). */
  maxPx?: number;
}

/** Scroll despectivo: un solo gesto que supere `minPx`, partiendo de profundidad ≤ `maxFromDepth`. */
export interface SkimScrollConfig {
  minPx: number;
  /** 0..1: por encima de esto el gesto es territorio de toTopScroll. */
  maxFromDepth: number;
}

/** Vuelta al tope: un gesto hacia arriba que supere `minPx`, partiendo de profundidad > `minDepth`. */
export interface ToTopScrollConfig {
  minPx: number;
  /** 0..1: profundidad en la que estaba el usuario antes del gesto. */
  minDepth: number;
}

/** Bounce: la sesión termina antes de `maxSeconds`. */
export interface BounceConfig {
  maxSeconds: number;
}

/** Total de clicks: al terminar la sesión emite el acumulado. */
export interface TotalClicksConfig {
  /** Solo emite si el total llegó a esto (0 = emitir siempre). */
  minClicks: number;
}

/** Rage click: ráfaga (asentada tras `debounceMs` sin clicks) con alguna ventana de `windowMs` conteniendo `count` o más. */
export interface RageClickConfig {
  count: number;
  windowMs: number;
  debounceMs: number;
}

/** Component focus: llegó por scroll, se quedó entre min y max segundos, y scrolleó a otra parte. */
export interface ComponentFocusConfig {
  minSeconds: number;
  maxSeconds: number;
}

// ── Runtime ──────────────────────────────────────────────────────────

export interface FSM<Input> {
  readonly state: string;
  send(input: Input): void;
  /** Fuerza el estado terminal y suelta las suscripciones. */
  stop(): void;
}

export interface FSMDef<Input, Ctx> {
  id: string;
  initial: string;
  context: Ctx;
  /** Un handler por estado: devuelve el próximo estado para transicionar ("done" es terminal) o nada para quedarse. */
  states: Record<string, (input: Input, ctx: Ctx) => string | void>;
  /** Conecta el FSM a sus sources; los teardowns corren al llegar a "done" o con stop(). */
  wire(send: (input: Input) => void): Unsubscribe[];
}
